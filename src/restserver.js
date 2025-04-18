"use strict";

var async = require('async');
var fs = require('fs');
var restify = require('restify');
var net = require('net');
var tls = require('tls');
var url = require("url");
var querystring = require("querystring");
var accesslog = require('accesslog');
var _ = require('underscore');
var NuboRestifyshutdown = require('@nubosoftware/nubo-restify-shutdown');


var Common = require('./common.js');
const validate = require('validate.js');
const { path } = require('./common.js');

//================= requires =================================
var Validate;
var StartSession;
var SessionController;
var ActivationLink;
var setPasscode;
var checkPasscode;
var checkBiometric;
var resetPasscode;
var unlockPassword;
var Activate;
var Settings;
var redisGateway;
var Notifications;
var NotificationPolling;
var SmsNotification;
var Upload;
var UploadFile;
var ThreadedLogger;
var SendPlayback;
var getNuboRecordings;
var getResource;
var authFilterExcludes;
var authFilterValidator;
var captureDeviceDetails;
var userUtils;
var Login;
var sessionModule;
var daemonTools;
var Otp;
var CommonUtils;
var filterModule;
var frontEndService;
//===============================================================

var accesslogger = accesslog({
    path : './log/access_log.log'
});

var appServers = [];
var serverAtExitProcess = false;
var daemon_proc;
var logger = Common.getLogger(__filename);

var validator;

var urlFilterOpts;
var bodyFilterOpts;
var urlFilterObj;
var bodyFilterObj;

