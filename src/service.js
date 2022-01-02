"use strict";

var async = require('async');

var defaultPeriodInterval = 5000;

function Service(service, opts) {

    if (!(this instanceof Service)) {
        return new Service(service, opts);
    }

    var _opts = opts ? opts : {};

    this._service = service;
    this._periodInterval = (_opts.period ? (Math.ceil(_opts.period * 1000)) : defaultPeriodInterval);
    this._stopFunc = _opts.stop;
    this._stopService = false;
    this._peroidFunc;
    this._setTimeoutFunc = null;
    this._exitCallback;
    this._started = false;
}


Service.prototype.start = function() {

    this._started = true;
    var self = this;
    async.forever(
        function(next) {
            self._service(function(err) {
                if (self._stopService) {
                    // console.log("exit requested");
                    next('exit');
                } else {
                    self._peroidFunc = function() {
                        self._setTimeoutFunc = null;
                        if (self._stopService) {
                            next('exit');
                        } else {
                            next(null);
                        }
                    };
                    self._setTimeoutFunc = setTimeout(self._peroidFunc, self._periodInterval);
                }
            });
        },
        function(exit) {
            self._exitCallback();
        }
    );
};

Service.prototype.stop = function(callback) {
    if(!this._started){
        return callback(null);
    }
    
    
    var self = this;
    if (this._stopFunc) {
        this._stopFunc(function(err) {

            self._stopService = true;
            self._exitCallback = function() {
                // console.log("service exited");
                callback(null);
            }

            if (self._setTimeoutFunc) {
                // console.log("exit requested (clearTimeout)");
                clearTimeout(self._setTimeoutFunc);
                self._peroidFunc();
            }
        });
    } else {
        self._stopService = true;
        self._exitCallback = function() {
            // console.log("service exited");
            callback(null);
        }

        if (self._setTimeoutFunc) {
            // console.log("exit requested (clearTimeout)");
            clearTimeout(self._setTimeoutFunc);
            self._peroidFunc();
        }
    }
}

module.exports = Service;
