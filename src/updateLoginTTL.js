"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('./session.js');
var Session = sessionModule.Session;
var async = require('async');
var Service = require("./service.js");

// make sure all the login tokens of active sessions will remain loaded
function updateLoginTTL(callback) {
    Common.redisClient.smembers('sessions', function(err, replies) {

        async.eachLimit(replies, 1000, function(reply, callback) {

                new Session(reply, function(err, obj) {
                    if (err) {
                        logger.error("updateLoginTTL: " + err);
                        callback(null)
                        return;
                    }

                    var loginToken = obj.params.loginToken;
                    if (loginToken != null) {
                        Common.redisClient.expire('login_' + loginToken, 600, function(err, obj) {
                            if (err) {
                                logger.error("updateLoginTTL: " + err);
                                callback(null);
                                return;
                            }

                            //logger.debug("updateLoginTTL: Successfuly update TTL of " + loginToken);
                            callback(null);
                        });
                    } else {
                        callback(null);
                    }
                });
            },
            function(err) {
                callback(null);
            });
    });

}


var updateLoginTTLService = new Service(updateLoginTTL, {
    period: 60
});

module.exports = updateLoginTTLService