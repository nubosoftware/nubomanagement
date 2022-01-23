"use strict";
/**
 *  platformPool.js
 *  Maintain pool of platforms
 *
 *  CapacityLevel - ratio of running sessions to number of session that current number
 *            of platform can serve.
 *  Exist 4 parametes that set running platform number requestment:
 *    platformPoolSize - minimal number of running platforms
 *    upperCapacityLevel - on arriving to the ratio start new platform. If current number
 *            of platforms can serve maxCapacity of session, upperCapacityLevel will been ignored
 *    bottonCapacityLevel - on descend to the ratio free platforms can been closed. If number
 *            of platforms descend to platformPoolSize, bottonCapacityLevel will been ignored
 *    maxCapacity - maximum number of running sessions, it can disable upperCapacityLevel in
 *            case of current number of platform can serve maxCapacity sessions.
 *
 */
var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var platformModule = require('./platform.js');
var Service = require("./service.js");
var async = require('async');

var pParams = Common.platformParams;

var poolQueue = async.queue(
    function(task, callback) {
        task(function(err) {
            callback(err)
        });
    }, pParams.concurrency);

function startNPlatforms(n, opts, callback) {
    if (n === 0) {
        callback(null);
    } else if (n > 0) {
        // Fill queue with delay tasks to avoid simultanious start of few platforms.
        if (pParams.concurrencyDelay) {
            for (var i = 1; i < (pParams.concurrency - poolQueue.running()); i++) {
                (function(i) {
                    poolQueue.push(
                        function(cb) {
                            setTimeout(function() {
                                cb(null)
                            }, i * pParams.concurrencyDelay);
                        }
                    );
                })(i);
            }
        }
        for (var i = 0; i < n; i++) {
            poolQueue.push(
                function(cb) {
                    
                    platformModule.registerPlatformNum(opts, function(err) {
                        if (err) {
                            logger.error("ERROR: " + err);
                            logger.error("ERROR: cannot fulfill number of platforms");
                            logger.error("ERROR: fix platformParams.platformPoolSize/platformParams.maxCapacity to meet the reality");
                            setTimeout(function() {
                                cb(null);
                            }, 60 * 1000);
                        } else {
                            cb(null);
                        }
                    });
                }
            );
        }
        callback(null);
    } else {
        callback(null);
        // tryKillNPlatforms(-n, platDomain, callback);
    }
}

function refreshHelper(domain, callback) {

    var currSize = 0;
    var nSessions = 0;
    var runningPlatforms = 0;
    var idlePlatforms = 0;
    var errPlatforms = 0;
    var platformRegs;
    var opts = {
        platType: "",
        domain: domain
    };

    async.waterfall([
        function(callback) {
            removeSuspendedPlatforms(callback);
        },
        function(callback) {
            var multi = Common.getRedisMulti();

            multi.zcard('platforms_' + domain);
            multi.scard('platforms_idle_' + domain);
            multi.scard('sessions_' + domain);
            multi.zcard('platforms_errs_' + domain);
            multi.smembers('platform_regs');
            multi.exec(function(err, replies) {
                if (err) {
                    logger.error("platformPool cannot get data from redis err: %j, replies: %s", err, replies.toString());
                    callback("platformPool cannot get data from redis");
                } else {
                    runningPlatforms = replies[0];
                    idlePlatforms = replies[1];
                    nSessions = replies[2];
                    errPlatforms = replies[3];
                    platformRegs = replies[4];
                    //logger.info(`platformRegs: ${JSON.stringify(platformRegs)}`);
                    callback(null);
                }
            });
        },
        function(callback) {
            //logger.info("platformPool sess: " + nSessions + " rp: " + runningPlatforms + " ip: " + idlePlatforms);
            // we can mistake in maxCapacityCurrent cause of some task in queue (q.running())
            // may been delay function, but it is not critical error
            let required = 0;
            if (pParams['poolStrategy'] == "calculated" || !pParams['poolStrategy']) {
                var requiredByDefault = pParams['platformPoolSize'] - runningPlatforms - poolQueue.length() - poolQueue.running();
                if (pParams.fixedPool) requiredByDefault -= errPlatforms;
                var pLoad = nSessions / pParams["usersPerPlatform"]; // how many platforms should be running
                var CapacityLevel = (runningPlatforms === 0) ? 0 : pLoad / runningPlatforms; // 1 - exact capacity. Less then 1 - need more
                //logger.info("platformPool CapacityLevel: " + CapacityLevel);
                required = Math.max(requiredByDefault, 0); //need arrive to minimal number of platforms
                if (required === 0) {
                    if (CapacityLevel > pParams["upperCapacityLevel"]) {
                        var maxPlatforms = pParams["maxCapacity"] / pParams["usersPerPlatform"];
                        var requiredPlatformsTotal = Math.ceil(Math.min(pLoad / pParams["upperCapacityLevel"], maxPlatforms));
                        var requiredCreate = requiredPlatformsTotal - runningPlatforms - poolQueue.length() - poolQueue.running();
                        required = Math.max(requiredCreate, 0); // in that part platforms can been created only
                    } else if (CapacityLevel < pParams["bottomCapacityLevel"]) {
                        var requiredPlatformsTotal = runningPlatforms;
                        if (pParams["bottomCapacityLevel"] > 0) {
                            requiredPlatformsTotal = Math.ceil(nSessions / pParams["bottomCapacityLevel"] / pParams["usersPerPlatform"]);
                        }
                        var requiredKill = Math.min(requiredPlatformsTotal - runningPlatforms, 0);

                        required = Math.max(requiredKill, pParams['platformPoolSize'] - runningPlatforms);
                        required = Math.min(required, 0); // in that part platforms can been killed only
                    }
                }
            } else if (pParams['poolStrategy'] == "StartAll" && platformRegs) {
                required = platformRegs.length - runningPlatforms - poolQueue.length() - poolQueue.running();
                if (required < 0) {
                    required = 0;
                }
                // caluclatged min and max platform number based on platformRegs
                opts.min = 1000000;
                opts.max = 0;
                for (const platidStr of platformRegs) {
                    const platid = Number(platidStr);
                    if (platid < opts.min) {
                        opts.min = platid
                    }
                    if ((platid + 1)> opts.max) {
                        opts.max = platid+1;
                    }
                }
                //logger.info(`startNPlatforms opts: ${JSON.stringify(opts,null,2)}`);
            }

            // Platform we need to run to keep requested level
            poolQueue.concurrency = pParams.concurrency;
            if (required != 0) {
                logger.info("Start new " + required + " platforms to fill pool");
                startNPlatforms(required, opts, callback);
            } else {
                callback(null);
            }
        }
    ], function(err) {
        if (err) {
            logger.error("refreshHelper: " + err);
            return callback(err);
        }

        callback(null);
    });
}


