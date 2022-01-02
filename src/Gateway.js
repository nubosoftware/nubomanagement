"use strict";


var Common = require('./common.js');
var async = require('async');
var Lock = require('./lock.js');
var Service = require("./service.js");
var logger = Common.getLogger(__filename);

var GW_MAX_CONNECTIONS = 1000;


var removeGateway = function(gwIndex, callback) {

    var multi = Common.getRedisMulti();

    async.waterfall([
        function(callback) {

            var lock = new Lock({
                key: 'lock_gateway_' + gwIndex,
                logger: logger,
                numberOfRetries: 30,
                waitInterval: 500,
                lockTimeout: 1000 * 60 // 1 minute
            });

            lock.cs(function(callback) {

                multi.zrem('gateways', gwIndex);
                multi.del('gateway_' + gwIndex);
                multi.del('gateway_' + gwIndex + '_ttl');
                multi.smembers('gwsesslist_' + gwIndex);
                // multi.smembers('gwplatlist_' + gwIndex);
                multi.exec(function(err, replies) {
                    if (err) {
                        logger.error("removeGateway: cannot remove gateway from redis, err:", err);
                        callback(err);
                        return;
                    }
                    callback(null, replies[3]);//, replies[4]);
                });
            }, callback);
        },
        function(sessList, callback) {

            if (sessList.length != 0) {
                multi.sadd('sessions_disconnected', sessList);
            }

            // if (platList.length != 0) {
            //     multi.sadd('platforms_disconneted', platList);
            // }

            multi.del('gwsesslist_' + gwIndex);
            // multi.del('gwplatlist_' + gwIndex);
            multi.exec(function(err, replies) {
                if (err) {
                    logger.error("removeGateway: " + err);
                    callback(err);
                    return;
                }

                Common.redisClient.publish("gatewayChannel", "gateway " + gwIndex + " removed");
                logger.info("removeGateway: gateway " + gwIndex + " removed");
                callback(null);
            });

        }
    ], function(err) {
        callback(err);
    });
};


var updateGWSessionSet = function(gwIndex,inc,sessid,callback) {
    if (inc === 1) {
        Common.redisClient.sadd('gwsesslist_'+gwIndex,sessid,function (err) {
            if (err) {
                var msg = "updateGWSessionSet. Failed to add session: "+sessid+" to gwsesslist_"+gwIndex+", err: "+err;
                callback(msg);
            } else {
                callback(null);
            }
        });
    } else if (inc === -1) {
        Common.redisClient.srem('gwsesslist_'+gwIndex,sessid,function (err) {
            if (err) {
                var msg = "updateGWSessionSet. Failed to add session: "+sessid+" to gwsesslist_"+gwIndex+", err: "+err;
                callback(msg);
            } else {
                callback(null);
            }
        });
    } else {
        var msg = "updateGWSessionSet. illegal session increase index: "+inc;
        callback(msg);
    }
};

//update gateway's number of sessions score
var updateGWSessionScore = function(gwIndex, inc, sessid, logger, callback) {

    async.series([
        function(callback) {
            Common.redisClient.hgetall('gateway_' + gwIndex, function(err, obj) {
                if (err) {
                    return callback(err);
                }

                if (!obj) {
                    logger.info("updateGWSessionScore: could not find gateway " + gwIndex);
                    callback('done');
                } else {
                    callback(null);
                }
            });
        },
        function(callback) {
            updateGWSessionSet(gwIndex, inc, sessid, callback);
        },
        function(callback) {
            Common.redisClient.zincrby('gateways', inc, gwIndex, callback);
        }
    ], function(err) {
        if (err && err != 'done') {
            logger.error("updateGWSessionScore: " + err);
            return callback(err);
        }

        callback(null);
    });
};


