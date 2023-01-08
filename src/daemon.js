"use strict";

var async = require('async');
var os = require('os');
var Common = require('./common.js');
const path = require('path');

//================= requires =================================
var ThreadedLogger;
var nubocronAPI;
var cleanerService;
var updateLoginTTLService;
var Service;
var gatewayModule;
var sessionModule;
var daemonTools;
var platformModule;
var PlatformPoolModule;
var schedulerService;
var frontEndService;
var platSelfReg;
//============================================================

var nuboJobs;
var serverAtExitProcess = false;
var global_msg;
var logger;

var mainFunction = function(err, firstTimeLoad) {
    if (err) {
        logger.error("mainFunction: " + err);
        process.exit(1);
    }

    loadRequires();
    logger = new ThreadedLogger(Common.getLogger(__filename));
    logger.user("daemon");

    var pingOfLifeService = new Service(daemonTools.pingOfLife, {
        period: (daemonTools.daemonTTL / 6)
    });

    var platformChannelMonitorService = PlatformPoolModule.platformChannelMonitorService();
    var gatewayChannelMonitorService = sessionModule.gatewayChannelMonitorService();
    var gatewayTTLExpiredMonitorService = gatewayModule.gatewayTTLExpiredMonitorService();
    var frontendTTLExpiredMonitorService = frontEndService.frontendTTLExpiredMonitorService();

    initParams(function(err) {
        if (err) {
            console.log("internal error should not get here!!!!!!!");
            process.exit(1);
        }

        logger.info("Daemon started");

        //First of all define handler for exit. In case of of exception on next code
        process.on('SIGINT', function() {
            logger.info("daemon caught interrupt signal");
            if(serverAtExitProcess){
                return;
            }
            else {
                serverAtExitProcess = true;
            }



            async.series([
                function(callback) {
                    daemonTools.setDaemonExiting(callback);
                },
                function(callback) {
                    PlatformPoolModule.unsubscribeFromPlatformChannel();
                    gatewayModule.unsubscribeFromGatewayTTLExpiration();
                    sessionModule.unsubscribeFromGatewayChannel();
                    frontEndService.unsubscribeFromFronEndTTLExpiration();
                    platSelfReg.unsubscribeFromPlatformTTLExpiration();
                    callback(null);
                },
                function(callback) {
                    logger.info("Daemon stop PlatformPoolModule");
                    PlatformPoolModule.stopPoolTasks(callback);
                },
                function(callback) {
                    logger.info("Daemon stop cleanerService");
                    cleanerService.stop(callback);
                },
                function(callback) {
                    logger.info("Daemon stop schedulerService");
                    schedulerService.stop(callback);
                },
                function(callback) {
                    logger.info("Daemon stop updateLoginTTLService");
                    updateLoginTTLService.stop(callback);
                },
                function(callback) {
                    if (Common.isEnterpriseEdition()) {
                        Common.getEnterprise().dataCenter.stopDaemon(callback);
                    } else {
                        callback(null);
                    }
                },
                function(callback){
                    logger.info("Daemon stop platformChannelMonitorService");
                    platformChannelMonitorService.stop(callback);
                },
                function(callback){
                    logger.info("Daemon stop gatewayChannelMonitorService");
                    gatewayChannelMonitorService.stop(callback);
                },
                function(callback){
                    logger.info("Daemon stop gatewayTTLExpiredMonitorService");
                    gatewayTTLExpiredMonitorService.stop(callback);
                },
                function(callback){
                    logger.info("Daemon stop frontendTTLExpiredMonitorService");
                    frontendTTLExpiredMonitorService.stop(callback);
                },
                function(callback) {
                    logger.info("Daemon stop pingOfLifeService");
                    pingOfLifeService.stop(callback);
                },
                function(callback) {
                    logger.info("Daemon stop daemonTools");
                    daemonTools.stopDaemon(callback);
                }
            ], function(err) {
                logger.info("Daemon stoped");
                Common.quit();
            });
        });

        process.on('uncaughtException', function(err) {
            logger.error("uncaughtException: " + err);
            daemonTools.stopDaemon(function(err) {
                if (err) {
                    logger.error("mainFunction: " + err);
                    Common.quit(1);
                } else {
                    Common.quit(0);
                }
            });
        });

        pingOfLifeService.start();
        gatewayModule.subscribeToGatewayTTLExpiration();
        sessionModule.subscribeToGatewayChannel();
        PlatformPoolModule.subscribeToPlatformChannel();
        frontEndService.subscribeToFrontEndTTLExpiration();
        platSelfReg.subscribeToPlatformTTLExpiration();

        platformChannelMonitorService.start();
        gatewayChannelMonitorService.start();
        gatewayTTLExpiredMonitorService.start();
        frontendTTLExpiredMonitorService.start();

        updateLoginTTLService.start();

        if (Common.isEnterpriseEdition()) {
            Common.getEnterprise().dataCenter.startDaemon();
        }

        tryRun('./readOnlineJournal');
        cleanerService.start();
        schedulerService.start();
        tryRun('./readRedisSubscribeMsgs.js');


        if (Common.isEnterpriseEdition()) {
            Common.getEnterprise().addDaemonHandlers();
        }
        if (Common.isMobile()) {
            Common.getMobile().addDaemonHandlers();
        }
        if (Common.isDesktop()) {
            Common.getDesktop().addDaemonHandlers();
        }




        var addLastSessionsCmd = [];
        addLastSessionsCmd.push(nuboJobs.ADD_LAST_SESSIONS);
        nubocronAPI.addJobToDB("domain", 'addLastSessions', true, '*/1 * * * *', 'Etc/UTC', addLastSessionsCmd.join(','), true, Common.dcName, function(err) {});


        // copy app usage
        if (Common.syslogDb) {
            var copyAppUsageCmd = [];
            copyAppUsageCmd.push(nuboJobs.COPY_APP_USAGE);
            nubocronAPI.addJobToDB("domain", 'copyAppUsage', false, '45 0 * * *', 'Etc/UTC', copyAppUsageCmd.join(','), true, Common.dcName, function(err) {});
        }

        var dbMaintCmd = [];
        dbMaintCmd.push(nuboJobs.DATABASE_MAINT);
        nubocronAPI.addJobToDB("domain", 'databaseMaint', false, '35 0 * * *', 'Etc/UTC', dbMaintCmd.join(','), true, Common.dcName, function(err) {});
    });
};

