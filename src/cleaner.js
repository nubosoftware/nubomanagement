"use strict";
require('date-utils');
var Common = require('./common.js');
var sessionModule = require('./session.js');
var Session = sessionModule.Session;
var ThreadedLogger = require('./ThreadedLogger.js');
var async = require('async');
var logger = new ThreadedLogger(Common.getLogger(__filename));
logger.user("cleaner");
var StartSession = require('./StartSession.js');
var MAX_SESSIONS_IN_PARALLEL = 5;
var cleanerStoped = false;
var cleanerStopedCallback;
var Service = require("./service.js");

function cleaner(callback) {
    var now = new Date();
    var timeoutTime = new Date(now.getTime() - Common.sessionTimeout * 1000).getTime();
    Common.redisClient.zrangebyscore('suspend_sessions', "-inf", timeoutTime, function(err, sessions) {

        if (cleanerStoped) {
            logger.info("cleaner: stoped");
            callback(null);
            return;
        }

        if (err || !sessions) {
            callback(null);
            return;
        }

        async.eachLimit(sessions, MAX_SESSIONS_IN_PARALLEL, function(sessID, callback) {

                if (cleanerStoped) {
                    callback(null);
                    return;
                }

                new Session(sessID, function(err, session) {
                    if (err) {
                        var errMsg = "cleaner: error: " + err;
                        logger.error(errMsg);
                        callback(null);
                        return;
                    }

                    if (session) {
                        StartSession.endSession(session.params.sessid, function(err) {
                            if (err) {
                                var errMsg = "cleaner: error ending session - " + session.params.sessid;
                                logger.error(errMsg);
                            } else {
                                logger.info("cleaner: session closed for user: " + session.params.email + " device: " + session.params.deviceid);
                            }


                            callback(null);
                            return;
                        });
                    } else {
                        var msg = "cleaner: session does not exist.";
                        logger.error(msg);
                        callback(null);
                        return;
                    }
                });
            },
            function(err) {
                if(cleanerStoped){
                    logger.info("cleaner: stoped");
                }
                callback(null);
            });
    });
}

var cleanerService = new Service(cleaner, {
    stop: function(callback) {
        cleanerStoped = true;
        callback(null);
    }
});

module.exports = cleanerService