var mainFunction = function(err, firstTimeLoad, partOfCluster) {
    if (err) {
        console.log("Fatal Error: " + err);
        Common.quit();
        return;
    }



    if (!firstTimeLoad)// execute the following code only in the first time
        return;

    Common.isRestServer = true;
    logger.info("Starting Rest Server");

    var readCerts = function(obj, callback) {
        if(!obj) {
            obj = {
                key: "../cert/server.key",
                certificate: "../cert/server.cert",
                ca: "../cert/root.crt"
            };
        }
        logger.debug("sslCerts: " + JSON.stringify(obj));
        if(!obj || !obj.certificate || !obj.key) return callback("bad parameter Common.sslCerts");
        var sslCerts = {};
        async.forEachOf(
            obj,
            function(item, key, callback) {
                fs.readFile(item, function(err, data) {
                    if(err) {
                        logger.error("Cannot read " + item + " file, err: " + err);
                    } else {
                        sslCerts[key] = data;
                    }
                    callback(err);
                });
            },
            function(err) {
                callback(err, sslCerts);
            }
        );
    };

    var createListener = function(opts, callback) {
        async.waterfall(
            [
                function(callback) {
                    var urlObj = url.parse(opts.listenAddress);
                    if(urlObj.protocol === "https:") {
                        if(!urlObj.port) urlObj.port = 8443;
                    } else {
                        if(!urlObj.port) urlObj.port = 8080;
                    }
                    callback(null, urlObj);
                },
                function(urlObj, callback) {
                    if(urlObj.protocol === "https:") {
                        readCerts(opts.sslCerts, function(err, obj) {
                            if(err) {
                                callback(err);
                            } else {
                                callback(null, urlObj, obj);
                            }
                        });
                    } else {
                        callback(null, urlObj, null);
                    }
                },
                function(urlObj, options, callback) {
                    if (!options) {
                        options = {};
                    }
                    options.name = opts.name;
                    var server = restify.createServer(options);
                    opts.handlers.forEach(function(hanlder) {
                        hanlder(server);
                    });

                    server.listen(urlObj.port, urlObj.hostname, function() {
                        logger.info(server.name + ' listening at ' + server.url);
                        callback(null, server);
                    });
                }
            ], function(err, server) {
                if(err){
                    callback(err);
                    return;
                }

                NuboRestifyshutdown({logger : logger},server);
                appServers.push(server);
                callback(null, server);
            }
        );
    };

    async.series([
        function(callback) {
            loadRequires();
            return callback(null)
        },
        function(callback){
            var rules;

            try {
                rules = require("./parameters-map.js")();
            } catch(e) {
                return callback('Error: Cannot load parameters-map.js file, err: ' + e);
            }

            var permittedMode = Common.parametersMapPermittedMode ? Common.parametersMapPermittedMode : false;

            urlFilterOpts = {
                loge: logger.error,
                mode: filterModule.mode.URL,
                permittedMode: permittedMode
            };
            bodyFilterOpts = {
                loge: logger.error,
                mode: filterModule.mode.BODY,
                permittedMode: permittedMode
            };

            urlFilterObj = new filterModule.filter(rules, urlFilterOpts,validate);
            bodyFilterObj = new filterModule.filter(rules, bodyFilterOpts,validate);
            return callback(null);
        },
        function(callback){
            if (Common.isEnterpriseEdition()) {
                    Otp.getOtpConf(logger, function(err, retries, timeout){
                        if(err){
                            //return callback("failed getting OTP configuration");
                            //logger.error("Warning: failed getting OTP configuration!");
                            callback(null);
                            return;
                        }

                        Common.otpMaxTries = retries;
                        Common.otpTimeout = timeout;
                        callback(null);
                    });
            }
            else {
                callback(null);
            }
        },
        function(callback) {
            if(Common.slaveManager){
                logger.info("this management doesnt set to run daemon");
                return callback(null);
            }

            if(partOfCluster && partOfCluster === true){
                return callback(null);
            }

           daemonTools.startDaemon(function(err, daemonProc){
                if(err){
                    return callback(err);
                }

                daemon_proc = daemonProc ? daemonProc : null;
                if(!daemon_proc){
                    logger.info("daemon is already running");
                }
                callback(null);
            });
        },
        function(callback) {
            async.each(
                Common.listenAddresses,
                function(listenAddress, callback) {
                    var opts = {
                        listenAddress: listenAddress,
                    };
                    if (Common.listenAddressesPlatforms) {
                        opts.handlers = [setPublicServiceServer];
                        opts.name = `Public Server ${listenAddress}`;
                    } else {
                        opts.handlers = [setPublicServiceServer, setPlatformServiceServer];
                        opts.name = `Public and Platform Server ${listenAddress}`;
                    }
                    createListener(opts, callback);
                },
                function(err) {
                    callback(err);
                }
            );
        },
        function(callback) {
            if (Common.listenAddressesPlatforms) {
                async.each(
                    Common.listenAddressesPlatforms,
                    function(listenAddress, callback) {
                        var opts = {
                            listenAddress: listenAddress,
                            handlers: [presetPlatformServiceServer, setPlatformServiceServer],
                            name: `Platform Server ${listenAddress}`,
                        };
                        createListener(opts, callback);
                    },
                    function(err) {
                        callback(err);
                    }
                );
            } else {
                callback(null);
            }
        },

        function(callback) {
            // initiate static folders in the background
            require('./staticFolders').moduleInit().then(() => {

            }).catch(err => {

            });
            // eneterprise edition multi datacenter handler
            if (Common.isEnterpriseEdition()) {
                Common.getEnterprise().dataCenter.startRestServer(callback);
            } else {
                callback(null);
            }
        },
        function(callback) {
            // call plugin trigger after all servers are up
            require('./plugin').invokeTrigger('restserver', 'start');
            if (typeof runTest === 'function') {
                runTest();
            }
            callback(null);
        }
    ], function(err) {
        if (err) {
            logger.error("error while start service: " + err);
            Common.quit();
        } else {
            logger.info("service running");
        }
    });

    process.on('message', (msg) => {
        if (msg === 'shutdown') {
          // initiate graceful close of any connections to server
          logger.info("restserver shutdown signal");
          async.each(
            appServers,
            function(appServer, callback) {
                if (!Settings.getDebugMode()) {
                    logger.info("restserver closing appServer.");
                    appServer.close(function() {
                        logger.info("restserver appServer closed.");
                        callback(null);
                    });
                } else {
                    callback(null);
                }
            }, function(){
                appServers = [];
            });
        }
    });

    process.on('SIGINT', function() {
        if(serverAtExitProcess){
            return;
        }
        else {
            serverAtExitProcess = true;
        }

        logger.info("restserver caught interrupt signal");

        if(daemon_proc) {
            daemon_proc.kill('SIGINT');
        }

        async.series([
            function(callback) {
                if (Common.isEnterpriseEdition()) {
                    Common.getEnterprise().dataCenter.stopRestServer(callback);
                } else {
                    callback(null);
                }
            },
            function(callback) {
                async.each(
                    appServers,
                    function(appServer, callback) {
                        if (!Settings.getDebugMode()) {
                            logger.info("restserver closing appServer...");
                            appServer.close(function() {
                                logger.info("restserver appServer closed...");
                                callback(null);
                            });
                        } else {
                            callback(null);
                        }
                    }, callback);
            }
        ], function(err) {
            if(err){
                logger.error("restserver: " + err);
            }
            Common.quit();
        });
    });
};


