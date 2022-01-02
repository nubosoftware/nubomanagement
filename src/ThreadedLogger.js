"use strict";

var _ = require('underscore');
var Common = require('./common.js');
var TimeLog = require('./timeLog.js').TimeLog;

var logLevel = ["debug", "info", "warn", "error"];
var lastLog = 0;

var TreadedLogger = function (moduleLogger) {
    lastLog++;
    var extra_meta = {
        logid: 'logid_'+lastLog,
        user: ""
    };
    this.user = function(user) {
        extra_meta.user = user;
    }

    var ctime = new Date().getTime();
    (function(obj) {
        logLevel.forEach(function(level) {
            obj[level] = function() {
                var len = arguments.length, arr = new Array(len+2);
                arr[0] = level;
                for (var i = 0; i < (len); i += 1) {
                    arr[i+1] = arguments[i];
                }
                if(typeof arr[len] === 'object' && Object.prototype.toString.call(arr[len-1]) !== '[object RegExp]') {
                    _.extend(arr[len], extra_meta);
                    arr[len+1] = null;
                } else {
                    arr[len+1] = extra_meta;
                }
                let logger;
                if (moduleLogger)
                    logger = moduleLogger;
                else
                    logger = Common.logger;
                    logger.log.apply(logger, arr);
            }
        });
        obj.timelogger = new TimeLog(obj);
        obj.logTime = function(msg) {
            obj.timelogger.logTime(msg);
        };
        return obj;
    })(this);
};

if (module) {
    module.exports = TreadedLogger;
}