Common.isDaemonProcess = true;

Common.loadCallback = function(err, firstTimeLoad) {
    if (firstTimeLoad) mainFunction(err, firstTimeLoad);
}

if (module) {
    module.exports = {
        mainFunction: mainFunction
    };
}

var tryRun = function(file) {
    try {
        if (file == './readOnlineJournal') {
            require('./readOnlineJournal');
        } else if (file == './readRedisSubscribeMsgs.js') {
            require('./readRedisSubscribeMsgs.js');
        } else {
            logger.erro(`tryRun: Module not defined: ${file}`);
        }
    } catch (e) {
        var msg = "Exception in script " + file + "\n" + e.stack
        global_msg = global_msg + msg + "\n"
        logger.error(msg);
    }
}


function initParams(callback) {

    async.series([
        function(callback){
            daemonTools.initDaemon(callback);
        },
        function(callback) {
            Common.redisClient.del("dc_clock_diff", callback);
        }
    ], function(err) {
        if (err) {
            return callback(err);
        }

        callback(null);
    });
}


function loadRequires() {

    PlatformPoolModule = require('./platformPool.js');
    nuboJobs = require('./nuboCronJobs.js').jobs;
    schedulerService = require('./nubocronScheduler.js');
    ThreadedLogger = require('./ThreadedLogger.js');
    nubocronAPI = require('./nubocronAPI.js');
    cleanerService = require('./cleaner.js').cleanerService;
    updateLoginTTLService = require('./updateLoginTTL.js');
    Service = require("./service.js");
    gatewayModule = require('./Gateway.js');
    sessionModule = require('./session.js');
    daemonTools = require('./daemonTools.js');
    platformModule = require('./platform.js');
    frontEndService = require('./frontEndService.js');
    platSelfReg = require('./platformSelfReg');
}
