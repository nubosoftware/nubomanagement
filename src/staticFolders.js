"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
const _ = require('underscore');
const fs = require('fs').promises;
const fss = require('fs');
var crypto = require('crypto');
const path = require('path');
const commonUtils = require('./commonUtils.js');
const nodestatic = require('@nubosoftware/node-static');
const { Subject } = require('await-notify');





/**
 * Management of static folders that server admin and desktop web client
 */
 class Static {


    static defaultFolders = [
        {
            src: 'nubo-admin',
            dist: 'admin'
        },
        {
            src: 'nubo-desktop-client',
            dist: 'desktop'
        }
    ];
    static moduleLoaded = false;
    static folders = {};
    static srcRootFolder;
    static staticFolder;
    static webServer;

    initialized = false;
    dist;
    src;
    srcPath;
    distPath;
    status;

    static STATIC_STATUS_BUILD = 0;
    static STATIC_STATUS_ERROR = 1;
    static STATIC_STATUS_LOADED = 2;


    /**
     * Constructor
     * @param {*} dbItem
     */
    constructor(src,dist) {
        this.src = src;
        this.dist = dist;
        this.srcPath = path.join(Static.srcRootFolder,src);
        this.distPath = path.join(Static.staticFolder,'html',dist);
        this.tag = `[Static_${dist}]`;
        this.status = Static.STATIC_STATUS_BUILD;
        this.initialized = false;
    }

    /**
     * Initialize the static folder. Build it if needed
     */
    async init(){
        try {
            logger.info(`${this.tag} init`);
            if (await this.isRebuildNeeded()){
                await this.buildFolder();
            }
            logger.info(`${this.tag} init. Folder is ready!`);
            this.status = Static.STATIC_STATUS_LOADED;

        } catch (err) {
            logger.error(`${this.tag} init error: ${err}`,err);
            this.status = Static.STATIC_STATUS_ERROR;
        }
    }

    /**
     * Check if source folder changed so we will need to rebuild the dist folder
     * @returns
     */
    async isRebuildNeeded() {
        try {
            let hashPath = path.join(this.distPath,".hash");
            if (! await Static.fileExists(hashPath)) {
                return true;
            }
            let existingHash = (await fs.readFile(hashPath,"utf-8")).trim();
            let currentHash = await Static.computeMetaHash(this.srcPath);
            if (currentHash == existingHash) {
                logger.info(`${this.tag} isRebuildNeeded. hash of src folder (${currentHash}) is the same as dist hash (${existingHash})`);
                return false;
            } else {
                logger.info(`${this.tag} isRebuildNeeded. hash of src folder (${currentHash}) is not the same as dist hash (${existingHash})`);
                return true;
            }

            // if (existingHash.trim() == this.dbItem.packagehash) {
        } catch (err) {
            logger.error(`${this.tag} isRebuildNeeded error: ${err}`,err);
            return true;
        }
    }

    /**
     * Build folder using npm run build ,copy to dist path and generate hash file
     */
    async buildFolder() {
        let env = process.env;
        if (Common.nodePath) {
            env.PATH = `${Common.nodePath}:${env.PATH}`;
        }
        logger.info(`${this.tag} buildFolder. Building web app...`);
        let {stdout , stderr} = await commonUtils.execCmd("npm",["run","build"],{  cwd: this.srcPath, env});
        logger.info(`${this.tag} buildFolder. stdout: ${stdout}, stderr: ${stderr}`);
        // copy builded dist to dist folder
        await fs.mkdir(this.distPath,{recursive: true});
        const builtPath = path.join(this.srcPath,"dist");
        await commonUtils.execCmd('cp',["-aT",builtPath,this.distPath]);
        let currentHash = await Static.computeMetaHash(this.srcPath);
        let hashPath = path.join(this.distPath,".hash");
        await fs.writeFile(hashPath,currentHash,"utf-8");
        logger.info(`${this.tag} buildFolder. Folder built. hash: ${currentHash}`);
    }


    /**
     * Utility function to check if file/folder exists
     * @param {*} filepath
     * @returns
     */
    static async fileExists(filepath) {
        try {
            await fs.access(filepath);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Utility function to recuresivle calculate hash of folder
     * @param {*} folder
     * @param {*} inputHash
     * @returns
     */
    static async computeMetaHash(folder, inputHash = null) {
        const hash = inputHash ? inputHash : crypto.createHash('sha256');
        const info = await fs.readdir(folder, { withFileTypes: true });
        // construct a string from the modification date, the filename and the filesize
        for (let item of info) {
            const fullPath = path.join(folder, item.name);
            if (item.isFile()) {
                const statInfo = await fs.stat(fullPath);
                // compute hash string name:size:mtime
                const fileInfo = `${fullPath}:${statInfo.size}:${statInfo.mtimeMs}`;
                hash.update(fileInfo);
            } else if (item.isDirectory()) {
                // recursively walk sub-folders
                await Static.computeMetaHash(fullPath, hash);
            }
        }
        // if not being called recursively, get the digest and return it as the hash result
        if (!inputHash) {
            return hash.digest('hex');
        }
    }

    /**
     * Initialize module.
     * Load all static folders and compile if needed
     */
    static async moduleInit() {
        if (Static.moduleLoaded) {
            logger.info(`[Static:moduleInit] module already loaded`);
            return;
        }
        try {
            Static.srcRootFolder = path.join(Common.rootDir,'static-src');
            Static.staticFolder = path.join(Common.rootDir,'static');
            Static.webServer = new nodestatic.Server(Static.staticFolder, {
                cache: 3600
            });
            for (const defaultFolder of Static.defaultFolders) {
                let folder = new Static(defaultFolder.src,defaultFolder.dist);
                Static.folders[defaultFolder.dist] = folder;
                await folder.init();
            }
            logger.info(`[Static:moduleInit] module loaded with ${Object.keys(Static.folders).length} folders`);
            Static.moduleLoaded = true;

            // notify all waiting events
            for (const event of Static.waitEvents) {
                event.notify();
            }
        } catch (err) {
            logger.error(`[Static:moduleInit] error: ${err}`,err);
        }
    }

    static waitEvents = [];

    /**
     * Wait for module to be initialized
     * @param {*} timeout - timeout in ms
     * @returns true if module is loaded, false if timeout
     */
    static async waitForModuleInit(timeout) {
        if (Static.moduleLoaded) {
            return true;
        }
        const event = new Subject();
        Static.waitEvents.push(event);
        await event.wait(timeout);
        return Static.moduleLoaded;
    }


    /**
     * Add or update a plugin to a static folder
     * The static folder will be rebuilt if any file added or changed
     * @param {*} staticFolder
     * @param {*} srcPath
     * @param {*} pluginName
     */
    static async addPluginToStaticFolder(staticFolder,srcPath,pluginName) {
        try {
            logger.info(`[Static:addPluginToStaticFolder] adding plugin ${pluginName} to static folder ${staticFolder}, srcPath: ${srcPath}`);
            if (! await Static.waitForModuleInit(30000)) {
                throw new Error('module not loaded!');
            }
            let folder = Static.folders[staticFolder];
            if (!folder) {
                throw new Error(`Static folder ${staticFolder} not found.`);
            }
            let pluginPath = path.join(folder.srcPath,"src","plugins",pluginName);
            logger.info(`[Static:addPluginToStaticFolder] pluginPath: ${pluginPath}`);
            let currentPluginHash = "";
            const currentPluginHashPath = path.join(pluginPath,".hash");
            if (await Static.fileExists(currentPluginHashPath)) {
                currentPluginHash = await fs.readFile(currentPluginHashPath,"utf-8");
            }
            logger.info(`[Static:addPluginToStaticFolder] currentPluginHash: ${currentPluginHash}`);
            let newPluginHash = await Static.computeMetaHash(srcPath);
            logger.info(`[Static:addPluginToStaticFolder] newPluginHash: ${newPluginHash}`);
            if (currentPluginHash === newPluginHash) {
                logger.info(`[Static:addPluginToStaticFolder] plugin ${pluginName} already up to date`);
                return true;
            }
            // copy plugin to static folder
            if (await Static.fileExists(pluginPath)) {
                await fs.rm(pluginPath, {recursive: true});
            }
            await fs.mkdir(pluginPath,{recursive: true});
            await commonUtils.execCmd('cp',["-aT",srcPath,pluginPath]);
            await fs.writeFile(currentPluginHashPath,newPluginHash,"utf-8");

            // rebuild static folder
            await folder.buildFolder();

            logger.info(`[Static:addPluginToStaticFolder] plugin ${pluginName} added to static folder ${staticFolder}`);

        } catch (err) {
            logger.error(`[Static:addPluginToStaticFolder] error: ${err}`,err);
            return false;
        }

    }

    /**
     * Remove a plugin from a static folder
     * @param {*} staticFolder
     * @param {*} pluginName
     */
    static async removePluginFromStaticFolder(staticFolder,pluginName) {
        try {
            logger.info(`[Static:removePluginFromStaticFolder] removing plugin ${pluginName} from static folder ${staticFolder}`);
            if (! await Static.waitForModuleInit(30000)) {
                throw new Error('module not loaded!');
            }
            let folder = Static.folders[staticFolder];
            if (!folder) {
                throw new Error(`Static folder ${staticFolder} not found.`);
            }
            let pluginPath = path.join(folder.srcPath,"src","plugins",pluginName);
            logger.info(`[Static:removePluginFromStaticFolder] pluginPath: ${pluginPath}`);
            if (await Static.fileExists(pluginPath)) {
                await fs.rm(pluginPath, {recursive: true});
            }
            // rebuild static folder
            await folder.buildFolder();

            logger.info(`[Static:removePluginFromStaticFolder] plugin ${pluginName} removed from static folder ${staticFolder}`);
        } catch (err) {
            logger.error(`[Static:removePluginFromStaticFolder] error: ${err}`,err);
        }
    }

    /**
     * Serve static files
     * @param {*} req
     * @param {*} res
     * @returns
     */
    static serve(req, res) {
        if (!Static.webServer) {
            logger.error(`[Static] module not loaded!`);
            res.writeHead(500, {
                "Content-Type": "text/plain"
            });
            res.end("500 Internal Server Error\n");
            return;
        }
        Static.webServer.serve(req, res, (err, result) => {
            if (err) {
                logger.error("[Static] Error serving static url " + req.url + " - " + err.message);
                res.writeHead(404, {
                    "Content-Type": "text/plain"
                });
                res.end("404 Not Found\n");
                return;
            }
            //logger.info("[Static] Served GET static file: " + req.url);
        });

    }
}

module.exports = Static;