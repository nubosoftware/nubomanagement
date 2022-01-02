"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var async = require('async');
var util = require('util');
var daemonTools = require('./daemonTools.js');
var gatewayModule = require('./Gateway.js');
var convert = require('xml-js');
var userModule = require('./user.js');
var fs = require('fs');
var Lock = require('./lock.js');
var Service = require("./service.js");
var path = require('path');
var commonUtils = require('./commonUtils.js');
const { sessionTimeout } = require('./common.js');

const MAX_SESSIONS_IN_PARALLEL = 20;

var Session, getSessionOfUserDevice, getSessionsOfUser, setUserDeviceLock, releaseUserDeviceLock, getSessionFromPlatformReference;

var Session = function(sessid, opts, callback) {
    var logger = Common.getLogger(__filename);
    if (typeof opts === "function") {
        callback = opts;
    } else {
        if (opts.logger) logger = opts.logger;
    }

    var newSession = false;

    this.params = {
        sessid: sessid,
        suspend: 0,
        totalActiveSeconds: 0
    };
    this.platform = [];
    this.logger = logger;

    this.save = function(callback) {
        (function(sess) {
            if (Object.keys(sess.params).length <= 1) {
                var stack = new Error().stack;
                console.log("Save session with one param: " + stack);
            }

            Common.redisClient.hmset('sess_' + sess.params.sessid, sess.params, function(err, obj) {
                if (err) {
                    logger.info("Error in save hmset:" + err);
                    if (callback) callback(err, null);
                    return;
                } else {
                    if (newSession) {
                        newSession = false;
                        Common.redisClient.sadd('sessions', sess.params.sessid, function(err, reply) {
                            if (err) {
                                if (callback) callback(err, sess);
                                return;
                            }
                            Common.redisClient.sadd('sessions_' + sess.params.platDomain, sess.params.sessid, function(err, reply) {
                                if (err) {
                                    if (callback) callback(err, sess);
                                    return;
                                }
                                if (callback) callback(err, sess);
                            });
                        });
                    } else
                    if (callback) callback(err, sess);
                } // else
            }); //hmset
        })(this); //function (sess)
    }; // save

    this.suspend = function(suspend, callback) {
        var now = new Date();
        this.params.suspend = suspend;
        this.params.suspendtime = now.toFormat("YYYY-MM-DD HH24:MI:SS");
        this.save(function(err, sess) {
            if (err) {
                if (callback) callback(err);
                return;
            }
            if (suspend == 0) {
                Common.redisClient.zrem('suspend_sessions', sess.params.sessid, function(err) {
                    if (callback) callback(err);
                });
            } else {
                Common.redisClient.zadd('suspend_sessions', now.getTime(), sess.params.sessid, function(err) {
                    if (callback) callback(err);
                });
            }
        }); // save
    }; //suspend

    this.forceExit = function(callback) {
        var now = new Date();
        this.params.forceExit = 1;
        this.params.suspendtime = now.toFormat("YYYY-MM-DD HH24:MI:SS");
        this.save(function(err, sess) {
            if (err) {
                callback(err);
                return;
            }
            Common.redisClient.zadd('suspend_sessions', 0, sess.params.sessid, function(err) {
                callback(err);
            });
        }); // save
    }; //forceExit

    this.del = function(callback) {
        var logger = this.logger;
        var self = this;

        var multi = Common.getRedisMulti();

        multi.del('sess_' + self.params.sessid);
        multi.del('usersess_' + self.params.email + '_' + self.params.deviceid);
        multi.srem('sessions', self.params.sessid);
        multi.srem('sessions_' + self.params.platDomain, self.params.sessid);
        multi.srem('usersess_' + self.params.email, self.params.sessid);
        multi.zrem('suspend_sessions', self.params.sessid);
        multi.srem('sessions_disconnected', self.params.sessid);
        multi.exec(function(err, replies) {
            if (err) {
                var errMsg = "session.del: " + err;
                logger.error(errMsg);
                callback(errMsg);
                return;
            }

            callback(null);
            return;
        });
    }

    this.deletePlatformReference = function(callback) {

        var logger = this.logger;
        var platid = this.params.platid;
        var sessid = this.params.sessid;
        var localid = this.params.localid;
        var multi = Common.getRedisMulti();

        multi.del('platsess_' + platid + '_' + localid);
        multi.srem('platsesslist_' + platid, sessid);
        multi.exec(function(err, replies) {
            if (err) {
                var errMsg = "session.deletePlatformReference: " + err;
                logger.error(errMsg);
                callback(errMsg);
                return;
            }

            callback(null);
            return;
        });
    }

    this.updatePlatformReference = function(callback) {
        if (!this.params.platid || !this.params.localid) {
            callback("Missing params for updatePlatformReference");
            return;
        }
        var platid = this.params.platid;
        var sessid = this.params.sessid;
        Common.redisClient.set('platsess_' + this.params.platid + '_' + this.params.localid, this.params.sessid, function(err) {
            if (err) {
                var msg = "Error on set updatePlatformReference: " + err;
                callback(msg);
                return;
            }
            Common.redisClient.sadd('platsesslist_' + platid, sessid, function(err) {
                if (err) {
                    var msg = "Error on set updatePlatformReference: " + err;
                    callback(msg);
                    return;
                }

                Common.redisClient.hincrby('platform_' + platid, 'created_sessions_cnt', 1, function(err,val) {
                    if (err) {
                        var msg = "updatePlatformReference: failed updating sessions counter";
                        callback(msg);
                        return;
                    }
                    logger.info(`created_sessions_cnt: ${val}`);
                    callback(null,val);
                });
            });
        }); // Common.redisClient.set
    };

    this.setUserAndDevice = function(email, deviceid, callback) {
            this.params.email = email;
            this.params.deviceid = deviceid;
            this.save(function(err, sess) {
                if (err) {
                    callback(err);
                    return;
                }
                Common.redisClient.set('usersess_' + email + '_' + deviceid, sess.params.sessid, function(err) {
                    if (err) {
                        callback(err);
                    } else {
                        Common.redisClient.sadd('usersess_' + email, sess.params.sessid, function(err) {
                            if (err) {
                                Common.redisClient.del('usersess_' + email + '_' + deviceid, function() {
                                    callback(err);
                                });
                            } else {
                                callback(null);
                            }
                        });
                    }
                }); // Common.redisClient.set
            }); // this.save

        } // this.setUserAndDevice

    this.setPlatform = function(platobj) {
        this.platform = platobj;
    };

    this.setLogger = function(logobj) {
        this.logger = logobj;
    };

    this.lock = function(obj, callback) {
        (function(sess) {
            var _obj, _callback;
            if (typeof(obj) === "function") {
                _callback = obj;
                _obj = {
                    retries: 1,
                    wait: 0
                };
            } else {
                _callback = callback;
                _obj = obj;
            }
            setUserDeviceLock(
                sess.params.email, sess.params.deviceid,
                _obj.retries, _obj.wait,
                _callback, sess.logger
            );
        })(this);
    }

    this.unlock = function(callback) {
        (function(sess) {
            releaseUserDeviceLock(
                sess.params.email, sess.params.deviceid,
                callback, sess.logger
            );
        })(this);
    }; //setUserDeviceLock

    if (sessid == null) { // generate new session
        newSession = true;
        if (Common.withService) {
            //override session id with username in motorola project
            this.params.sessid = opts.UserName;
        } else {
            var buf = Common.crypto.randomBytes(48);
            this.params.sessid = buf.toString('hex');

            //generate addition id for tracking
            var tbuf = Common.crypto.randomBytes(48);
            this.params.sessTrack = tbuf.toString('hex');
        }
        callback(null, this);
        return;

    } else { // load an existing session
        newSession = false;
        (function(sess) {
            var reply = Common.redisClient.hgetall('sess_' + sess.params.sessid, function(err, obj) {
                //console.dir(obj);
                if (err) {
                    callback(err, sess);
                    return;
                }
                if (obj != null) {
                    sess.params = obj;
                    callback(err, sess);
                    return;
                } else {
                    callback("Cannot find session " + sess.params.sessid, null);
                    return;
                }
            }); //hgetall
        })(this); // unction (sess)
    } // else // load an existing session

};