function getAppServers() {
    return appServers;s
}

function getResourceListByDevice(req, res, next) {
    var deviceName = req.params.deviceName;
    var resolution = req.params.resolution;

    Common.redisClient.zrevrange("d_" + deviceName, '0', '-1', function(err, replies) {
        if (err || replies.length === 0) {
            Common.redisClient.zrevrange("r_" + resolution, '0', '-1', function(err, replies) {
                if (err) {
                    res.send([]);
                } else {
                    res.send(replies);
                }
            });
        } else {
            res.send(replies);
        }
    });
}

function debugFunc(req, res, next) {
    // return false;
    var debugTimeout = req.params.debugTimeout;
    if (debugTimeout === 'Y') {
        logger.info("Debug timeout....");
        return false;
        // stop chain to test timeout. http will never return response....
    }
    var debugErr = req.params.debugErr;
    if (debugErr === 'Y') {
        console.log("Before mytestvar: " + debugErr);
    }
    return next();
}

function nocache(req, res, next) {
   if (!req.headers['range']) {
       res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
       res.header('Expires', '-1');
       res.header('Pragma', 'no-cache');
   }
   //logger.info("url: "+req.url);
   next();
}

function yescache(req, res, next) {
  res.removeHeader('Cache-Control');
  res.removeHeader('Expires');
  res.removeHeader('Pragma');
  next();
}

function getValidator(){
    if (!(validator instanceof authFilterValidator)) {
        // SESSID filter need to be before ISADMIN filter because ISADMIN filter uses session data set in SESSID filter
        const excludeList = authFilterExcludes.getExcludeList();
        validator =  new authFilterValidator(['WEB_ADMIN_TOKEN', 'LOGINTOKEN', 'SESSID', 'ISADMIN', 'PLATUID', 'CONTROL_PANEL_ID', 'NUBO_SETTINGS_ID','FRONTEND_AUTH'], excludeList, Common.authValidatorPermittedMode);
    }

    return validator;
}

function authValidate(req, res, next) {
    req.nubodata = {};

    getValidator().validate(req, function(err) {
        if (err) {
            logger.error("authValidate: " + err + ", URL: " + req.url);

            res.contentType = 'json';
            res.send({
                status: 0,
                message: "bad request"
            });
        } else {
            next();
            return;
        }
    });
}



