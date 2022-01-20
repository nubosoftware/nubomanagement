
var Common = require('./common.js');
var async = require('async');
var logger = Common.getLogger(__filename);

var redisModule = require("redis");
var util = require('util');
var Lock = require('./lock.js');
var platformModule = require('./platform.js');
var gatewayModule = require('./Gateway.js');
var Platform = platformModule.Platform;

var errGatewayAlreadyExist = -7;
var errIllegalPlatformId = -6;
var errIllegalLoginToken = -5;
var errIllegalDeviceId = -4;
var errIllegalRedisData = -3;
var errIllegalSessionID = -2;
// var errNoConnection_GW_REDIS = -1;
var statusOK = 0;


function registerGateway(req, res) {
    var status = statusOK;
    var msg = "";
    res.contentType = 'json';

    var baseIndex = req.params.baseIndex;
    var offset = req.params.offset;
    let internal_ip = req.params.internal_ip;
    if (internal_ip == "auto") {
        internal_ip = req.socket.remoteAddress;
        logger.info(`registerGateway. Detected internal_ip: ${internal_ip}`);
    }

    var settingsData = {
        "internal_ip" : internal_ip,
        "controller_port" : req.params.controller_port,
        "apps_port" : req.params.apps_port,
        "external_ip" : req.params.external_ip,
        "player_port" : req.params.player_port,
        "ssl" : req.params.ssl
    };

    // logger.info("registerGateway. baseIndex: " + baseIndex + ", offset: " + offset);
    // logger.info(JSON.stringify(settingsData, null, 4));

    gatewayModule.registerGateway(settingsData, baseIndex, offset, function(err, gwIndex) {
        if (err) {
            res.send({
                status: errIllegalRedisData,
                msg: 'failed registering GW',
                gwIdx: gwIndex,
                platformVersionCode: Common.platformVersionCode
            });
            return;
        }

        res.send({
            status: statusOK,
            msg: 'GW registered susccefully',
            gwIdx: gwIndex,
            platformVersionCode: Common.platformVersionCode
        });

    });

}

function updateGatewayTtl(req, res) {
    var status = statusOK;
    var msg = "";
    res.contentType = 'json';

    var idx = req.params.idx;
    var ttl = req.params.ttl;

    gatewayModule.refreshGatewayTTL(idx, ttl, function(err, isExist) {
        if (err || !isExist) {
            res.send({
                status: errIllegalRedisData,
                msg: 'failed refreshing GW ttl',
            });
            return;
        }
        res.send({
            status: statusOK,
            msg: 'GW updated TTL susccefully',
        });

    });
}

function validateUpdSession(req, res) {
    var status = statusOK;
    var msg = "";
    res.contentType = 'json';

    var sessionID = req.params.session;
    var suspend = req.params.suspend;

    var now = new Date();
    var d = now.toFormat("YYYY-MM-DD HH24:MI:SS");
    var suspend_sessions = now.getTime();

    var activationKey = "";
    var session;

    async.series([
        function(callback) {
            Common.redisClient.hgetall("sess_" + sessionID, function (err, sessid) {
                if (err) {
                    status = errIllegalSessionID;
                    msg = "validateUpdSession. cannot get sessid " + sessionID + ", " + err;
                    logger.error(msg);
                    callback(status);
                    return;
                }
                if (sessid === null) {
                    status = errIllegalSessionID;
                    msg = "validateUpdSession. sess_" + sessionID + " does not exits"
                    logger.warn(msg);
                    callback(status);
                    return;
                }

                session = sessid;
                activationKey = session["activation"];

                if (!activationKey) {
                    status = errIllegalRedisData;
                    msg = "validateUpdSession. activation does not exits";
                    logger.warn(msg);
                    callback(status);
                    return;
                }
                callback(null);
            });
        },
        function(callback) {
            if (suspend == 0 || suspend == 1) {
                session["suspend"] = suspend;
                session["suspendtime"] = d;

                var data = {
                    "suspend": suspend,
                    "suspendtime": d
                };

                Common.redisClient.hmset("sess_" + sessionID, data, function (err, obj) {
                    if (err) {
                        status = errIllegalRedisData;
                        msg = "validateUpdSession. cannot set sess_" + sessionID + ", " + err;
                        logger.error(msg);
                        callback(status);
                        return;
                    }
                    callback(null);
                });
            } else {
                //logger.info("Not update suspend params!");
                callback(null);
            }
        },
        function(callback) {
            if (suspend == 0) {
                Common.redisClient.zrem("suspend_sessions", sessionID, function (err, obj) {
                    if (err) {
                        status = errIllegalRedisData;
                        msg = "validateUpdSession. cannot zrem suspend_sessions: " + sessionID  + ", " + err;
                        logger.error(msg);
                        callback(status);
                        return;
                    }
                    callback(null);
                });
            } else if (suspend == 1) {
                Common.redisClient.zadd("suspend_sessions", suspend_sessions, sessionID, function (err, obj) {
                    if (err) {
                        status = errIllegalRedisData;
                        msg = "validateUpdSession. cannot zadd suspend_sessions: " + suspend_sessions + ", " + err;
                        logger.error(msg);
                        callback(status);
                        return;
                    }
                    callback(null);
                });
            } else {
                callback(null);
            }
        },
        function(callback) {
            var rpushVal = "";
            if (suspend == 0) {
                rpushVal = activationKey + "_1";
            } if (suspend == 1) {
                rpushVal = activationKey + "_0";
            }
            if (rpushVal !== "") {
                Common.redisClient.rpush("online_journal", rpushVal, function (err, obj) {
                    if (err) {
                        status = errIllegalRedisData;
                        msg = "validateUpdSession. cannot rpush online_journal " + err;
                        logger.error(msg);
                        callback(status);
                        return;
                    }
                    callback(null);
                });
            } else {
                callback(null);
            }
        }
    ],
    function(err) {
        res.send({
            status : status,
            msg : msg,
            session : session
        });
    });
}