getSessionOfUserDevice = function(email, deviceid, callback) {

    if (Common.withService) {
        Common.redisClient.smembers('usersess_' + email, function(err, replies) {
            if (err) {
                return callback(err);
            }

            if (replies.length == 0) {
                return callback(null, null);
            }

            new Session(replies[0], function(err, obj) {
                if (err) {
                    return callback(err);
                }

                callback(null, obj);
            });

        });

    } else {
        Common.redisClient.get('usersess_' + email + '_' + deviceid, function(err, reply) {
            if (err) {
                return callback(err);
            }

            if (reply == null) {
                return callback(null, null);
            }

            new Session(reply, function(err, obj) {
                if (err) {
                    return callback(err);
                }

                callback(null, obj);
            });

        });
    }
};

getSessionsOfUser = function(email, callback) {
    Common.redisClient.smembers('usersess_' + email, function(err, replies) {
        if (err) {
            callback(err, null);
            return;
        }
        if (replies == null) {
            callback(null, null); // session not found with no error
            return;
        }
        var sessions = [];
        var i = 0;
        async.eachSeries(replies, function(reply, callback) {
            new Session(reply, function(err, obj) {
                if (err) {
                    console.log("Error: " + err);
                    callback(err, null);
                    return;
                }
                sessions[i] = obj;
                i++;
                callback(null);
            }); // new Session
        }, function(err) {
            if (err) {
                logger.info(err);
            }
            callback(sessions);
        });

    }); // Common.redisClient.get
}; //getSessionsOfUser