function refresh(callback) {   
    // last command in q is refresh, so the task already exist in q
    if (poolQueue.running()) {
        logger.info("platformPool: Not runnig refresh because poolQueue is already running task(s).");
        callback(null);
        return;
    }

    var domains = ['common']; // default

    Common.db.Orgs.findAll({
        attributes: ['maindomain'],
        where: {
            dedicatedplatform: 1
        }
    }).complete(function(err, results) {
        if (!!err) {
            var msg = 'refresh: ' + err;
            logger.error(msg);
            return;
        }

        if (results) {
            results.forEach(function(row) {
                domains.push(row.maindomain);
            });
        }

        async.eachSeries(domains, function(domain, callback) {            
            refreshHelper(domain, function(err) {
                if (err) {
                    logger.error("refresh: failed refreshing platforms for \'" + domain + "\' domain");
                }
                callback(null);
            });
        }, function(err) {

            if (poolQueue.idle()) {
                return callback(null);
            }

            poolQueue.drain = function() {
                callback(null);
            }
        });
    });
}


// Scan platforms_errs for platforms without users and kill it. No refresh needed case of refresh happaned on move to errors platforms
function removeSuspendedPlatforms(callback) {

    Common.redisClient.zrangebyscore('platforms_errs', "-inf", 0, function(err, replies) {
        if (err || replies.length < 1) {
            callback(null);
            return;
        }

        async.each(
            replies,
            function(item, callback) {
                platformModule.killPlatform(item, null, function(err) {
                    callback(null)
                });
            },
            function(err) {
                callback(null);
            }
        );
    }); //ZRANGE
}

function closePlatforms(callback) {
    //logger.info("closePlatforms called");
    Common.redisClient.smembers("platforms_close", function(err, replies) {
        if (err) {
            logger.error("closePlatforms: " + err);
            return callback(err);
        }

        if (replies.length < 1) {
            return callback(null);
        }

        async.each(
            replies,
            function(item, callback) {
                platformModule.killPlatform(item, null, function(err) {
                    if (err)
                        logger.error("closePlatforms: " + err);
                    callback(null);
                });
            },
            function(err) {
                return callback(null);
            });
    }); //ZRANGE
}


function platformChannel(message) {
    //logger.info("platformChannel: "+message+" message.");
    if (message === 'refresh') {
        refresh(function() {});
    } else if (message === 'close') {
        closePlatforms(function() {});
    }
}

function subscribeToPlatformChannel() {

    Common.redisSub.subscribe("platformChannel", platformChannel);
}

function unsubscribeFromPlatformChannel() {
    Common.redisSub.unsubscribe("platformChannel", platformChannel);
}

function platformChannelMonitorService() {
    var refreshService = new Service(refresh, {
        period: 30
    });
    var closeService = new Service(closePlatforms, {
        period: 30
    });
    var checkPlatformsService = new Service(platformModule.checkPlatforms, {
        period: 300
    });


    var start = function() {
        refreshService.start();
        closeService.start();
        checkPlatformsService.start();
    };

    var stop = function(callback) {
        refreshService.stop(function(err) {
            closeService.stop(function(err) {
                checkPlatformsService.stop(function(err) {
                    callback(null);
                });
            });
        });
    };

    var ret = {
        start: start,
        stop: stop
    }

    return ret;
}

function stopPoolTasks(callback) {

    poolQueue.kill();
    callback(null);
}

module.exports = {
    subscribeToPlatformChannel: subscribeToPlatformChannel,
    unsubscribeFromPlatformChannel: unsubscribeFromPlatformChannel,
    platformChannelMonitorService: platformChannelMonitorService,
    stopPoolTasks: stopPoolTasks

};