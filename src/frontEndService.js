"use strict"

var Common = require('./common.js');
var async = require('async');
var Lock = require('./lock.js');
var Service = require("./service.js");
const componentVersionManager = require('./componentVersions.js');

var logger = Common.getLogger(__filename);

const TTL = 30;

async function registerFrontEnd(frontEndParams) {
    let frontendIndex;

    try {
        logger.info("registerFrontEnd: " + JSON.stringify(frontEndParams, null, 2));
        // Increment frontend sequence
        frontendIndex = await new Promise((resolve, reject) => {
            Common.redisClient.incr('frontendseq', (err, index) => {
                if (err) {
                    logger.error("registerFrontEnd: " + err);
                    reject(err);
                }
                resolve(index);
            });
        });

        // Create and execute lock
        const frontendLock = new Lock({
            key: "lock_frontend_" + frontendIndex,
            logger: logger
        });

        await new Promise((resolve, reject) => {
            frontendLock.cs(async function(callback) {
                frontEndParams['index'] = frontendIndex;
                const multi = Common.getRedisMulti();

                multi.hmset('frontend_' + frontendIndex, frontEndParams);
                multi.set('frontend_' + frontendIndex + '_ttl', 1);
                multi.expire('frontend_' + frontendIndex + '_ttl', TTL);
                multi.sadd('frontends', frontendIndex);
                multi.exec((err, replies) => {
                    if (err) reject(err);
                    resolve(replies);
                });
            });
        });

        if (frontEndParams.version && frontEndParams.buildTime) {
            const buildTime = new Date(frontEndParams.buildTime);
            componentVersionManager.addVersion('frontend', frontendIndex, frontEndParams.version, buildTime).then(() => {
                logger.info("registerFrontEnd: added frontend version to db");
            }).catch((err) => {
                logger.error("registerFrontEnd: failed to add frontend version to db, err:", err);
            });
        }

        return frontendIndex;

    } catch (err) {
        logger.error("registerFrontEnd: " + err);
        throw err;
    }
}

async function registerFrontEndRestApi(req, res) {
    res.contentType = 'json';

    const frontEndParams = {
        hostname: req.params.hostname,
        version: req.params.version,
        buildTime: req.params.buildTime
    };

    try {
        const frontendIndex = await registerFrontEnd(frontEndParams);
        res.send({
            status: Common.STATUS_OK,
            message: 'frontend registered successfully',
            index: frontendIndex,
            params: {
                disableSignup: Common.disableSignup,
                edition: Common.getEdition(),
                deviceTypes: Common.getDeviceTypes()
            }
        });
    } catch (err) {
        res.send({
            status: Common.STATUS_ERROR,
            message: 'failed registering'
        });
    }
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

    // Remove frontend record
    componentVersionManager.removeRecord('frontend', frontendIndex).then(() => {
        logger.info("unregisterFrontEnd: removed frontend record from db");
    }).catch((err) => {
        logger.error("unregisterFrontEnd: failed to remove frontend record from db, err:", err);
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