getSessionFromPlatformReference = function(platid, localid, callback) {

    Common.redisClient.get('platsess_' + platid + '_' + localid, function(err, reply) {
        if (err) {
            callback(err, null);
            return;
        }
        if (reply == null) {
            callback(null, null); // session not found with no error
            return;
        }
        new Session(reply, function(err, obj) {
            if (err) {
                console.log("Error: " + err);
                callback(err, null);
                return;
            }
            //console.log('Session: '+JSON.stringify(obj,null,2));
            callback(null, obj); //return found session
        }); // new Session

    }); // Common.redisClient.get
}; //getSessionFromPlatformReference

setUserDeviceLock = function(email, deviceid, retries, wait, callback, specialLogger) {
    var mylogger = (specialLogger ? specialLogger : logger);
    mylogger.info("Try to get lock on " + email + '_' + deviceid);
    Common.redisClient.setnx('lock_' + email + '_' + deviceid, 1, function(err, reply) {
        if (err) {
            mylogger.info("Error in the lock " + email + '_' + deviceid + " ,err: " + err);
            callback(err);
            return;
        }
        if (reply == 1) {
            mylogger.info("*********Successfull lock on " + email + '_' + deviceid);
            callback(null); // sucessfull lock
            return;
        }
        if (retries <= 0) {
            mylogger.info("Timeout in lock on " + email + '_' + deviceid);
            callback("Lock already exists");
        } else {
            mylogger.info("Wait on lock " + email + '_' + deviceid + ", retries: " + retries);
            setTimeout(function() {
                setUserDeviceLock(email, deviceid, retries - 1, wait, callback, specialLogger);
            }, wait);
        }
    }); // Common.redisClient.SETNX
}; //setUserDeviceLock

releaseUserDeviceLock = function(email, deviceid, callback, specialLogger) {
    var mylogger = (specialLogger ? specialLogger : logger);
    mylogger.info("Try to release lock on " + email + '_' + deviceid);
    Common.redisClient.del('lock_' + email + '_' + deviceid, function(err, reply) {
        if (err) {
            mylogger.info("Error in release lock " + email + '_' + deviceid + " ,err: " + err);
            callback(err);
            return;
        }
        if (reply == 1) {
            mylogger.info("*********Lock Released: " + email + '_' + deviceid);
        } else {
            mylogger.info("Lock not found !: " + email + '_' + deviceid + ", reply: " + reply);
        }
        callback(null);
    }); // Common.redisClient.SETNX
}; //setUserDeviceLock

// test function
var test = function() {
    /*
	var sess = new Session(null,function(err,obj) {
		if (err) {
		  console.log("Error: "+err);
		  return;
		}
		console.log('Session: '+JSON.stringify(obj,null,2));
		obj.params.deleteFlag = 0 ;
		obj.params['test1'] = 'test2';
		obj.save();

	});
	*/
    new Session('6cd8c879ca5b9a6ad067070b1ef0d79a045e64f1602f941de46d7fffac8c8a63f6ff3a0e760d6fa6e5664e6f14e900d5', function(err, obj) {
        if (err) {
            console.log("Error: " + err);
            return;
        }
        console.log('Session: ' + JSON.stringify(obj, null, 2));
        obj.params.deleteFlag = 5;
        obj.params['test1'] = 'gfdgfdg';
        obj.save();

    });
};

function subscribeToGatewayChannel() {
    Common.redisSub.subscribe("gatewayChannel", reconnectSessions);
}

function unsubscribeFromGatewayChannel() {
    Common.redisSub.unsubscribe("gatewayChannel", reconnectSessions);
}

