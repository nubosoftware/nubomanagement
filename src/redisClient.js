"use strict";

var poolModule = require('generic-pool');
var redisModule = require("redis");
var _ = require('underscore');
var Commands = require("redis-commands/commands.json");
var async = require('async');

function RedisCmd() {

}

function RedisMultiCmd() {

    if (!(this instanceof RedisMultiCmd)) {
        return new RedisMultiCmd();
    }

    this._cmdQueue = [];
}

function RedisClient(redisConf, redisValidator, logger) {

    if (!(this instanceof RedisClient)) {
        return new RedisClient(redisConf, logger);
    }

    this._logger = logger;
    if(_.isEmpty(redisConf.password)){
        delete redisConf.password;
    }
    this._redisSub = redisModule.createClient(redisConf);

    var self = this;


    this._redisPool = poolModule.Pool({
        name: 'redis',
        create: function(callback) {
            var c = redisModule.createClient(redisConf);
            var cbCalled = false
            c.on("error", function(err) {
                if (!cbCalled) {
                    cbCalled = true;
                    callback(err);
                }
            });

            c.on("ready", function() {
                if (!cbCalled) {
                    cbCalled = true;
                    callback(null, c);
                }
            })
        },
        destroy: function(client) {
            client.quit();
        },
        max: 10,
        min: 2,
        idleTimeoutMillis: 30000,
        log: false
    });



    Object.keys(Commands).forEach(function(fullCommand) {

        var command = fullCommand.split(' ')[0];

        if (command === "multi") {
            buildRedisMultiCommand(self._redisPool, redisValidator, logger);
        } else {
            buildRedisCommand(command, self._redisPool, redisValidator, logger);
        }
    });

    this._redisClient = new RedisCmd();
}

function buildRedisMultiCommand(redisPool, redisValidator, logger) {

    Object.keys(Commands).forEach(function(fullCommand) {

        var command = fullCommand.split(' ')[0];

        if (command === "multi" || command === "exec") {
            return;
        }

        RedisMultiCmd.prototype[command] = function() {
            var cmd = {
                name: command,
                args: arguments
            };

            this._cmdQueue.push(cmd);
        };
    });


    RedisMultiCmd.prototype.exec = function(callback) {
        var self = this;
        var promise = null;
        var promiseCB = null;

        if (!callback) {
            promise = new Promise((resolve,reject) => {
                promiseCB = {
                    resolve: resolve,
                    reject: reject
                }
            });
        }
        async.waterfall([
            function(callback) {
                redisPool.acquire(function(err, client) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    callback(null, client);
                });
            },
            function(client, callback) {
                var multi = client.multi();
                _.each(self._cmdQueue, function(cmd) {
                    multi[cmd.name].apply(multi, cmd.args);
                });

                multi.exec(function(err, replies) {
                    redisPool.release(client);

                    if (err) {
                        callback(err);
                        return;
                    }

                    callback(null, replies);
                });
            }
        ], (err,replies) => {
            if (callback) {
                callback(err,replies);
            } else {
                if (err) {
                    promiseCB.reject(err);
                } else {
                    promiseCB.resolve(replies);
                }
            }
        });
        return promise;
    }
}

function buildRedisCommand(command, redisPool, redisValidator, logger) {
    RedisCmd.prototype[command] = function() {
        var arr = [];
        var cb = null;
        var promise = null;
        var promiseCB = null;
        var cmdArgs = arguments;

        for (var index = 0; index < arguments.length; ++index) {
            arr[index] = arguments[index];
        }

        if (arr.length > 0 && typeof arr[arr.length - 1] === "function") {
            cb = arr.pop();
        } else {
            // use promise;
            promise = new Promise((resolve,reject) => {
                promiseCB = {
                    resolve: resolve,
                    reject: reject
                }
            });
        }

        redisPool.acquire(function(err, client) {
            if (err) {
                if (cb) {
                    cb(err);
                } else if (promiseCB) {
                    promiseCB.reject(err);
                }
                return;
            }

            arr.push(function(err, reply) {
                redisPool.release(client);
                if (err) {
                    if (cb) {
                        cb(err, reply);
                    } else if (promiseCB) {
                        promiseCB.reject(err);
                    }
                    return;
                }
                if (cb) {
                    cb(null, reply);
                } else if (promiseCB) {
                    promiseCB.resolve(reply);
                }                

            });
            client[command].apply(client, arr);

        });
        return promise;
    };
}

RedisClient.prototype.client = function() {
    return this._redisClient;
};

RedisClient.prototype.clientSub = function() {
    return this._redisSub;
};

// RedisClient.prototype.pool = function() {
//     return this._redisPool;
// };

RedisClient.prototype.exit = function() {
    var self = this;
    this._redisPool.drain(function() {
        self._redisPool.destroyAllNow();
    });

    this._redisSub.quit();
};

RedisClient.prototype.multiClient = function() {
    return new RedisMultiCmd();
};

module.exports = RedisClient;