function setPublicServiceServer(server) {
    server.on('uncaughtException', function(request, response, route, error) {
        logger.error("Exception in http server: " + (error && error.stack || error));
        response.send(error);
        return true;
    });
    server.use(Common.restify.plugins.queryParser({ mapParams: true }));
    //server.use(Common.restify.queryParser());


    server.use(urlFilterObj.useHandler);
    // server.use(debugFunc);

    server.use(accesslogger);
    server.use(nocache);

    server.post('/file/uploadDummyFile', Upload.uploadDummyFile);
    server.post('/file/uploadFileToLoginToken', UploadFile.uploadFileToLoginToken);

    // the order of this 3 handlers below must be in this order
    // 1. parse the body of request
    // 2. validate body data
    // 3. authenticate request with data from the body(not all requests)


    let uploadDir = CommonUtils.getUploadDir();
    CommonUtils.ensureExists(uploadDir,(err) => {
        if (err) {
            logger.error("Cannot create upload folder: "+err);
            console.error(err);
        }
    });
    server.use(Common.restify.plugins.bodyParser({mapParams: true,
             mapFiles: true,
             overrideParams: false,
             keepExtensions: false,
             uploadDir: uploadDir,
             multiples: true,
             hash: 'sha1',
             rejectUnknown: false,
             requestBodyOnGet: false,
             maxBodySize: 2000000000,
             maxFileSize: 2000000000,
    }));
    /*server.use(function(req,res,next) {
        logger.info("After body parser... url: "+req.url);
        next();
    });*/
    server.post('/file/uploadToSession', Upload.uploadToSession);
    if(!Common.withService){
        server.post('/file/uploadToLoginToken', Upload.uploadToLoginToken);
    }
    server.use(bodyFilterObj.useHandler);
    server.use(authValidate);

    server.get('/checkStatus',CommonUtils.checkDataCenterStatus);

    if (Common.isEnterpriseEdition()) {
        Common.getEnterprise().addPublicServerHandlers(server);
    }
    if (Common.isMobile()) {
        Common.getMobile().addPublicServerHandlers(server);
    }
    if (Common.pluginsEnabled) {
        require('./plugin').addPublicServer(server);
    }

    server.get('/checkOtpAuth', Otp.checkOtpAuth);
    server.get('/resendOtpCode', Otp.resendOtpCode);
    server.get('/getClientConf', Validate.getClientConf);
    server.get('/recheckValidate', Validate.recheckValidate);

    server.get('/checkPasscode', checkPasscode.func);
    server.get('/checkBiometric',checkBiometric.checkBiometric);
    server.get('/setPasscode', setPasscode.func);
    server.get('/resetPasscode', resetPasscode.func);
    server.get('/activate', Activate.func);

    generateAPIRoutes(server,'/client',require('./client').apiAccess);


    server.get('/activationLink', ActivationLink.func);
    server.get('/validate', Validate.func);
    server.post('/validate', Validate.func);
    server.get('/captureDeviceDetails', captureDeviceDetails.captureDeviceDetails);
    server.get('/resendUnlockPasswordLink', unlockPassword.resendUnlockPasswordLink);
    server.get('/unlockPassword', unlockPassword.unlockPassword);


    server.get('/startsession', StartSession.func);
    server.post('/startsession', StartSession.func);
    server.get('/logoutUser', require('./SessionController.js').logoutUser);
    server.get('/closeOtherSessions', require('./SessionController.js').closeOtherSessions);
    server.get('/declineCall', StartSession.declineCall);
    server.get('/SmsNotification/sendSmsNotification', SmsNotification.sendSmsNotification);


    server.get('/notificationPolling', NotificationPolling.func);
    server.post('/Notifications/pushNotification', Notifications.pushNotification);
    server.get('/Notifications/pushNotification', Notifications.pushNotification);

    server.get('/redisGateway/registerGateway', redisGateway.registerGateway);
    server.get('/redisGateway/updateGatewayTtl', redisGateway.updateGatewayTtl);
    server.get('/redisGateway/validateUpdSession', redisGateway.validateUpdSession);
    server.get('/redisGateway/isPlatformInPlatformsList', redisGateway.isPlatformInPlatformsList);
    server.get('/redisGateway/unregisterGateway', redisGateway.unregisterGateway);
    server.get('/redisGateway/addPlatform2ErrsList', redisGateway.addPlatform2ErrsList);
    server.get('/redisGateway/checkLoginTokenOnRedis', redisGateway.checkLoginTokenOnRedis);
    server.get('/redisGateway/reportRecording', redisGateway.reportRecording);

    server.get('/frontEndService/registerFrontEnd', frontEndService.registerFrontEndRestApi);
    server.get('/frontEndService/refreshFrontEndTTL', frontEndService.refreshFrontEndTTLRestApi);
    server.get('/frontEndService/unregisterFrontEnd', frontEndService.unregisterFrontEndRestApi);


    const platSelfReg = require('./platformSelfReg');
    server.get('/selfRegisterPlatform', platSelfReg.selfRegisterPlatform);
    server.get('/selfRegisterPlatformTtl', platSelfReg.selfRegisterPlatformTtl);




    server.get('/getNuboRecordings', getNuboRecordings.func);
    server.get('/getResource', getResource.getResource);
    server.post('/receiveSMS', SmsNotification.receiveSMS);
    //server.get('/NotificationsWidget', require('./NotificationsWidget.js').get);
    server.get("/status", function(req, res, next) {
            res.writeHead(200, {
                "Content-Type": "text/plain"
            });
            res.write("OK\n");
            res.end();
    });

    server.post("/addMissingResource", addMissingResource);
    server.get('/getResourceListByDevice', getResourceListByDevice);
    server.post('/updateUserConnectionStatics', updateUserConnectionStatics);


    // html server that serve static web client - admin and desktop
    server.get("/html/*", require('./staticFolders').serve);
    // const staticPath = path.join(Common.rootDir,'static');
    // var htmlServer = new nodestatic.Server(staticPath, {
    //     cache: 3600
    // });
    // server.get("/html/*", function (req, res, next) {
    //     htmlServer.serve(req, res, (err, result) => {
    //         if (err) {
    //             logger.error("Error serving static url " + req.url + " - " + err.message);
    //             res.writeHead(404, {
    //                 "Content-Type": "text/plain"
    //             });
    //             res.end("404 Not Found\n");
    //             return;
    //         }
    //         logger.info("Served GET static file: " + req.url);
    //     });
    // });
    if (Common.appstore && Common.appstore.enable === true) {
        const nodestatic = require('@nubosoftware/node-static');
        let appStorePath = Common.appstore.path;
        if (appStorePath.endsWith("/appstore")) {
            let pathS = appStorePath.split("/");
            appStorePath = pathS.slice(0, pathS.length-1).join("/");
        }

        var appStoreServer = new nodestatic.Server(appStorePath, {
            cache: 3600
        });
        server.get("/appstore/*", function (req, res, next) { // */repo/
            // logger.info("GET app store file: " + req.url);
            appStoreServer.serve(req, res, (err, result) => {
                if (err) {
                    logger.error("Error serving appstore url " + req.url + " - " + err.message);
                    res.writeHead(404, {
                        "Content-Type": "text/plain"
                    });
                    res.end("404 Not Found\n");
                    return;
                }
                // logger.info("Served GET app store file: " + req.url);
            });
        });
        server.head("/appstore/*", function (req, res, next) { // */repo/
            logger.info("HEAD request: " + req.url);
            appStoreServer.serve(req, res, (err, result) => {
                if (err) {
                    logger.error("Error serving appstore url " + req.url + " - " + err.message);
                    res.writeHead(404, {
                        "Content-Type": "text/plain"
                    });
                    res.end("404 Not Found\n");
                    return;
                }
                // logger.info("Served HEAD store file: " + req.url);
            });
        });
    }



}