function reconnectSessions(messsage) {

    logger.info("reconnectSessions: " + messsage);
    reconnectSessionsHelper(function() {});

}

function reconnectSessionsHelper(callback) {

    var disconnectedSessionsLock = new Lock({
        key: "lock_disconnected_sessions",
        logger: logger,
        numberOfRetries: 3,
        waitInterval: 500,
        lockTimeout: 1000 * 60 * 10 // 10 minutes max lock
    });

    var done = false;


    async.whilst(
        function() {
            return !done
        },
        function(callback) {

            disconnectedSessionsLock.cs(function(callback) {

                Common.redisClient.smembers('sessions_disconnected', function(err, sessions) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    if (sessions.length === 0) {
                        done = true;
                        callback(null);
                        return;
                    }

                    async.eachLimit(sessions, MAX_SESSIONS_IN_PARALLEL, function(sessID, callback) {
                        if (err) {
                            callback(err);
                            return;
                        }

                        daemonTools.isDaemonExiting(function(err, isExiting) {
                            if (err) {
                                callback(err);
                                return;
                            }

                            if (isExiting) {
                                logger.info("reconnectSessions: daemon is closing, aborting sessions reconnect");
                                callback('exit');
                                return;
                            }

                            reassignAvalibleGatewayForSession(sessID, function() {
                                callback(null);
                            });

                        });
                    }, callback);
                });
            }, function(err) {
                setTimeout(
                    (function() {
                        callback(err);
                    }), 5000);
            });
        },
        function(err) {
            if (err && err !== 'exit') {
                logger.error("reconnectSessions: " + err);
                return callback(err);
            }
            callback(null);
        }
    );
}

function gatewayChannelMonitorService() {
    var monitor = new Service(reconnectSessionsHelper, {
        period: 30
    });

    return monitor;
}