var getAvailableGW = function(gw, opts, callback) {
    logger = opts.logger;

    Common.redisClient.zrangebyscore('gateways', '-inf', '(' + GW_MAX_CONNECTIONS, function(err, gateways) {
        if (err || gateways.length<1) {
            var errMsg = "getAvailableGW: no avalible gateways";
            callback(errMsg, null);
            return;
        }

        //traverse all gateways sorted by score from min to max and find the first
        //gw that passes all filters
        async.detectSeries(gateways, function(gwIndex, callback) {
            Common.redisClient.hgetall('gateway_' + gwIndex ,function (err, gateway) {
                if (err) {
                    var errMsg = "getAvailableGW: cannot get gw #" + gwIndex;
                    logger.error(errMsg);
                    callback(false);
                    return;
                }

                if(gateway === null) {
                    logger.warn("getAvailableGW: gateway_" + gwIndex + " does not exits. Remove it from gateways list");
                    removeGateway(gwIndex, function(err) {
                        if(err) logger.error("getAvailableGW: error happaned while removing gateway_" + gwIndex + " from redis");
                        callback(false);
                    });
                    return;
                }
                else {
                    var lock = new Lock({
                        key: 'lock_gateway_' + gwIndex,
                        logger: logger,
                        numberOfRetries: 0,
                        waitInterval: 0,
                        lockTimeout: 1000 * 60 * 5 // 5 minutes
                    });

                    lock.acquire(function(err, acquired) {
                        if (err || !acquired) {
                            callback(false);
                            return;
                        }

                        //logger.info("getAvailableGW: selected gateway #" + gwIndex);
                        gw.params = gateway;
                        gw.lock = lock;
                        callback(true);
                    });
                }
            });
        }, function(foundGW){
            if(foundGW){
                callback(null, gw);
            }
            else{
                var errMsg = "getAvailableGW: didn't find available GW";
                logger.error(errMsg);       // Keep this log
                callback(errMsg, gw);
            }
        });
    });
};

// callback(err, obj) - obj is null if gatway does not exist, else we get object {index: int, internal_ip : str, external_ip : str, controller_port : int, apps_port : int, player_port: int, ssl : bool}
var Gateway = function (gw_obj, opts, callback) {
    this.params = gw_obj;

    this.save = function(callback) {
      (function (obj) {
        Common.redisClient.hmset('gateway_'+obj.params.index, obj.params, function (err, reply) {
          if (err) {
            if (callback) callback(err,null);
          } else {
             Common.redisClient.zadd('gateways',0, obj.params.index, function(err,reply) {
                 if (err) {
                     if (callback) callback(err,null);
                 } else {
                     if (callback) callback(null,reply);
                 }
              });//ZADD
          } // else
        }); //hmset
      }) (this); //function (obj)
    }; // saveGWObj


    if (gw_obj) {
        (function (gw) {
            if (gw.params.index === -1) {
                getAvailableGW(gw, opts, callback);
            } else {
                Common.redisClient.hgetall('gateway_'+gw.params.index,function (err, obj) {
                    if (err) {
                        var msg = "Gateway: cannot execute hgetall, err:"+err;
                        logger.error(msg);
                        callback(msg, null);
                    } else {
                        if (obj) {
                            logger.info("Gateway: return, obj: "+obj);
                            gw.params = obj;
                            callback(null, gw);
                        } else {
                            var msg = "Gateway: gateway_" +gw.params.index + " does not exist";
                            //logger.info(msg);
                            callback(msg, gw);
                        }
                    }
                });
            }
        }) (this); //function (gw)
    } else {
        var msg = "Could not create Gateway. null gateway obj";
        logger.error(msg);
        callback(msg, null);
    }
};

function registerGateway(gwParams, baseIndex, offset, callback) {

    var gwIdx = 0;

    async.series([
        function(callback) {
            if (baseIndex == 0) {
                Common.redisClient.incr('gatewayseq', function(err, index) {
                    if (err) {
                        logger.error("registerGateway: " + err);
                        callback(err);
                        return;
                    }

                    gwIdx = index;
                    callback(null);
                });
            } else {
                gwIdx = parseInt(baseIndex) + parseInt(offset);
                callback(null);
            }
        },
        function(callback) {
            gwParams["index"] = gwIdx;

            var gwLock = new Lock({
                key: "lock_gateway_" + gwIdx,
                logger: logger,
                numberOfRetries: 1,
                waitInterval: 500,
                lockTimeout: 1000 * 60 * 10 // 10 minutes max lock
            });

            gwLock.cs(
                function(callback) {
                    var multi = Common.getRedisMulti();

                    multi.hmset('gateway_' + gwIdx, gwParams);
                    multi.set('gateway_' + gwIdx + '_ttl', 1);
                    multi.expire('gateway_' + gwIdx + '_ttl', 20);
                    multi.zadd('gateways', 0, gwIdx);
                    multi.exec(function(err, replies) {
                        if (err) {
                            logger.error("registerGateway: " + err);
                            callback(err);
                        }

                        callback(null);
                    });

                }, callback);
        }
    ], function(err) {
        if(!err){
            Common.redisClient.publish("gatewayChannel", "gateway " + gwIdx + " added");
        }
        callback(err, gwIdx);
    });
}