function presetPlatformServiceServer(server) {
    server.on('uncaughtException', function(request, response, route, error) {
        logger.error("Exception in http server: " + (error && error.stack || error));
        response.send(error);
        return true;
    });
    server.use(Common.restify.plugins.queryParser({ mapParams: true }));
    //server.use(Common.restify.queryParser());

    server.use(urlFilterObj.useHandler);
    // server.use(debugFunc);

    server.use(accesslogger);

    // the order of this 3 handlers below must be in this order
    // 1. parse the body of request
    // 2. validate body data
    // 3. authenticate request with data from the body(not all requests)
    server.use(Common.restify.plugins.bodyParser({mapParams: false,  maxBodySize: 1000000000}));
    server.use(bodyFilterObj.useHandler);
    server.use(authValidate);

    server.use(nocache);
}

/**
 * Generate API routes for the server. Route all requests to the same handler for up to 4 arguments:
 * 1. object type
 * 2. arg1
 * 3. arg2
 * 4. arg3
 * The routes are generated based on the baseURI and the handler.
 * baseURI should include leading slash and should not include trailing slash.
 * @param {*} server
 * @param {*} baseURI
 * @param {*} handler
 */
function generateAPIRoutes(server,baseURI,handler) {
    server.post(`${baseURI}/:objectType`,handler);
    server.post(`${baseURI}/:objectType/:arg1`,handler);
    server.post(`${baseURI}/:objectType/:arg1/:arg2`,handler);
    server.post(`${baseURI}/:objectType/:arg1/:arg2/:arg3`,handler);
    server.put(`${baseURI}/:objectType`,handler);
    server.put(`${baseURI}/:objectType/:arg1`,handler);
    server.put(`${baseURI}/:objectType/:arg1/:arg2`,handler);
    server.put(`${baseURI}/:objectType/:arg1/:arg2/:arg3`,handler);
    server.del(`${baseURI}/:objectType`,handler);
    server.del(`${baseURI}/:objectType/:arg1`,handler);
    server.del(`${baseURI}/:objectType/:arg1/:arg2`,handler);
    server.del(`${baseURI}/:objectType/:arg1/:arg2/:arg3`,handler);
    server.get(`${baseURI}/:objectType`,handler);
    server.get(`${baseURI}/:objectType/:arg1`,handler);
    server.get(`${baseURI}/:objectType/:arg1/:arg2`,handler);
    server.get(`${baseURI}/:objectType/:arg1/:arg2/:arg3`,handler);
}