function unregisterGateway(req, res) {
    var status = statusOK;
    var msg = "";
    res.contentType = 'json';

    var gwIdxList = req.params.idx;
    if (!util.isArray(gwIdxList)) {
        gwIdxList = [gwIdxList];
    }

    gatewayModule.unregisterGateway(gwIdxList, function(err){
        if (err) {
            res.send({
                status: errNoConnection_GW_REDIS,
                msg: 'failed unregister GW'
            });
            return;
        }

        res.send({
            status: statusOK,
            msg: 'GW unregister susccefully'
        });

    });


}

function addPlatform2ErrsList(req, res) {
    var status = statusOK;
    var msg = "";
    res.contentType = 'json';

    var score;
    var response = 0;
    var platformId = req.params.platformID;

    logger.error("addPlatform2ErrsList  platformId: " + platformId);

    async.waterfall([
        function(callback){
            new Platform(platformId, null, function(err, obj) {
                if (err || !obj) {
                    status = errIllegalRedisData;
                    msg = "addPlatform2ErrsList: platform does not exist. err:" + err;
                    callback(msg);
                    return;
                }

                callback(null, obj);
            });
        },
        function(platform, callback){
            platform.addToErrorPlatforms(function(err) {
                if (err){
                    status = errIllegalRedisData;
                    msg = "Cannot move platform to platforms_errs, err: " + err;
                    logger.error(msg);
                    callback(err);
                    return;
                }
                callback(null);
            });
        },
    ], function(err){
        res.send({
            status : status,
            msg : msg
        });
    });
}

function isPlatformInPlatformsList(req, res) {
    var status = statusOK;
    var msg = "";
    res.contentType = 'json';

    var platformId = req.params.platformID;

    Common.redisClient.zscore("platforms", platformId, function (err, score) {
        if (err) {
            status = errIllegalRedisData;
            msg = "isPlatformInPlatformsList. cannot zscore platforms: " + platforms + ", " + err;
            logger.error(msg);
        } else {
            if (score === null) {
                status = errIllegalPlatformId;
            } else {
                status = statusOK;
            }
        }
        res.send({
            status : status,
            msg : msg
        });
    });
}

function checkLoginTokenOnRedis(req, res) {
    var status = statusOK;
    var msg = "";
    res.contentType = 'json';

    var loginToken = req.params.loginToken;

    Common.redisClient.hget("login_" + loginToken, "loginToken", function (err, token) {
        if (err) {
            status = errNoConnection_GW_REDIS;
            msg = "checkLoginTokenOnRedis. cannot get login_" + loginToken + ", " + err;
            logger.error(msg);
        } else if (!token) {
            status = errIllegalLoginToken;
            msg = "checkLoginTokenOnRedis. Illegal login_" + loginToken;
            logger.error(msg);
        }
        res.send({
            status : status,
            msg : msg
        });
    });
}

function reportRecording(req, res) {
    var status = statusOK;
    var msg = "";
    res.contentType = 'json';

    var publishMsg = req.params.publishMsg;

    Common.redisClient.publish("recording_msgs", publishMsg, function (err, obj) {
        if (err) {
            status = errIllegalRedisData;
            msg = "reportRecording. cannot publish " + publishMsg + ", " + err;
            logger.error(msg);
        }
        res.send({
                status : status,
                msg : msg
        });
    });
}

var redisGateway = {
    'registerGateway' : registerGateway,
    'unregisterGateway' : unregisterGateway,
    'updateGatewayTtl' : updateGatewayTtl,
    'validateUpdSession' : validateUpdSession,
    'isPlatformInPlatformsList' : isPlatformInPlatformsList,
    'addPlatform2ErrsList' : addPlatform2ErrsList,
    'checkLoginTokenOnRedis' : checkLoginTokenOnRedis,
    'reportRecording' : reportRecording
};

module.exports = redisGateway;