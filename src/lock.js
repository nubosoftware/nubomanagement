"use strict";

var Common = require('./common.js');
var async = require('async');
var defaultLockTimeout = 10 * 60 * 1000; //10 minuts
var defualtNumOfRetries = 10;
var defualtWaitInterval = 500;

function Lock(parameters) {

    if (!(this instanceof Lock)) {
        return new Lock(parameters);
    }

    this._key = parameters.key;
    this._logger = parameters.logger;
    this._numOfRetries = (parameters.numOfRetries ? parameters.numOfRetries : defualtNumOfRetries);
    this._waitInterval = (parameters.waitInterval ? parameters.waitInterval : defualtWaitInterval);
    this._lockTimeout = (parameters.lockTimeout ? parameters.lockTimeout : defaultLockTimeout);

    this._stack = null;
    this._lockAquired = false;
    this._lockTimeoutFunc = null;
}

Lock.prototype.acquire = function(callback) {
    if (callback != null && typeof callback !== "function") {
        var errMsg = "acquire: callback must be a function (lock on \'" + this._key + "\')";
        this._logger.error(errMsg);
        callback(errMsg)
        return;
    }

    if (this._lockAquired) {
        var errMsg = "acquire: lock on \'" + this._key + "\' already aquired.";
        this._logger.error(errMsg);
        callback(errMsg);
        return;
    }

    var self = this;
    var iter = 0;

    if (!self._stack)
        self._stack = new Error().stack;

    async.whilst(
        function() {
            return (!self._lockAquired && iter <= self._numOfRetries);
        },
        function(callback) {
            Common.redisClient.setnx(self._key, 1, function(err, reply) {
                if (err) {
                    callback(err);
                    return;
                }

                if (reply == 1) {
                    self._lockAquired = true;
                    // lock will be deleted automatically after timeout
                    Common.redisClient.expire(self._key,(self._lockTimeout/1000));
                    callback(null);
                    return;
                }

                setTimeout(function() {
                    ++iter;
                    callback(null);
                }, self._waitInterval);
            });
        },
        function(err) {
            if (err) {
                var errMsg = "acquire: error seting lock on \'" + self._key + "\', err: " + err;
                self._logger.error(errMsg);
                callback(errMsg);
                return;
            }

            if (self._lockAquired) {
                //self._logger.debug("acquire: lock on \'" + self._key + "\' acquired");
                self._lockTimeoutFunc = setTimeout(
                    (function() {
                        self._logger.error("acquire: execution of critical section for lock on \'" + self._key + "\' take too much time. Stack: " + self._stack);
                        self._lockAquired = false;
                    }), self._lockTimeout);
                callback(null, 1);
            } else {
                var errMsg = `acquire: couldn't acquire lock on ${self._key}, numOfRetries: ${self._numOfRetries}, waitInterval: ${self._waitInterval}, iter: ${iter}`;
                self._logger.error(errMsg);
                callback(null, 0);
            }
        }
    );
}

Lock.prototype.acquirePromise = function() {
    var self = this;
    return new Promise(function(resolve, reject) {
        self.acquire(function(err, replay) {
            if (err)
                reject(err);
            else
                resolve(replay);
        });
    });
}

Lock.prototype.releasePromise = function() {
    var self = this;
    return new Promise(function(resolve, reject) {
        self.release(function(err, replay) {
            if (err)
                reject(err);
            else
                resolve(replay);
        });
    });
}

Lock.prototype.release = function(callback) {
    if (callback != null && typeof callback !== "function") {
        var errMsg = "release: callback must be a function (lock on \'" + this._key + "\')";
        this._logger.error(errMsg);
        callback(errMsg)
        return;
    }

    if (!this._lockAquired) {
        var errMsg = "release: lock on \'" + this._key + "\' wasn't aquired before";
        this._logger.error(errMsg);
        callback(errMsg);
        return;
    }

    var self = this;
    Common.redisClient.del(self._key, function(err, reply) {
        if (err) {
            var errMsg = "release: error releasing lock on \'" + self._key + "\' err: " + err;
            callback(errMsg);
            return;
        }

        if (reply == 1) {
            self._lockAquired = false;
            //self._logger.debug("release: lock on \'" + self._key + "\' released");
            clearTimeout(self._lockTimeoutFunc);
            callback(null, 1);
        } else {
            self._logger.warn("release: lock on \'" + self._key + "\' not found");
            callback(null, 0);
        }
    }); // Common.redisClient.SETNX
}

Lock.prototype.cs = function(csFunc, callback) {

    var self = this;
    this._stack = new Error().stack;
    var csResults = [];

    async.series([
        function(callback) {
            self.acquire(function(err, replay) {
                if (err)
                    callback(err);

                else if (replay == 1)
                    callback(null);

                else {
                    var errMsg = "cs: couldn't acquire lock on \'" + self._key + "\'";
                    callback(errMsg);
                }
            });
        },
        function(callback) {
            csFunc(function() {
                for (var index = 0; index < arguments.length; ++index) {
                    csResults[index] = arguments[index];
                }
                callback(null);
            });
        },
        function(callback) {
            self.release(callback);
        }
    ], function(err, results) {
        //lock error
        if (err) {
            callback(err);

        } else {
            callback.apply(this, csResults);
        }
    });
}

Lock.prototype.isAquired = function(){
    return this._lockAquired;
}

module.exports = Lock;