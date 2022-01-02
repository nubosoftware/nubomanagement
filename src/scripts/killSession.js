/**
 *  killSession.js
 *  External kill for session
 *  Usage: node killSession.js -s [session id] | -e [email]'
 */

var StartSession = require('../StartSession.js');
var sessionModule = require('../session.js');
var Common = require('../common.js');
var Lock = require('../lock.js');
var async = require('async');
var logger = Common.getLogger(__filename);
var yargs = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0 [-s session id] | [-e email] | -a (all sessions)');

var myArgs = yargs.argv;

Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;

    console.log("\n\n");

    //check if I am root (needed for unison)
    var user = process.env.USER;
    if(user !== 'root'){
        console.error("Kill session: the script must be executed as superuser");
        logger.info('');
        Common.quit();
    }

    if (err) {
        console.log("Kill session err: " + err);
        Common.quit();
    }
    //kill by session ID
    if (myArgs.s) {
        StartSession.endSession(myArgs.s, function(err) {
            if (err) {
                console.log("Kill session err: " + err);
            } else {
                console.log("Killed session: " + myArgs.s);
            }
            Common.quit();
        });
        //kill by user email
    } else if (myArgs.e) {
        sessionModule.getSessionsOfUser(myArgs.e, function(sessions) {
            async.eachSeries(sessions, function(session, callback) {
                var sessId = session.params.sessid;
                async.series([
                    function(callback) {
                        removeLock(sessId, callback);
                    },
                    function(callback) {
                        StartSession.endSession(sessId, function(err) {
                            if (err) {
                                callback(err);
                                return;
                            }
                            console.log("Killed session: " + sessId);
                            callback(null);
                        });
                    }
                ], callback);
            }, function(err) {
                if (err)
                    console.log("Kill session err: " + err);

                Common.quit();
            });
        });
        //kill all sessions
    } else if (myArgs.a) {
        Common.redisClient.smembers('sessions', function(err, sessions) {
            if (err) {
                console.error("Kill session err: " + err);
                Common.quit();
            }

            async.eachSeries(sessions, function(sessId, callback) {
                StartSession.endSession(sessId, function(err) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    console.log("Killed session: " + sessId);
                    callback(null);
                });
            }, function(err) {
                if (err) {
                    console.error("Kill session err: " + err);
                }

                Common.quit();
            });
        });

    } else {
        
        yargs.showHelp();
        Common.quit();
        
    }
}

function removeLock(sessionID, callback) {

    async.waterfall([
        function(callback) {
            Common.redisClient.hget("sess_" + sessionID, "deviceid", function(err, deviceid) {
                if (err || !deviceid) {
                    var errMsg = "Cannot get sess_" + session_id + " deviceid";
                    callback(err);
                    return;
                }

                callback(null, deviceid);
            });
        },
        function(deviceid, callback) {
            var lockName = 'lock_' + myArgs.e + '_' + deviceid;
            Common.redisClient.del(lockName, function(err, reply) {
                if (err) {
                    var errMsg = "Kill session: error removing lock on \'" + lockName + "\' err: " + err;
                    callback(errMsg);
                    return;
                }

                if (reply == 1)
                    console.log("Kill session: removed lock: " + lockName);

                callback(null);

            });
        }
    ], callback);
}