function reassignAvalibleGatewayForSession(sessId, callback) {

    var sessLock;
    var gwLock;
    var sessNotFound = false;

    async.waterfall([
        function(callback) {
            new Session(sessId, function(err, obj) {
                if (err) {
                    logger.error("reassignAvalibleGatewayForSession: " + err);
                    sessNotFound = true;
                    callback(err);
                    return;
                }

                callback(null, obj);
            });
        },
        function(session, callback) {
            if (session) {
                callback(null, session);
                return;
            }

            logger.warn("reassignAvalibleGatewayForSession: session doesn't exist");
            sessNotFound = true;
            callback('done');

        },
        function(session, callback) {
            var email = session.params.email;
            var deviceid = session.params.deviceid;

            sessLock = new Lock({
                key: "lock_" + email + "_" + deviceid,
                logger: logger,
                numberOfRetries: 10,
                waitInterval: 500,
                lockTimeout: 1000 * 60 * 30
            });

            sessLock.acquire(function(err, reply) {
                if (err) {
                    logger.error("reassignAvalibleGatewayForSession: " + err);
                    callback(err);
                    return;
                }

                if (reply === 1) {
                    callback(null, session);
                } else {
                    callback('done');
                }
            });
        },
        function(session, callback) {
            var gwObj = {
                index: -1
            };
            new gatewayModule.Gateway(gwObj, {
                logger: logger
            }, function(err, gateway) {
                if (err || !gateway) {
                    logger.error("reassignAvalibleGatewayForSession: failed to associate gateway to session");
                    callback("failed to associate gateway to session");
                    return;
                }

                session.params.gatewayIndex = gateway.params.index;
                session.params.gatewayInternal = gateway.params.internal_ip;
                session.params.gatewayExternal = gateway.params.external_ip;
                session.params.isSSL = gateway.params.ssl;
                session.params.gatewayPlayerPort = gateway.params.player_port;
                session.params.gatewayAppsPort = gateway.params.apps_port;
                session.params.gatewayControllerPort = gateway.params.controller_port;

                gwLock = gateway.lock;
                callback(null, session);
            });
        },
        // update gateway Reference
        function(session, callback) {
            gatewayModule.updateGWSessionScore(session.params.gatewayIndex, 1, session.params.sessid, session.logger, function(err) {
                if (err) {
                    callback("reassignAvalibleGatewayForSession: failed increasing gateway reference");
                    return;
                }
                callback(null, session);
            });
        },
        function(session, callback) {
            if (session.params.deviceid == "desktop") {
                callback(null, session, "na", "na");
                return;
            }
            var xmlFile = commonUtils.buildPath(Common.nfshomefolder, userModule.getUserDeviceDataFolder(session.params.email, session.params.deviceid), "/user/Session.xml");

            fs.readFile(xmlFile, function(err, data) {
                if (err) {
                    logger.error("reassignAvalibleGatewayForSession: " + err);
                    callback(err);
                    return;
                }

                // var opts = {
                //     object: true,
                //     reversible: true
                // }

                //var toJson = xml2jsonParser.toJson(data, opts);

                

                // toJson.session.gateway_url['$t'] = session.params.gatewayInternal;
                // toJson.session.gateway_controller_port['$t'] = session.params.gatewayControllerPort;
                // toJson.session.gateway_apps_port['$t'] = session.params.gatewayAppsPort;

                // var toXml = xml2jsonParser.toXml(toJson);
                // var newXml = "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\r\n" + toXml.replace(/></g, '>\r\n<');

                var toJson = convert.xml2js(data, {compact: true});
                toJson.session.gateway_url._text = session.params.gatewayInternal;
                toJson.session.gateway_controller_port._text = session.params.gatewayControllerPort;
                toJson.session.gateway_apps_port._text = session.params.gatewayAppsPort;
                var toXml = convert.js2xml(toJson,{compact: true});
                var newXml = "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\r\n" + toXml.replace(/></g, '>\r\n<');
                callback(null, session, newXml, xmlFile);
            });
        },
        function(session, newXml, xmlFile, callback) {
            if (session.params.deviceid == "desktop") {
                callback(null, session);
                return;
            }
            Common.fs.writeFile(xmlFile, newXml, function(err) {
                if (err) {
                    logger.error("reassignAvalibleGatewayForSession: " + err);
                    callback(err);
                    return;
                }

                Common.fs.chmod(xmlFile, '600', function(err) {
                    if (err) {
                        logger.error("reassignAvalibleGatewayForSession: " + err);
                        callback(err);
                        return;
                    }

                    Common.fs.chown(xmlFile, 1000, 1000, function(err) {
                        if (err) {
                            logger.error("reassignAvalibleGatewayForSession: " + err);
                            callback(err);
                            return;
                        }

                        callback(null, session);
                    });
                });
            });
        },
        function(session, callback) {
            session.save(function(err) {
                if (err) {
                    logger.error("reassignAvalibleGatewayForSession: " + err);
                    callback(err);
                    return;
                }

                callback(null, session);
            });
        },
        function(session, callback) {
            userModule.updateUserConnectedDevice(session.params.email, session.params.deviceid, session.params.platid, session.params.gatewayIndex, logger, function(err) {
                if (err) {
                    logger.error("reassignAvalibleGatewayForSession: failed updating connected platform and gateway of the session");
                    callback(err)
                    return;
                }

                callback(null, session);
            });
        },
        function(session, callback) {
            Common.redisClient.srem('sessions_disconnected', sessId, function(redisErr) {
                if (redisErr) {
                    logger.error("reassignAvalibleGatewayForSession: " + redisErr);
                }
                callback(null, session);
            });
        }
    ], function(err, session) {
        if (sessLock && sessLock.isAquired()) {
            sessLock.release(function() {});
        }

        if (gwLock && gwLock.isAquired()) {
            gwLock.release(function() {});
        }
        if (sessNotFound) {
            // delete session id from disconnected session as session does not exists
            Common.redisClient.srem('sessions_disconnected', sessId, function(redisErr) {
                if (redisErr) {
                    logger.error("reassignAvalibleGatewayForSession. sessions_disconnected srem error: " + redisErr);
                }                
            });
        }

        if (err) {
            // logger.error("reassignAvalibleGatewayForSession: " + err);
            return callback(err);
        }

        logger.info("reassignAvalibleGatewayForSession: user " + session.params.email + " moved to gateway " + session.params.gatewayIndex);
        callback(null);
    });
}

module.exports = {
    Session: Session,
    getSessionOfUserDevice: getSessionOfUserDevice,
    getSessionsOfUser: getSessionsOfUser,
    setUserDeviceLock: setUserDeviceLock,
    releaseUserDeviceLock: releaseUserDeviceLock,
    getSessionFromPlatformReference: getSessionFromPlatformReference,
    unsubscribeFromGatewayChannel: unsubscribeFromGatewayChannel,
    subscribeToGatewayChannel: subscribeToGatewayChannel,
    gatewayChannelMonitorService: gatewayChannelMonitorService
};
