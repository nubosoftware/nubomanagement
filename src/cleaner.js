"use strict";
require('date-utils');
var Common = require('./common.js');
var sessionModule = require('./session.js');
var Session = sessionModule.Session;
var ThreadedLogger = require('./ThreadedLogger.js');
var async = require('async');
var logger = Common.getLogger(__filename);
var StartSession = require('./StartSession.js');
var MAX_SESSIONS_IN_PARALLEL = 5;
var cleanerStoped = false;
var cleanerStopedCallback;
var Service = require("./service.js");
const { promisify } = require("util");
const redisGet = promisify(Common.redisClient.get).bind(Common.redisClient);
const redisSet = promisify(Common.redisClient.set).bind(Common.redisClient);
const redisDel = promisify(Common.redisClient.del).bind(Common.redisClient);
const redisSmembers = promisify(Common.redisClient.smembers).bind(Common.redisClient);
const redisHgetall = promisify(Common.redisClient.hgetall).bind(Common.redisClient);
const fsp = require('fs').promises;
const path = require('path');


var cleanPltformLogCnt = 0;
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
                        logger.log('info',`"cleaner: Closing session after timeout. sessid: ${session.params.sessid}`,{
                            user: session.params.email,
                            device: session.params.deviceid,
                            mtype: "important"
                        });
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

    if (cleanPltformLogCnt % (12 * 60 * 24) == 0) { // run every 24 hour
        cleanPltformLogCnt = 0;
        cleanPlatformLogs();
    }
    cleanPltformLogCnt++;
}

var cleanerService = new Service(cleaner, {
    stop: function(callback) {
        cleanerStoped = true;
        callback(null);
    }
});


/**
 * Clean platform logs older than 7 days
 */
async function cleanPlatformLogs() {
    try {
        const folder = Common.syslogs_path;
        const directories = await fsp.readdir(folder);
        logger.info(`cleanPlatformLogs. directories: ${directories}`);
        // iterate over directories
        for (const directory of directories) {
            const directoryPath = path.join(folder, directory);
            const directoryStat = await fsp.stat(directoryPath);

            // filter files based on file path and modification time
            if (directoryStat.isDirectory() && /^platform_\d+$/.test(directory)) {
                const files = await fsp.readdir(directoryPath);
                for (const file of files) {
                    const filePath = path.join(directoryPath, file);
                    const fileStat = await fsp.stat(filePath);
                    const fileAge = Date.now() - fileStat.mtime.getTime();
                    const isOlderThan7Days = fileAge > (7 * 24 * 60 * 60 * 1000);
                    // console.log(`cleanPlatformLogs. file: ${file}, fileAge: ${fileAge}. isOlderThan7Days: ${isOlderThan7Days}`);
                    if (isOlderThan7Days) {
                        // delete file
                        logger.info(`cleanPlatformLogs. delete file: ${filePath}, file age in days: ${Number(fileAge / (24 * 60 * 60 * 1000)).toFixed(1)}`);
                        await fsp.unlink(filePath);
                    }
                };
            }
        }
    } catch (err) {
        logger.error(`cleanPlatformLogs error: ${err}.`,err);
    }
}


/**
 * Check if the management have sessions that are not running in the platoform and kill them in that case
 * @param {*} platform
 * @param {*} platSessions = Map of sessionss in the platofrm
 */
async function checkAndCleanPlatformSessions(platform,platSessions) {
    try {
        let arr = await redisSmembers(`platsesslist_${platform.params.platid}`);
        // logger.info(`checkAndCleanPlatformSessions. platsesslist: ${arr}`);
        for (const sessid of arr) {
            let sess = await redisHgetall(`sess_${sessid}`);
            if (!sess) {
                logger.info(`checkAndCleanPlatformSessions. Session ${sessid} does not exist!`);
                await Common.redisClient.srem(`platsesslist_${platform.params.platid}`, sessid);
                continue;
            }
            let key = `${sess.email}_${sess.deviceid}`;
            if (platSessions[key]) {
                // logger.info(`checkAndCleanPlatformSessions. Session ${key} is running in platform ${platform.params.platid}.`);
            } else {
                logger.info(`checkAndCleanPlatformSessions. Session ${key} is not running in platform ${platform.params.platid}!`);
                await endSession(sess);
            }
        }
    } catch (err) {
        logger.error(`checkAndCleanPlatformSessions error: ${err}.`,err);
    }
}

function endSession(sessionParams) {
    return new Promise((resolve, reject) => {
        StartSession.endSession(sessionParams.sessid, function(err) {
            if (err) {
                var errMsg = "" + sessionParams.sessid;
                logger.error(`cleaner: error ending session ${sessionParams.sessid} `,err);
            } else {
                logger.info("cleaner: session closed for user: " + sessionParams.email + " device: " + sessionParams.deviceid);
            }
            resolve();
            return;
        });
    });
}

module.exports =  {
    cleanerService,
    checkAndCleanPlatformSessions
};