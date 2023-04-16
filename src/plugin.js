"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
const _ = require('underscore');
const fs = require('fs').promises;
var crypto = require('crypto');
const path = require('path');
const commonUtils = require('./commonUtils.js');
const originalRequire = require("../scripts/originalRequire");




/**
 * Plugin management class
 */
 class Plugin {


    static pluginsLoaded = false;
    static plugins = {};
    static pluginsFolder;
    static coreModule;
    static publicServers = []; // list of public servers that are available to the plugins
    static triggers = {}; // triggers that are available to the plugins

    initialized = false;
    id;
    version;
    name;
    description;
    active = false;
    configuration = {};
    confDescriptions = [];
    dbItem;
    status;
    error = "";
    staticPlugIns = [];
    pluginInitResponse;
    publicRoutes = [];
    sessionType = undefined;


    static PLUGIN_STATUS_NOT_ACTIVE = 0;
    static PLUGIN_STATUS_ERROR = 1;
    static PLUGIN_STATUS_LOADED = 2;


    /**
     * Constructor
     * @param {*} dbItem
     */
    constructor(dbItem) {
        this.id = dbItem.id;
        this.version = dbItem.version;
        this.name = dbItem.name;
        this.description = dbItem.description;
        this.active = dbItem.active == 1 ? true : false;
        if (dbItem.configuration) {
            try {
                this.configuration = JSON.parse(dbItem.configuration);
            } catch (err) {
                logger.error(`Error parsing configuration for plugin ${this.id}. err: ${err}`,err);
            }
        }
        if (!this.configuration) {
            this.configuration = {};
        }
        this.dbItem = dbItem;
        this.status = Plugin.PLUGIN_STATUS_NOT_ACTIVE;
        this.initialized = false;
    }


    static async fileExists(filepath) {
        try {
            await fs.access(filepath);
            return true;
        } catch (e) {
            return false;
        }
    }

    async updatePluginFolderIfNeeded() {
        try {
            if (!this.pluginFolderPath) {
                throw new Error("this.pluginFolderPath is missing");
            }
            let packageHashFile = path.join(this.pluginFolderPath,"packagehash");
            if (await Plugin.fileExists(packageHashFile)) {
                let existingHash = await fs.readFile(packageHashFile,"utf-8");
                if (existingHash.trim() == this.dbItem.packagehash) {
                    logger.info(`packagehash in folder (${existingHash}) is the same as databse hash (${this.dbItem.packagehash})`);
                    return;
                } else {
                    logger.info(`packagehash in folder (${existingHash}) is not the same as databse hash (${this.dbItem.packagehash})`);
                }
            }
            logger.info(`Updating plugin folder`);
            // check if path exist and delete it
            if (Plugin.fileExists(this.pluginFolderPath)) {
                // delete existing path
                await fs.rm(this.pluginFolderPath,{recursive: true});
            }
            // create plugin folder
            await fs.mkdir(this.pluginFolderPath, { recursive: true });

            //read package buffer from db
            let itemWithPackage = await Common.db.Plugins.findOne({
                //attributes: ['id','packagehash','package'],
                where: {
                    id: this.dbItem.id
                },
            });

            //copy package file to foler
            let packagePath = path.join(this.pluginFolderPath,"package.tgz");
            await fs.writeFile(packagePath,itemWithPackage.package);

            // extract the package into the folder
            let mainPackage = await Plugin.buildPluginFolder(this.pluginFolderPath,packagePath,this,this.dbItem.id);

            // write the packagehash
            await fs.writeFile(packageHashFile,itemWithPackage.packagehash,"utf-8");

            return mainPackage;

        } catch (err) {
            logger.error(`updatePluginFolderIfNeeded Error. id: ${this.id}, err: ${err}`,err);
        }
    }

    /**
     *
     * @returns Initialize the plugin. If plugin is active load it into memory
     */
    async init() {
        try {
            if (!this.id || !this.dbItem) {
                throw new Error(`init. Invalid plugin item`);
            }

            Plugin.plugins[this.id] = this;

            logger.info(`Init plugin: ${this.id}.`);
            this.pluginFolderName = `plugin_${this.id}`;
            this.pluginFolderPath = path.join(Plugin.pluginsFolder,this.pluginFolderName);

            await this.updatePluginFolderIfNeeded();

            let packageJsonMain = await fs.readFile(path.join(this.pluginFolderPath,"package.json"),"utf-8");
            // logger.info(`Main package.json: ${packageJsonMain}`);
            this.mainPackage = JSON.parse(packageJsonMain);

            this.moduleJS = path.join(this.pluginFolderPath,this.mainPackage.main);
            let module =  originalRequire.require(this.moduleJS);
            this.pluginModule = module.getPluginModule();
            // this.vm = vm;
            // this.vm.sandbox.pluginModule = this.pluginModule;
            if (!this.pluginModule) {
                throw new Error("Plugin module not found in package");
            }
            if (typeof this.pluginModule.init !== 'function') {
                throw new Error("Init not found in plugin module");
            }

            if (this.pluginModule.getConfDesciptions) {
                this.confDescriptions = this.pluginModule.getConfDesciptions();
            }

            if (!this.active) {
                return;
            }

            // calling plugin init
            logger.info(`Calling plugin init..`);
            let core = Object.assign({
                pluginId : this.id,
                pluginName : this.name,
                pluginVersion : this.version,
                plugin: {
                    sendMessageToPlugin: async (pluginId, message) => {
                        await Plugin.sendMessageToPlugin(pluginId, message);
                    },
                    defineDBModel: (modelName, modelDefinition, options) => {
                        options = options || {};
                        options.tableName = `p_${this.id}_${modelName}`.replaceAll("-","_").toLowerCase();
                        logger.info(`defineDBModel. modelName: ${modelName} , modelDefinition: ${JSON.stringify(modelDefinition)}, options: ${JSON.stringify(options)}`);
                        return Common.sequelize.define(modelName, modelDefinition, options);
                    }
                }
            }, Plugin.getCoreModule());
            this.pluginInitResponse =  this.pluginModule.init(core,this.configuration);
            logger.info(`Plugin initialized!`);
            if (this.pluginInitResponse) {
                this.addPublicServerHandlers();
                if (this.pluginInitResponse.staticFoldersPlugins) {
                    this.staticPlugIns = this.pluginInitResponse.staticFoldersPlugins;
                    await this.initStaticPlugins();
                }
                this.addTriggers();
                if (this.pluginInitResponse.sessionType) {
                    this.sessionType = this.pluginInitResponse.sessionType;
                    // mark reload of session types
                    require('./SessionController').reloadSessionTypesCache();
                }
            }

            this.status = Plugin.PLUGIN_STATUS_LOADED;
            this.initialized = true;
        } catch (err) {
            this.status = Plugin.PLUGIN_STATUS_ERROR;
            this.error = `Error initializing plugin: ${err}`;
            logger.error(`Error initializing plugin. id: ${this.id}, err: ${err}`,err);
        }
    }

    async deinit(removeStaticPlugins) {
        try {
            this.status = Plugin.PLUGIN_STATUS_NOT_ACTIVE;
            this.initialized = false;
            if (this.pluginModule) {
                if (this.pluginModule.deinit) {
                    this.pluginModule.deinit();
                }
                this.pluginModule = undefined;

            }
            if (this.moduleJS) {
                originalRequire.unrequire(this.moduleJS);
                this.moduleJS = undefined;
            }
            if (removeStaticPlugins) {
                await this.removeStaticPlugins();
            }
            this.removePublicServerHandlers();
            this.removeTriggers();



        } catch (err) {
            this.status = Plugin.PLUGIN_STATUS_ERROR;
            this.error = `Error deinitializing plugin: ${err}`;
            logger.error(`Error deinitializing plugin. id: ${this.id}, err: ${err}`,err);
        }

    }

    /**
     * Initialize static folders plugins available in the plugin
     */
    async initStaticPlugins() {
        try {
            if (Common.isDaemonProcess) {
                // logger.info(`initStaticPlugins. Not initializing static plugins in daemon process`);
                return;
            }
            if (!Common.isRestServer) {
                // logger.info(`initStaticPlugins. Not initializing static plugins in non restserver process`);
                return;
            }
            const Static = require('./staticFolders');
            for (const staticPlugIn of this.staticPlugIns) {
                let staticFolder = staticPlugIn.staticFolder;
                let pluginName = this.id;
                let srcPath = path.join(path.dirname(this.moduleJS),staticPlugIn.path);
                Static.addPluginToStaticFolder(staticFolder,srcPath,pluginName); // do not wait for this
            }
        } catch (err) {
            logger.error(`initStaticPlugins Error. id: ${this.id}, err: ${err}`,err);
        }
    }

    /**
     * Remove static folders plugins available in the plugin
     * @returns
     */
    async removeStaticPlugins() {
        try {
            if (Common.isDaemonProcess) {
                return;
            }
            const Static = require('./staticFolders');
            for (const staticPlugIn of this.staticPlugIns) {
                let staticFolder = staticPlugIn.staticFolder;
                let pluginName = this.id;
                Static.removePluginFromStaticFolder(staticFolder,pluginName); // do not wait for this
            }
            this.staticPlugIns = [];

        } catch (err) {
            logger.error(`removeStaticPlugins Error. id: ${this.id}, err: ${err}`,err);
        }
    }


    /**
     * Add public server handlers
     */
    addPublicServerHandlers(newServer) {
        // add handlers to public servers
        if (this.pluginInitResponse && this.pluginInitResponse.publicServerHandlers) {
            for (const publicServerHandler of this.pluginInitResponse.publicServerHandlers) {
                if (newServer) {
                    // add only to the new server
                    const route = newServer[publicServerHandler.method](publicServerHandler.path,publicServerHandler.handler);
                    // logger.info(`Added public server handler. plugin: ${this.id}, method: ${publicServerHandler.method}, path: ${publicServerHandler.path}, route: ${route}, server: ${newServer.name}`);
                    this.publicRoutes.push({route : route, server: newServer});
                } else {
                    // add to existing servers
                    for (const server of Plugin.publicServers) {
                        const route = server[publicServerHandler.method](publicServerHandler.path,publicServerHandler.handler);
                        // logger.info(`Added public server handler. plugin: ${this.id}, method: ${publicServerHandler.method}, path: ${publicServerHandler.path}, route: ${route}, server: ${server.name}`);
                        this.publicRoutes.push({route : route, server: server});
                    }
                }
            }
        }
        // call triqger handlers
    }

    /**
     * Remove public server handlers
     */
    removePublicServerHandlers() {
        // remove handlers from public servers
        for (const publicRoute of this.publicRoutes) {
            publicRoute.server.rm(publicRoute.route);
            // logger.info(`Removed public server handler. plugin: ${this.id}, route: ${publicRoute.route}, server: ${publicRoute.server.name}`);
        }
        this.publicRoutes = [];
    }

    /**
     * Add triggers to static triggers list
     */
    addTriggers() {
        if (this.pluginInitResponse && this.pluginInitResponse.triggers) {
            for (const trigger of this.pluginInitResponse.triggers) {
                const triggerKey = `${trigger.objectType}_${trigger.action}`;
                Plugin.triggers[triggerKey] = Plugin.triggers[triggerKey] || [];
                Plugin.triggers[triggerKey].push({pluginId: this.id, trigger: trigger});
                // logger.info(`Added trigger. plugin: ${this.id}, trigger: ${triggerKey}`);
            }
        }
    }

    /**
     * Remove triggers from static triggers list
     */
    removeTriggers() {
        if (this.pluginInitResponse && this.pluginInitResponse.triggers) {
            for (const trigger of this.pluginInitResponse.triggers) {
                const triggerKey = `${trigger.objectType}_${trigger.action}`;
                if (Plugin.triggers[triggerKey]) {
                    const index = Plugin.triggers[triggerKey].findIndex((item) => item.pluginId === this.id);
                    if (index >= 0) {
                        Plugin.triggers[triggerKey].splice(index,1);
                        // logger.info(`Removed trigger. plugin: ${this.id}, trigger: ${triggerKey}`);
                    }
                }
            }
        }
    }

    /**
     * Invoke async trigger in all plugins and wait for result
     * Only one plugin can return a non null result and the result will be returned
     * @param {*} objectType
     * @param {*} action
     * @param  {...any} params
     * @returns {Promise} - return the first non null result or null
     */
    static async invokeTriggerWaitForResult(objectType, action, ...params) {
        try {
            // logger.info(`invokeTriggerWaitForResult. objectType: ${objectType}, action: ${action}, params: ${params.length}`);
            const triggerKey = `${objectType}_${action}`;
            if (Plugin.triggers[triggerKey]) {
                for (const trigger of Plugin.triggers[triggerKey]) {
                    const plugin = Plugin.plugins[trigger.pluginId];
                    if (plugin) {
                        try {
                            const result = await trigger.trigger.handler(objectType,action,...params);
                            if (result !== null) {
                                return result;
                            }
                        } catch (err) {
                            logger.error(`Error invoking trigger. plugin: ${plugin.id}, trigger: ${triggerKey}, err: ${err}`,err);
                        }
                    }
                }
            } else {
                logger.info(`No trigger found. objectType: ${objectType}, action: ${action}`);
            }
        } catch (err) {
            logger.error(`Error invoking trigger. objectType: ${objectType}, action: ${action}, err: ${err}`,err);
        }
        return null;
    }

    /**
     * Invoke trigger in all plugins
     * @param {*} objectType
     * @param {*} action
     * @param  {...any} params
     */
    static invokeTrigger(objectType, action, ...params) {
        try {
            const triggerKey = `${objectType}_${action}`;
            if (Plugin.triggers[triggerKey]) {
                for (const trigger of Plugin.triggers[triggerKey]) {
                    const plugin = Plugin.plugins[trigger.pluginId];
                    if (plugin) {
                        try {
                            let result = trigger.trigger.handler(objectType,action,...params);
                            if (result !== null && result instanceof Promise) {
                                // special case - if the result is a promise, wait for it and print the result
                                result.then((result) => {
                                }).catch((err) => {
                                    logger.error(`Error invoking trigger. plugin: ${plugin.id}, trigger: ${triggerKey}, err: ${err}`,err);
                                });
                            }
                        } catch (err) {
                            logger.error(`Error invoking trigger. plugin: ${plugin.id}, trigger: ${triggerKey}, err: ${err}`,err);
                        }
                    }
                }
            }
        } catch (err) {
            logger.error(`Error invoking trigger. objectType: ${objectType}, action: ${action}, err: ${err}`,err);
        }
    }




    /**
     *
     * @returns
     */
    static getCoreModule() {
        if (!Plugin.coreModule) {
            Plugin.coreModule =
            {
                Common,
                Login: require('./login.js'),
                Otp: require('./otp.js'),
                CommonUtils: require("./commonUtils.js"),
                UserUtils: require("./userUtils.js"),
                User: require("./user.js"),
                Session: require('./session').Session,
                SessionController: require('./SessionController'),
                Settings: require('./settings'),
                nubocronAPI: require('./nubocronAPI'),
                nuboCronJobs: require('./nuboCronJobs'),
                AddProfilesToGroup: require('./ControlPanel/addProfilesToGroup'),
                RemoveProfilesFromGroup: require('./ControlPanel/removeProfilesFromGroup.js'),
                DeleteGroups: require('./ControlPanel/deleteGroups.js'),
                Notifications: require('./Notifications.js'),
                updateSecurityPolicy: require('./ControlPanel/updateSecurityPolicy.js'),
                DaemonTools: require('./daemonTools.js'),
                FrontEndService: require('./frontEndService'),
                StartSession: require('./StartSession'),
                Service: require("./service.js"),
                redis: {
                    sendCommand: async (command, ...params) => {
                        if (!Common.redisClient[command]) {
                            throw new Error(`Redis command not found: ${command}`);
                        } else {
                            // console.log(`sendCommand: ${command}`);sssss
                        }
                        return await Common.redisClient[command](...params);
                    }
                },
            };
        }
        return Plugin.coreModule;
    }

    /**
     * Load all plugins from database and initialize all active plugins
     */
    static async loadFromDB() {
        if (!Common.pluginsEnabled) {
            throw new Error("Plugins are disabled!");
        }
        if (Plugin.pluginsLoaded) {
            logger.info(`Plugins already loaded`);
            return
        }
        try {
            logger.info(`Load plugins`);
            Plugin.pluginsFolder = path.resolve(Common.rootDir,"plugins");
            await fs.mkdir(Plugin.pluginsFolder, { recursive: true });
            let results = await Common.db.Plugins.findAll({
                attributes: ['id','version','name','description','active','packagehash','configuration'],
            }); // get alll records
            logger.info(`loadFromDB. results: ${results.length}`);
            for (const dbItem of results) {
                let plugin = new Plugin(dbItem);
                // initialize plugin
                await plugin.init();
            }
            Plugin.pluginsLoaded = true;
            Common.redisSub.subscribe("plugin", (message) => {
                // logger.info(`Message from redis plugin channel: ${message}`);
                Plugin.handleMessage(message);
            });

        } catch (err) {
            logger.error(`Error loading plugins from db: ${err}`,err);
        }
    }

    /**
     * Handle message from plugin channel
     * @param {*} message
     */
    static async handleMessage(message) {
        try {
            // logger.info(`handleMessage. message: ${message}`);
            const msg = JSON.parse(message);
            if (msg.pluginId) {
                const oldPlugin = Plugin.plugins[msg.pluginId];
                if (msg.command == "init") {
                    // load the plugin from db
                    let dbItem = await Common.db.Plugins.findOne({
                        attributes: ['id','version','name','description','active','packagehash','configuration'],
                        where: {
                            id: msg.pluginId
                        },
                    });
                    if (!dbItem) {
                        logger.error(`handleMessage. Plugin not found: ${msg.pluginId}`);
                        return;
                    }
                    if (oldPlugin) {
                        logger.info(`handleMessage. Reinitialize plugin: ${msg.pluginId}`);
                        if (oldPlugin.initialized) {
                            await oldPlugin.deinit(dbItem.active == 0);
                        }
                    } else {
                        logger.info(`handleMessage. New plugin: ${msg.pluginId}`);
                    }
                    let plugin = new Plugin(dbItem);
                    // initialize plugin
                    await plugin.init();
                } else if (msg.command == "delete") {
                    if (oldPlugin) {
                        logger.info(`handleMessage. Delete plugin: ${msg.pluginId}`);
                        if (oldPlugin.initialized) {
                            await oldPlugin.deinit(true);
                        }
                        delete Plugin.plugins[msg.pluginId];
                    }
                } else if (msg.command == "pluginMessage") {
                    if (oldPlugin) {
                        // logger.info(`handleMessage. Message to plugin: ${msg.pluginId}`);
                       const fnName = "handleMessage";
                        if (oldPlugin.status == Plugin.PLUGIN_STATUS_LOADED && oldPlugin.pluginModule ) {
                            if (fnName in oldPlugin.pluginModule && typeof oldPlugin.pluginModule[fnName] === "function") {
                                oldPlugin.pluginModule[fnName](msg.message);
                            }
                        }
                    }
                } else {
                    logger.error(`handleMessage. Command not found: ${message}`);
                }
            } else {
                logger.error(`Invalid message: ${message}`);
            }
        } catch (err) {
            logger.error(`Error handling message: ${err}`,err);
        }
    }

    /**
     * Send message to all processes that handle plugins
     * @param {*} msg
     */
    static sendMessage(msg) {
        try {
            // logger.info(`sendMessage. message: ${JSON.stringify(msg,null,2)}`);
            Common.redisClient.publish("plugin", JSON.stringify(msg));
        } catch (err) {
            logger.error(`Error sending message: ${err}`,err);
        }
    }

    static async sendMessageToPlugin(pluginId, message) {
        Plugin.sendMessage({command: "pluginMessage", pluginId: pluginId, message: message});
    }

    /**
     * Return number of loaded plugins
     * @returns
     */
    static getLoadedPluginsCount() {
        if (!Plugin.pluginsLoaded) {
           return 0;
        }
        let cnt = Object.keys(Plugin.plugins).length;
        return cnt;
    }

    /**
     * Get plugin by id
     * @param {*} id
     * @returns plugin or null
     */
    static getPluginById(id) {
        return Plugin.plugins[id];
    }

    /**
     * Return all plugin details
     * @param {*} req
     * @param {*} res
     */
    static async getAll(req,res) {
        if (!Plugin.pluginsLoaded) {
            await Plugin.loadFromDB()
        }
        try {
            let results = [];
            for (const id in Plugin.plugins) {
                const plugin = Plugin.plugins[id];
                results.push(_.pick(plugin,"id","version","name","description","active","status","error"));
            }
            // logger.info(`getAll. results: ${JSON.stringify(results,null,2)}`);
            res.send({
                status: Common.STATUS_OK,
                message: "Request was fulfilled",
                results
            });
        } catch (err) {
            logger.error(`Error: ${err}`,err);
            res.send({
                status: Common.STATUS_ERROR,
                message: "Internal error"
            });
        }
    }

    /**
     * get plugin details
     * @param {*} id
     * @param {*} req
     * @param {*} res
     */
    static async getPlugin(id,req,res) {
        if (!Plugin.pluginsLoaded) {
            await Plugin.loadFromDB()
        }
        try {
            const plugin = Plugin.plugins[id];
            if (!plugin) {
                throw new Error(`Plugin not found: ${id}`);
            }
            let pluginRes = _.pick(plugin,"id","version","name","description","active","status","error","configuration","confDescriptions")
            // logger.info(`getPlugin. configuration: s${JSON.stringify(pluginRes.configuration,null,2)}`);
            res.send({
                status: Common.STATUS_OK,
                message: "Request was fulfilled",
                plugin: pluginRes
            });
        } catch (err) {
            logger.error(`Error: ${err}`,err);
            res.send({
                status: Common.STATUS_ERROR,
                message: "Internal error"
            });
        }
    }



    /**
     * Remove plugin
     * @param {*} id
     * @param {*} req
     * @param {*} res
     */
    static async delete(id,req,res) {
        if (!Plugin.pluginsLoaded) {
            await Plugin.loadFromDB()
        }
        logger.info(`Delete plugin: ${id}`);
        try {
            const plugin = Plugin.plugins[id];
            if (!plugin) {
                throw new Error(`Plugin not found: ${id}`);
            }
            await plugin.deinit(true);
            if (plugin.pluginFolderPath) {
                try {
                    logger.info(`Delete plugin folder: ${plugin.pluginFolderPath}`);
                    await fs.rm(plugin.pluginFolderPath,{recursive: true});
                } catch (err) {
                    logger.error(`Error deleting plugin folder: ${err}`);
                }
            }
            await Common.db.Plugins.destroy({
                where : {
                    id : id,
                }
            });
            Plugin.sendMessage({command: "delete", pluginId: id});
            // delete Plugin.plugins[id];
            logger.info(`Plugin deleted: ${id}`);

            res.send({
                status: Common.STATUS_OK,
                message: "Request was fulfilled",
            });
        } catch (err) {
            logger.error(`Error delete plugin: ${err}`,err);
            res.send({
                status: Common.STATUS_ERROR,
                message: "Internal error"
            });
        }

    }

    /**
     * Update plugin - enable/disable or change configuration
     * @param {*} id
     * @param {*} req
     * @param {*} res
     */
    static async update(id,req,res) {
        if (!Plugin.pluginsLoaded) {
            await Plugin.loadFromDB()
        }
        logger.info(`Update plugin: ${id}`);
        try {
            const plugin = Plugin.plugins[id];
            if (!plugin) {
                throw new Error(`Plugin not found: ${id}`);
            }
            if (req.params.active === undefined) {
                throw new Error(`Update. Invalid parameter`);
            }
            if (req.params.configuration) {
                // compare new configuration with old one
                let newConf = req.params.configuration;
                let oldConf = plugin.configuration;
                let changed = false;
                for (const key in newConf) {
                    if (newConf[key] !== oldConf[key]) {
                        changed = true;
                        break;
                    }
                }
                if (changed) {
                    logger.info(`Plugin configuration changed. Updating`);
                    plugin.configuration = newConf;
                    plugin.dbItem.configuration =  JSON.stringify(newConf);
                    logger.info(`Plugin configuration changed: ${plugin.dbItem.configuration}}`);
                    await plugin.dbItem.save();
                    // if (plugin.active) {
                        logger.info(`Plugin configuration changed. Restarting plugin`);
                        // await plugin.deinit(false);
                        // await plugin.init();
                        Plugin.sendMessage({command: "init", pluginId: id});
                    // }
                }
            }
            if (req.params.active && !plugin.active) {
                plugin.active = true;
                plugin.dbItem.active = 1;
                //await plugin.init();
                await plugin.dbItem.save();
                Plugin.sendMessage({command: "init", pluginId: id});
            } else if (!req.params.active && plugin.active) {
                plugin.active = false;
                plugin.dbItem.active = 0;
                await plugin.dbItem.save();
                Plugin.sendMessage({command: "init", pluginId: id});
                // await plugin.deinit(true);
                // Common.redisClient.publish("plugin", `deinit:${this.id}`);
            }




            logger.info(`Plugin update: ${id}. active: ${plugin.active}`);

            res.send({
                status: Common.STATUS_OK,
                message: "Request was fulfilled",
            });
        } catch (err) {
            logger.error(`Error delete plugin: ${err}`,err);
            res.send({
                status: Common.STATUS_ERROR,
                message: "Internal error"
            });
        }

    }



    /**
     * Create sandbox folder for new plugin package
     * @returns folderName
     */
    static async createUploadSandbox() {
        //Plugin.pluginsFolder
        let folderName = `sandbox_${crypto.randomBytes(32).toString('hex')}`;
        let sandboxPath = path.join(Plugin.pluginsFolder,folderName);
        logger.info(`createUploadSandbox: ${sandboxPath}`);
        await fs.mkdir(sandboxPath, { recursive: true });
        return sandboxPath;
    }

    /**
     * Upload new or updated plugin package
     * @param {*} req
     * @param {*} res
     * @param {*} id null if new package or package name if existing package
     */
    static async upload(req,res,id) {
        try {
            let files = req.files;
            if (!files) {
                throw new Error(`Empty file list`);
            }
            if (!Plugin.pluginsLoaded) {
                await Plugin.loadFromDB()
            }
            let updatePlugin;
            if (id) {
                updatePlugin = Plugin.plugins[id];
                if (!updatePlugin) {
                    throw new Error(`Plugin not found: ${id}`);
                }
            }
            logger.info("Upload plugin: "+JSON.stringify(files,null,2));
            var fkeys = Object.keys(files);
            for (const fkey of fkeys) {
                const file = files[fkey];
                let sandboxPath = await Plugin.createUploadSandbox();
                let packagePath = path.join(sandboxPath,file.name);
                // copy file to sandbox folder
                let packageBuffer = await fs.readFile(file.path);
                await fs.writeFile(packagePath,packageBuffer);
                //await fs.copyFile(file.path,packagePath);

                // extract package file
                try {

                    let mainPackage = await Plugin.buildPluginFolder(sandboxPath,packagePath,updatePlugin,id);
                    let packageId = mainPackage.name;

                    // validate package
                    let moduleJS = path.join(sandboxPath,mainPackage.main);
                    let module =  originalRequire.require(moduleJS);
                    try {
                        let pluginModule = module.getPluginModule();
                        if (!pluginModule) {
                            throw new Error("Plugin module not found in package");
                        }
                        if (typeof pluginModule.init !== 'function') {
                            throw new Error("Init not found in plugin module");
                        }
                    } finally {
                        originalRequire.unrequire(moduleJS);
                    }

                    logger.info(`Plugin module validated!`);
                    // rename sandbox folder to plugin folder
                    let pluginFolderName = `plugin_${packageId}`;
                    let pluginFolderPath = path.join(Plugin.pluginsFolder,pluginFolderName);
                    if (updatePlugin) {
                        try {
                            await fs.rm(pluginFolderPath,{recursive: true});
                        } catch (err) {

                        }
                    }
                    logger.info(`pluginFolderPath: ${pluginFolderPath}`);
                    await fs.rename(sandboxPath,pluginFolderPath);

                    // create hash from package buffer
                    const packagehash = crypto.createHash('sha256').update(packageBuffer).digest('hex').toLowerCase();
                    await fs.writeFile(path.join(pluginFolderPath,"packagehash"),packagehash,"utf-8");

                    if (updatePlugin) {
                        updatePlugin.dbItem.version = mainPackage.version;
                        updatePlugin.dbItem.name = mainPackage.name;
                        updatePlugin.dbItem.description = mainPackage.description;
                        updatePlugin.dbItem.package = packageBuffer;
                        updatePlugin.dbItem.packagehash = packagehash;
                        await updatePlugin.dbItem.save();
                        updatePlugin.version = mainPackage.version;
                        updatePlugin.name = mainPackage.name;
                        updatePlugin.description = mainPackage.description;
                        // await updatePlugin.init();
                    } else {
                        // create db item
                        let dbItem = await Common.db.Plugins.create({
                            id: packageId,
                            version: mainPackage.version,
                            name: mainPackage.name,
                            description: mainPackage.description,
                            packagehash: packagehash,
                            package: packageBuffer
                        });
                        // let plugin = new Plugin(dbItem);
                        // initialize plugin
                        // await plugin.init();
                    }
                    // send init message to plugin managers
                    Plugin.sendMessage({command: "init", pluginId: packageId});
                    //Common.redisClient.publish("plugin", `init:${packageId}`);

                } catch (err) {
                    if (err instanceof commonUtils.ExecCmdError) {
                        logger.info(`Error extracting package. stdout: ${err.stdout}, stderr: ${err.stderr}`);
                    }
                    throw err;
                }

            }
            let retObj = {
                status: Common.STATUS_OK,
                message: "Uploaded"
            };
            res.send(retObj);
        } catch (err) {
            logger.error(`Upload error: ${err}`,err);
            res.send({
                status: Common.STATUS_ERROR,
                message: `Error: ${err}`
            });
        }
    }

    /**
     * Extract the plugin package in th plugin path and configure its main package.json file
     * @param {*} pluginPath
     * @param {*} packagePath
     * @param {*} updatePlugin optional - if we updating existing plugin
     * @param {*} id - optional - the updated plugin id
     * @returns
     */
    static async buildPluginFolder(pluginPath,packagePath,updatePlugin,id) {
        let env = process.env;
        if (Common.nodePath) {
            env.PATH = `${Common.nodePath}:${env.PATH}`;
        }
        let initRet = await commonUtils.execCmd("npm",["init","-y"],{  cwd: pluginPath, env});
        // logger.info(`NPM init. stdout: ${initRet.stdout}, stderr: ${initRet.stderr}`);
        let {stdout , stderr} = await commonUtils.execCmd("npm",["i",packagePath],{  cwd: pluginPath, env});
        logger.info(`Package extracted. stdout: ${stdout}, stderr: ${stderr}`);
        let packageJsonMain = await fs.readFile(path.join(pluginPath,"package.json"),"utf-8");
        // logger.info(`Main package.json: ${packageJsonMain}`);
        let mainPackage = JSON.parse(packageJsonMain);
        let dependenciesKeys = Object.keys(mainPackage.dependencies); //"dependencies"
        if (!dependenciesKeys || !dependenciesKeys[0]) {
            throw new Error(`Cannot find module (empty dependencies)`);
        }
        let packageId = dependenciesKeys[0];
        logger.info(`packageId found: ${packageId}`);
        if (updatePlugin) {
            if (id != packageId) {
                throw new Error(`Uploaded id (${packageId}) is not the same as plugin id (${id})!`);
            }
            await updatePlugin.deinit(false);
        } else if (Plugin.plugins[packageId]) {
            throw new Error(`Plugin with the same id (${packageId}) is already loaded!`);
        }
        // read package package.json
        let modulePath = path.join(pluginPath,"node_modules",packageId);
        let packageJsonModule = await fs.readFile(path.join(modulePath,"package.json"),"utf-8");
        logger.info(`Module package.json: ${packageJsonModule}`);
        let modulePackage = JSON.parse(packageJsonModule);

        mainPackage.main = path.join("node_modules",packageId,modulePackage.main);
        if (modulePackage.types) {
            mainPackage.types = path.join("node_modules",packageId,modulePackage.types);
        }
        mainPackage.name = modulePackage.name;
        mainPackage.description = modulePackage.description;
        mainPackage.author = modulePackage.author;
        mainPackage.version = modulePackage.version;
        mainPackage.license = modulePackage.license;
        packageJsonMain = JSON.stringify(mainPackage,null,2);
        await fs.writeFile(path.join(pluginPath,"package.json"),packageJsonMain);

        return mainPackage;
    }

    /**
     * Get all plugin session types
     * @returns
     */
    static getSessionTypes() {
        let ret = [];
        for (const id in Plugin.plugins) {
            const plugin = Plugin.plugins[id];
            if (plugin.status == Plugin.PLUGIN_STATUS_LOADED && plugin.sessionType) {
                if (!Array.isArray(plugin.sessionType)) {
                    plugin.sessionType = [plugin.sessionType];
                }
                for (const sessionType of plugin.sessionType) {
                    const item = {
                        ...sessionType,
                        value : `plugin:${id}:${sessionType.value}`,
                        pluginId: id,
                        plugin: plugin
                    }
                    ret.push(item);
                }
            }
        }
        return ret;
    }


    /**
     * Add public server to all plugins with public server handlers
     * @param {*} server
     */
    static addPublicServer(server) {
        Plugin.publicServers.push(server);
        logger.info(`addPublicServer. server: ${server.name} Public servers: ${Plugin.publicServers.length} `);
        // update all plugins
        for (const id in Plugin.plugins) {
            const plugin = Plugin.plugins[id];
            if (plugin.status == Plugin.PLUGIN_STATUS_LOADED && plugin.pluginInitResponse  && plugin.pluginInitResponse.publicServerHandlers) {
                plugin.addPublicServerHandlers(server);
            }
        }
    }



    /**
     * Call a function in the plugin module
     * If the plugin is not loaded or the function is not found an error is thrown
     * @param {*} fnName
     * @param  {...any} args
     * @returns the function return value
     */
    callFunc(fnName,...args) {
        if (this.status == Plugin.PLUGIN_STATUS_LOADED && this.pluginModule ) {
            if (fnName in this.pluginModule && typeof this.pluginModule[fnName] === "function") {
                return this.pluginModule[fnName](...args);
            } else {
                throw new Error(`callFunc. Error function (${fnName}) not found!`);
            }
        } else {
            throw new Error(`callFunc. Error plugin not loaded!`);
        }
    }

    static callPluginFunction(fnName,...args) {
        if (!Plugin.pluginsLoaded) {
            logger.info(`callPluginFunction. Error plugins not loaded!`);
            return;
        }
        for (const id in Plugin.plugins) {
            const plugin = Plugin.plugins[id];
            if (plugin.status == Plugin.PLUGIN_STATUS_LOADED && plugin.pluginModule ) {
                if (fnName in plugin.pluginModule && typeof plugin.pluginModule[fnName] === "function") {
                    plugin.pluginModule[fnName](...args);
                }
            }
        }
    }

    /**
     * Call the first plugin function found and that return true
     * In base that the plugin function return false, continue to the next plugins until one return trues
     * @param {*} fnName
     * @param  {...any} args
     * @returns true if function found and returned true
     */
    static callFirstPluginFunction(fnName,...args) {
        if (!Plugin.pluginsLoaded) {
            logger.info(`callPluginFunction. Error plugins not loaded!`);
            return;
        }
        for (const id in Plugin.plugins) {
            const plugin = Plugin.plugins[id];
            if (plugin.status == Plugin.PLUGIN_STATUS_LOADED && plugin.pluginModule ) {
                if (fnName in plugin.pluginModule && typeof plugin.pluginModule[fnName] === "function") {
                    let ret = plugin.pluginModule[fnName](...args);
                    if (ret == true) {
                        return ret;
                    }
                }
            }
        }
        return false;
    }

    static handleRestApiRequest(...args) {
        if (!Plugin.pluginsLoaded) {
            logger.info(`handleRestApiRequest. Error plugins not loaded!`);
            return;
        }
        const fnName = 'handleRestApiRequest';
        for (const id in Plugin.plugins) {
            const plugin = Plugin.plugins[id];
            if (plugin.status == Plugin.PLUGIN_STATUS_LOADED && plugin.pluginModule ) {
                if (fnName in plugin.pluginModule && typeof plugin.pluginModule[fnName] === "function") {
                    let ret = plugin.pluginModule[fnName](...args);
                    //this.vm.run(`pluginModule.init(coreModule)`);
                    // plugin.vm.sandbox[`${fnName}_args`] = args;
                    // let ret = plugin.vm.run(`module.exports = pluginModule.${fnName}(...${fnName}_args)`);
                    // logger.info(`handleRestApiRequest for plugin ${plugin.name}, ret: ${ret}`);
                    if (ret == true) {
                        return ret;
                    }
                }
            }
        }
        return false;
    }
}

module.exports = Plugin;