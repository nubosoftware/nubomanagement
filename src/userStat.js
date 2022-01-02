/**
 *  userStat.js
 *  Print all user sessions information
 *  Usage: node userStat.js [-e <email>]
 */

var sessionModule = require('./session.js');
var Common = require('./common.js');
var async = require('async');

var myArgs = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0 -e <email>')
    .demandOption(['e'])
    .argv;


Common.loadCallback = function(err) {

    if (err) {
        console.log("user stat err: " + err);
        Common.quit();
    }

    
        sessionModule.getSessionsOfUser(myArgs.e, function(sessions) {
            if (sessions.length == 0) {
                console.log("user: " + myArgs.e + " doesn't have active sessions");
                Common.quit();
            } else {
                async.eachSeries(sessions, function(session, callback) {
                        printSessionInformation(session, function(err) {
                            callback(err);
                        });
                    },
                    function(err) {
                        if (err) {
                            console.error("err: " + err);
                        }
                        Common.quit();
                    });
            }
        });
    
}

function printSessionInformation(session, callback) {

    if (session == undefined)
        return callback("printSessionInformation: session is undefined");

    var sessId = session.params.sessid;

    async.waterfall([
        function(callback) {
            Common.redisClient.hgetall("sess_" + sessId, function(err, sess_sessionId) {
                if (err) {
                    callback("printSessionInformation: " + err);
                } else if (!sess_sessionId) {
                    callback("printSessionInformation: cannot find sess_" + sessId);
                } else {
                    callback(null, sess_sessionId);
                }
            });
        },
        function(sess_sessionId, callback) {
            var activation = sess_sessionId.activation;
            getDeviceType(activation, function(err, deviceType) {
                if (err) {
                    callback("printSessionInformation: " + err);

                } else {
                    callback(null, sess_sessionId, deviceType);
                }
            })
        },
        function(sess_sessionId, deviceType, callback) {
            getSuspendTime(sessId, function(err, sessionTTL) {
                if (err) {
                    callback("printSessionInformation: " + err);
                } else {
                    console.log("\n");
                    console.log("================================================================================================================");
                    console.log("Session ID:     " + sessId);
                    console.log("Device type:    " + deviceType);
                    console.log("Platform ID:    " + sess_sessionId.platid);
                    console.log("Platform IP:    " + sess_sessionId.platform_ip);
                    console.log("GW ID:          " + sess_sessionId.gatewayIndex);
                    console.log("External GW IP: " + sess_sessionId.gatewayExternal);
                    console.log("Internal GW IP: " + sess_sessionId.gatewayInternal);
                    console.log("Suspeneded:     " + sessionTTL);

                    callback(null);
                }
            })
        },
    ], callback);
}


function getDeviceType(activationKey, callback) {

    if (activationKey == undefined)
        return callback("getDeviceType: activationKey is undefined");

    Common.db.Activation.findAll({
            attributes: ['devicetype'],
            where: {
                activationkey: activationKey
            },
        }).complete(function(err, results) {
            if (!!err) {
                callback("getDeviceType: " + err, null);

            } else if (!results || results == "") {
                var msg = "getDeviceType: cannot find activation key: " + activationKey;
                callback(msg, null);

            } else {
                callback(null, results[0].devicetype);
            }
        }) //complete

}

function getSuspendTime(sessionID, callback) {

    if (sessionID == undefined)
        return callback("getSuspendTime: sessionID is undefined");

    Common.redisClient.zscore("suspend_sessions", sessionID, function(err, reply) {
        if (err) {
            callback("getSuspendTime: " + err, null);

        } else if (!reply) {
            callback(null, "not suspeneded");

        } else {
            var suspendTime = reply;
            var date = new Date();
            var sessionTTL = null;

            sessionTTL = Common.sessionTimeout - ((date.getTime() - suspendTime) / 1000);
            callback(null, sessionTTL);
        }

    });
}