function setPlatformServiceServer(server) {
    server.post('/cp/:requestType', require('./ControlPanel/restGet.js').get);
    server.post('/loginWebAdmin',require('./ControlPanel/restGet.js').loginWebAdmin);
    generateAPIRoutes(server,"/api",require('./ControlPanel/restGet.js').apiAccess);
    // server.post('/api/:objectType',require('./ControlPanel/restGet.js').apiAccess);
    // server.post('/api/:objectType/:arg1',require('./ControlPanel/restGet.js').apiAccess);
    // server.post('/api/:objectType/:arg1/:arg2',require('./ControlPanel/restGet.js').apiAccess);
    // server.post('/api/:objectType/:arg1/:arg2/:arg3',require('./ControlPanel/restGet.js').apiAccess);
    // server.put('/api/:objectType',require('./ControlPanel/restGet.js').apiAccess);
    // server.put('/api/:objectType/:arg1',require('./ControlPanel/restGet.js').apiAccess);
    // server.put('/api/:objectType/:arg1/:arg2',require('./ControlPanel/restGet.js').apiAccess);
    // server.put('/api/:objectType/:arg1/:arg2/:arg3',require('./ControlPanel/restGet.js').apiAccess);
    // server.del('/api/:objectType',require('./ControlPanel/restGet.js').apiAccess);
    // server.del('/api/:objectType/:arg1',require('./ControlPanel/restGet.js').apiAccess);
    // server.del('/api/:objectType/:arg1/:arg2',require('./ControlPanel/restGet.js').apiAccess);
    // server.del('/api/:objectType/:arg1/:arg2/:arg3',require('./ControlPanel/restGet.js').apiAccess);
    // server.get('/api/:objectType',require('./ControlPanel/restGet.js').apiAccess);
    // server.get('/api/:objectType/:arg1',require('./ControlPanel/restGet.js').apiAccess);
    // server.get('/api/:objectType/:arg1/:arg2',require('./ControlPanel/restGet.js').apiAccess);
    // server.get('/api/:objectType/:arg1/:arg2/:arg3',require('./ControlPanel/restGet.js').apiAccess);
//    server.get('/cp/:requestType', require('./ControlPanel/restGet.js').get);
    if (!Common.withService) {
        server.post('/settings/getSessionDetails', Settings.getSessionDetails);
        server.post('/settings/getNuboSettingsSecurityPasscode', Settings.getNuboSettingsSecurityPasscode);
        server.post('/settings/changePasscode', Settings.changePasscode);
        server.post('/settings/checkPasscode', Settings.checkPasscode);
        server.post('/settings/changeExpiredPassword', Settings.changeExpiredPassword);
    }

    server.post('/settings/installApkForUser', Settings.installApkForUser);

    server.post('/settings/uninstallApkForUser', Settings.uninstallApkForUser);

    server.post('/settings/canInstallListForUser', Settings.canInstallListForUser);
    server.post('/settings/factoryReset', Settings.factoryReset);

    server.post('/settings/setLanguage', Settings.setLanguage);
    server.post('/settings/setNotificationStatusForApp', Settings.setNotificationStatusForApp);
    server.post('/settings/setNotificationSound', Settings.setNotificationSound);
    server.post('/settings/setNotificationVibrate', Settings.setNotificationVibrate);
    server.post('/settings/getNotificationsStatusForAllApps', Settings.getNotificationsStatusForAllApps);

    if (Common.isEnterpriseEdition()) {
        Common.getEnterprise().addPlatformServiceHandlers(server);
    }

    if (Common.isMobile()) {
        Common.getMobile().addPlatformServiceHandlers(server);
    }


    server.post('/notifyWindowAction', require("./notifyWindowAction.js").get);
    server.post('/platformUserNotification', require("./platformUserNotification.js").post);
    server.post('/sendSMS', SmsNotification.platformUserSendSms);

    server.use(yescache);



}