function refreshGatewayTTL(gwIdx, ttl, callback) {
    Common.redisClient.expire("gateway_" + gwIdx + "_ttl", ttl, function(err, replay) {
        if (err) {
            logger.error("refreshGatewayTTL: " + err);
            callback(err);
            return;
        }

        if (replay == 0) {
            logger.warn("refreshGatewayTTL: gateway_" + gwIdx + "_ttl expired");
        }

        callback(null, replay);
    });
}

function unregisterGateway(gwIdxList, callback) {

    gwIdxList.forEach(function(idx) {
        removeGateway(idx, function(){});
    });

    callback(null);
}

function subscribeToGatewayTTLExpiration(){

    Common.redisSub.psubscribe("__keyspace@0__:gateway_*", gatewayTTLExpired);
}

function unsubscribeFromGatewayTTLExpiration(){

    Common.redisSub.punsubscribe("__keyspace@0__:gateway_*", gatewayTTLExpired);

}

function gatewayTTLExpired(gw, redisOp) {

    // console.log(redisOp)
    if(redisOp !== 'expired'){
        logger.error("gatewayTTLExpired: internal error, only expired operation supported");
        return;
    }

    var re = new RegExp('(__keyspace@0__:gateway_)(.*)(_ttl)');
    var m = re.exec(gw);

    if(m == null){
        logger.error("gatewayTTLExpired: internal error, unsupported event " + gw);
        return;
    }

    var gwIdx = m[2];

    logger.info("gatewayTTLExpired: gateway " + gwIdx + " ttl expired");
    removeGateway(gwIdx, function(){});

}

function removeTTLExpiredGWs(callback) {

    Common.redisClient.zrange('gateways', 0, -1, function(err, gateways) {
        if (err) {
            logger.error("removeTTLExpiredGWs: " + err);
            return;
        }

        async.eachLimit(gateways, 100, function(gateway, callback) {

            Common.redisClient.exists("gateway_" + gateway + "_ttl", function(err, gwExists) {
                if (err) {
                    callback(err);
                    return;
                }

                if (gwExists === 1) {
                    callback(null);
                    return;
                }

                removeGateway(gateway, callback);
            });
        }, function(err) {
            if (err) {
                logger.error("removeTTLExpiredGWs: " + err);
                return callback(err);
            }

            callback(null);
        });
    });
}

function gatewayTTLExpiredMonitorService(){
    var mon = new Service(removeTTLExpiredGWs,{
        period: 30
    });

    return mon;
}

function addPlatToGW(gwObj, platId, callback) {

    new Gateway(gwObj, {logger: logger}, function(err, obj) {
        if (err) {
            logger.error('addPlatToGW: ' + err);
            callback(err);
            return;
        }

        if (!obj) {
            logger.error("addPlatToGW: gw doesn't exist");
            callback("gw doesn't exist");
            return;
        }

        Common.redisClient.sadd('gwplatlist_' + gwObj.index, platId, callback);
    });

}

function removePlatFromGW(gwObj, platId, callback) {

    new Gateway(gwObj, {logger: logger}, function(err, obj) {
        if (err) {
            logger.error('removePlatFromGW: ' + err);
            callback(err);
            return;
        }

        if (!obj) {
            logger.error("removePlatFromGW: gw doesn't exist");
            callback("gw doesn't exist");
            return;
        }

        Common.redisClient.srem('gwplatlist_' + gwObj.index, platId, callback);
    });

}

var GatewayModule = {
    Gateway: Gateway,
    registerGateway: registerGateway,
    updateGWSessionScore: updateGWSessionScore,
    refreshGatewayTTL: refreshGatewayTTL,
    unregisterGateway: unregisterGateway,
    subscribeToGatewayTTLExpiration: subscribeToGatewayTTLExpiration,
    unsubscribeFromGatewayTTLExpiration: unsubscribeFromGatewayTTLExpiration,
    gatewayTTLExpiredMonitorService: gatewayTTLExpiredMonitorService,
    addPlatToGW: addPlatToGW,
    removePlatFromGW: removePlatFromGW
};

module.exports = GatewayModule;
