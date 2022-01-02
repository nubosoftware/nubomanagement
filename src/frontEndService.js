"use strict"

var Common = require('./common.js');
var async = require('async');
var Lock = require('./lock.js');
var Service = require("./service.js");

var logger = Common.getLogger(__filename);

const TTL = 30;

function registerFrontEnd(frontEndParams, callback) {

    var frontendIndex;

    async.series([
        function(callback) {
            Common.redisClient.incr('frontendseq', function(err, index) {
                if (err) {
                    logger.error("registerFrontEnd: " + err);
                    callback(err);
                    return;
                }

                frontendIndex = index;
                callback(null);
            });
        },
        function(callback) {

            var frontendLock = new Lock({
                key: "lock_frontend_" + frontendIndex,
                logger: logger
            });

            frontendLock.cs(
                function(callback) {
                    frontEndParams['index'] = frontendIndex;
                    var multi = Common.getRedisMulti();

                    multi.hmset('frontend_' + frontendIndex, frontEndParams);
                    multi.set('frontend_' + frontendIndex + '_ttl', 1);
                    multi.expire('frontend_' + frontendIndex + '_ttl', TTL);
                    multi.sadd('frontends', frontendIndex);
                    multi.exec(function(err, replies) {
                        if (err) {
                            logger.error("registerFrontEnd: " + err);
                            callback(err);
                        }

                        logger.info("registerFrontEnd: frontend " + frontendIndex + " registered");
                        callback(null);
                    });

                }, callback);
        }
    ], function(err) {
        callback(err, frontendIndex);
    });
}

function registerFrontEndRestApi(req, res, next) {
    res.contentType = 'json';

    var frontEndParams = {
        hostname: req.params.hostname
    }

    registerFrontEnd(frontEndParams, function(err, frontendIndex) {
        if (err) {
            res.send({
                status: Common.STATUS_ERROR,
                message: 'failed registering'
            });
            return;
        }

        res.send({
            status: Common.STATUS_OK,
            message: 'frontend registered susccefully',
            index: frontendIndex,
            params: {
                disableSignup: Common.disableSignup,
                edition: Common.getEdition(),
                deviceTypes: Common.getDeviceTypes()
            }
        });
        return;

    })
}

function refreshFrontEndTTL(frontendIndex, callback) {
    Common.redisClient.expire("frontend_" + frontendIndex + "_ttl", TTL, function(err, replay) {
        if (err) {
            logger.error("refreshFrontEndTTL: " + err);
            callback(err);
            return;
        }

        if (replay == 0) {
            logger.warn("refreshFrontEndTTL: frontend_" + frontendIndex + "_ttl expired " + replay);
        }

        callback(null, replay);
    });
}

function refreshFrontEndTTLRestApi(req, res, next) {
    res.contentType = 'json';

    refreshFrontEndTTL(req.params.index, function(err, replay) {
        if (err) {
            res.send({
                status: Common.STATUS_ERROR,
                message: "failed"
            });
            return;
        }

        if (replay) {
            res.send({
                status: Common.STATUS_OK,
                params: {
                    disableSignup: Common.disableSignup,
                    edition: Common.getEdition(),
                    deviceTypes: Common.getDeviceTypes()
                }
            });
        } else {
            res.send({
                status: Common.STATUS_ERROR,
                message: "not registered"
            });
        }

    })
}

function unregisterFrontEnd(frontendIndex, callback) {

    var multi = Common.getRedisMulti();


    var frontendLock = new Lock({
        key: "lock_frontend_" + frontendIndex,
        logger: logger
    });

    frontendLock.cs(function(callback) {

        multi.srem('frontends', frontendIndex);
        multi.del('frontend_' + frontendIndex);
        multi.del('frontend_' + frontendIndex + '_ttl');

        multi.exec(function(err, replies) {
            if (err) {
                logger.error("unregisterFrontEnd: cannot remove frontend from redis, err:", err);
                callback(err);
                return;
            }

            Common.redisClient.publish("frontendChannel", "frontend " + frontendIndex + " unregistered");
            logger.info("unregisterFrontEnd: frontend " + frontendIndex + " unregistered");
            callback(null);
        });
    }, callback);
}

function unregisterFrontEndRestApi(req, res, next) {
    res.contentType = 'json';

    unregisterFrontEnd(req.params.index, function(err) {
        if (err) {
            res.send({
                status: Common.STATUS_ERROR,
                message: 'failed'
            });
            return;
        }

        res.send({
            status: Common.STATUS_OK,
        });
    })
}

function unregisterTTLExpiredFrontEnds(callback) {

    Common.redisClient.smembers('frontends', function(err, frontends) {
        if (err) {
            logger.error("unregisterTTLExpiredFrontEnds: " + err);
            return;
        }

        if (!frontends.length) {
            return callback(null);
        }
        async.eachLimit(frontends, 100, function(frontend, callback) {

            Common.redisClient.exists("frontend_" + frontend + "_ttl", function(err, frontendExists) {
                if (err) {
                    callback(err);
                    return;
                }

                if (frontendExists === 1) {
                    callback(null);
                    return;
                }

                unregisterFrontEnd(frontend, callback);
            });
        }, function(err) {
            if (err) {
                logger.error("unregisterTTLExpiredFrontEnds: " + err);
                return callback(err);
            }

            callback(null);
        });
    });
}

function frontendTTLExpiredMonitorService() {
    var mon = new Service(unregisterTTLExpiredFrontEnds, {
        period: TTL
    });

    return mon;
}

function frontEndTTLExpired(frontend, redisOp) {

    // console.log(redisOp)
    if (redisOp !== 'expired') {
        logger.error("frontEndTTLExpired: internal error, only expired operation supported");
        return;
    }

    var re = new RegExp('(__keyspace@0__:frontend_)(.*)(_ttl)');
    var m = re.exec(frontend);

    if (m == null) {
        logger.error("frontEndTTLExpired: internal error, unsupported event " + frontend);
        return;
    }

    var frontendIdx = m[2];

    logger.info("frontEndTTLExpired: frontend " + frontendIdx + " ttl expired");
    unregisterFrontEnd(frontendIdx, function() {});

}

function subscribeToFrontEndTTLExpiration() {

    Common.redisSub.psubscribe("__keyspace@0__:frontend_*", frontEndTTLExpired);
}

function unsubscribeFromFronEndTTLExpiration() {

    Common.redisSub.punsubscribe("__keyspace@0__:frontend_*", frontEndTTLExpired);

}

function isFrontEndsOnline(callback) {

    Common.redisClient.smembers("frontends", function(err, frontends) {
        if (err) {
            return callback(err);
        }

        if (!frontends.length) {
            return callback(null, false);
        }

        return callback(null, true);
    })

}

module.exports = {
    registerFrontEndRestApi: registerFrontEndRestApi,
    refreshFrontEndTTLRestApi: refreshFrontEndTTLRestApi,
    unregisterFrontEndRestApi: unregisterFrontEndRestApi,
    frontendTTLExpiredMonitorService: frontendTTLExpiredMonitorService,
    subscribeToFrontEndTTLExpiration: subscribeToFrontEndTTLExpiration,
    unsubscribeFromFronEndTTLExpiration: unsubscribeFromFronEndTTLExpiration,
    isFrontEndsOnline: isFrontEndsOnline

}