function addMissingResource(req, res, next) {
    var resource = req.body.resource;

    Common.redisClient.zincrby("missing_res", 1, resource, function(err, reply){
        if(err){
            logger.error("addMissingResource: " +err);
            res.send({
                status: Common.STATUS_ERROR,
                message: "failed to add"
            });
            return;
        }

        res.send({
            status: Common.STATUS_OK
        });
    });
}

function updateUserConnectionStatics(req, res, next){
    var deviceName = req.body.deviceName;
    var resolution = req.body.resolution;
    var pathname = req.body.pathname;

    var multi = Common.getRedisMulti();
    if(deviceName){
        multi.sadd("devices", deviceName);
        multi.zincrby("d_" + deviceName, 1, pathname);
    }

    if(resolution){
        multi.sadd("resolutions", resolution);
        multi.zincrby("r_" + resolution, 1, pathname);
    }

    multi.exec(function(err, replies){
        if(err){
            logger.error("updateUserConnectionStatics: " + err);
            res.send({
                status: Common.STATUS_ERROR,
                message: "failed to add"
            });
            return;
        }

        res.send({
            status: Common.STATUS_OK
        });
    });
}

function userConnectionStatics(req, pathname) {
    var deviceName = req.params.deviceName;
    var resolution = req.params.resolution;
    if (deviceName != null || resolution != null) {
        if (pathname.indexOf("/html/player/extres/") === 0)
            pathname = pathname.substr(20);
        if (deviceName != null && deviceName.length > 0) {
            Common.redisClient.sadd("devices", deviceName);
            Common.redisClient.zincrby("d_" + deviceName, 1, pathname);
        }
        if (resolution != null && resolution.length > 0) {
            Common.redisClient.sadd("resolutions", resolution);
            Common.redisClient.zincrby("r_" + resolution, 1, pathname);
        }
    }
}

function loadRequires() {

    Validate = require('./validate.js');
    StartSession = require('./StartSession.js');
    SessionController = require('./SessionController.js');
    ActivationLink = require('./activationLink.js');
    setPasscode = require('./setPasscode.js');
    checkPasscode = require('./checkPasscode.js');
    checkBiometric = require('./checkBiometric');
    resetPasscode = require('./resetPasscode.js');
    unlockPassword = require('./unlockPassword.js');
    Activate = require('./activateDevice');
    Settings = require('./settings.js');
    redisGateway = require('./redisGateway.js');  // YAELL
    Notifications = require('./Notifications.js');
    NotificationPolling = require('./notificationPolling.js');
    SmsNotification = require('./SmsNotification.js');
    Upload = require('./upload.js');
    UploadFile = require('./uploadFile.js');
    ThreadedLogger = require('./ThreadedLogger.js');
    SendPlayback = require('./sendPlayback.js');
    getNuboRecordings = require('./getNuboRecordings.js');
    getResource = require('./getResource.js');
    authFilterExcludes = require('./authFilterExcludes.js');
    authFilterValidator = require('./authFilterValidator.js');
    captureDeviceDetails = require('./captureDeviceDetails.js');
    userUtils = require('./userUtils.js');
    Login = require('./login.js');
    sessionModule = require('./session.js');
    daemonTools = require('./daemonTools.js');
    Otp = require('./otp.js');
    CommonUtils = require("./commonUtils.js");
    filterModule = require('@nubosoftware/permission-parser');
    frontEndService = require('./frontEndService.js');
}

Common.loadCallback = mainFunction;
if (module) {
    module.exports = {
        mainFunction: mainFunction,
        getAppServers
    };
}


// async function runTest() {
//     // "email":"a2@nubo0.com","deviceid":"2685d0848404532e"
//     try {
//         const device = await Common.db.UserDevices.findOne({
//             attributes: ['email', 'imei', 'active', 'devicename', 'platform', 'gateway','assigned_phone_number','local_extension'],
//             where: {
//                 email: "a2@nubo0.com",
//                 imei: "2685d0848404532e",
//             }
//         });
//         console.log(`runTest. device: ${JSON.stringify(device)}`);
//         await require('./SessionController.js').startSessionByDevice("a2@nubo0.com","2685d0848404532e",device);
//     } catch (e) {
//         console.log(e);
//     }
// }