"use strict";

var async = require('async');
var _ = require('underscore');
var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var StartSession = require('./StartSession.js');

if (process.argv.length<3) {
  console.log("Usage: node killUser.js [user]");
  Common.quit();
  return;
}

function forceEndSession(sessId, callback) {
    async.waterfall([
            // it is problem session so enforce clean deleteFlag
            function(callback) {
                Common.redisClient.hmset("sess_" + sessId, {deleteFlag: 0}, function(err) {
                        callback(null);
                });
            },
            // get information about the session
            function(callback) {
                Common.redisClient.hgetall("sess_" + sessId, callback);
            },
            // enforce delete locks for user and platform, usersess objects
            function(sessObj, callback) {
                var multi = Common.getRedisMulti();

                multi.del("lock_" + sessObj.email + "_" + sessObj.deviceid);
                multi.del("lock_platform_" + sessObj.platid);
                multi.del("usersess_" + sessObj.email + "_" + sessObj.deviceid);
                multi.srem("usersess_" + sessObj.email, sessId);
                multi.exec(function(err, replies) {
                    if (err) logger.error("Cannot execute redis pack request, err:" + err);
                    callback(null);
                });
            },
            //try delete session again
            function(callback) {
                StartSession.endSession(sessId, function(err) {
                    if(err) console.log("2nd time delete session, err:" + err);
                    callback(null);
                });
            },
            // check if session still exist
            function(callback) {
                Common.redisClient.hgetall("sess_" + sessId, callback);
            },
        ], function(err, result) {
            logger.info("forceEndSession result: ", result);
            callback(err);
        }
    );
}

function forceDeletePackagesLocks(email, callback) {
    async.waterfall([
            function(callback) {
                Common.redisClient.keys("lock_package_*", function(err, result) {
                    console.log("Packages locks: ", result);
                    callback(null, result);
                });
            },
            function(allLocks, callback) {
                var isUserLock = function(lock) {
                    var re = new RegExp('^lock_package_.*_' + email + "$");
                    return re.exec(lock);
                };
                var userLocks = _.filter(allLocks, isUserLock);
                console.log("User's packages locks: ", userLocks);
                callback(null, userLocks);
            },
            function(userLocks) {
                var multi = Common.getRedisMulti();

                userLocks.forEach(function(lock) {
                    multi.del(lock);
                });
                multi.exec(function(err, replies) {
                    if (err) logger.error("Cannot delete user's packages locks, err:" + err);
                    callback(null);
                });
            }
        ], function(err, result) {
            callback(null);
        }
    );
}

Common.loadCallback = function(err) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    var email = process.argv[2];
    async.waterfall([
            // get sessions of user
            function(callback) {
                Common.redisClient.smembers("usersess_" + email, callback);
            },
            // try finish it
            function(sessIds, callback) {
                logger.info("sessIds:", sessIds);
                async.each(
                    sessIds,
                    function(item, callback) {
                        StartSession.endSession(item, function(err) {
                            callback(null);
                        });
                    }, function(err) {
                        callback(null);
                    }
                );
            },
            function(callback) {
                forceDeletePackagesLocks(email, callback);
            },
            // get sessions of user again
            function(callback) {
                Common.redisClient.smembers("usersess_" + email, callback);
            },
            // try finish it
            function(sessIds, callback) {
                if (sessIds.length === 0) {
                    logger.info("All sessions was regularly closed");
                    callback("OK");
                    return;
                }
                logger.error("2nd sessIds:", sessIds);
                async.each(
                    sessIds,
                    function(item, callback) {
                        forceEndSession(item, function(err) {
                            callback(null);
                        });
                    }, function(err) {
                        logger.warn("Was problems on close sessions");
                        callback(null);
                    }
                );
            },
        ], function(err) {
            logger.info("script finished");
            Common.quit();
        }
    );
};

