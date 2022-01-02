"use strict";

var async = require("async");
var _ = require("underscore");
var Common = require("./common.js");
const { Op } = require('sequelize');

var logger = Common.getLogger(__filename);

function attachNotificationToHistory(email, titleText, notifyTime, notifyLocation, appName, callback) {
    async.series(
        [
            function(callback) {
                Common.db.UserNotificationsHistory.create({
                    email: email,
                    titleText: titleText,
                    notifyTime: notifyTime,
                    notifyLocation: notifyLocation,
                    date : new Date(),
                    appName: appName.toString()
                }).then(function(results) {
                    //logger.info("create record notification results: " + JSON.stringify(results));
                    callback(null);
                }).catch(function(err) {
                    callback(err);
                });
            }
        ], function(err) {
            if(err) {
                logger.error("NotificationsHistory.js::attachNotificationToHistory failed with err: " + err);
                callback(null);
            } else {
                mayBeClean(email, function(err) {
                    callback(null);
                });
            }
        }
    );
}

function getLastNotifications(_opts, callback) {
    var opts = {
        logger: _opts.logger,
        limit: _opts.limit || 10
    }
    async.waterfall(
        [
            function(callback) {
                Common.db.UserNotificationsHistory.findAll({
                    where : {
                        email : _opts.email
                    },
                    limit: opts.limit,
                    order:  [["date","DESC"]]
                }).complete(function(err, results) {
                    if (err) {
                        callback(err);
                    } else {
                        var res = _.map(results, function(item) {
                            return _.pick(item, "date", "titleText", "notifyTime", "notifyLocation", "appName");
                        });
                        callback(null, res);
                    }
                });
            }
        ], function(err, res) {
            if(err) {
                callback(err);
            } else {
                callback(null, res);
            }
        }
    );
}

function shrinkNotificationsHistoryOfUser(email, callback) {
    logger.debug("NotificationsHistory.js::shrinkNotificationsHistoryOfUser " + email);
    async.waterfall(
        [
            function(callback) {
                Common.db.UserNotificationsHistory.findAll({
                    where: {email: email},
                    limit: 1,
                    offset: 100,
                    order:  [["date","DESC"]]
                }).complete(function(err, results) {
                    if (err) {
                        logger.error("Error while get notification history err: " + err);
                        callback(err);
                    } else if(results.length === 0) {
                        callback("empty");
                    } else {
                        callback(null,results[0].date);
                    }
                });
            },
            function(date, callback) {
                logger.debug("NotificationsHistory.js::shrinkNotificationsHistoryOfUser " + email + " delete older that " + date);
                Common.db.UserNotificationsHistory.destroy({
                    where: {
                        email: email,
                        date: { [Op.lt]: date}
                    },
                }).then(function(results) {
                    callback(null);
                }).catch(function(err) {
                    callback(err);
                });
            },
            function(callback) {
                Common.redisClient.set("user_notifications_history_"+email, 1, function(err, res) {
                    callback(null);
                });
            }
        ], function(err) {
            if(err) {
                if(err !== "empty") logger.error("NotificationsHistory.js::shrinkNotificationsHistoryOfUser failed with err: " + err);
                callback(null);
            } else {
                callback(null);
            }
        }
    );
}

function mayBeClean(email, callback) {
    logger.debug("NotificationsHistory.js::shrinkNotificationsHistoryOfUser " + email);
    async.waterfall(
        [
            function(callback) {
                var multi = Common.getRedisMulti();

                multi.incr("user_notifications_history_" + email);
                multi.expire("user_notifications_history_" + email, 24 * 60 * 60); //expire in 24 hours
                multi.exec(function(err, replies) {
                    if (err) {
                        Common.logger.error("NotificationsHistory.js::mayBeClean problem in redis, err:", err);
                        callback(err);
                    } else {
                        // call shrinkNotificationsHistoryOfUser if it is first call for this user or it happened enough calls of this function
                        if ((replies[0] === 1) || (replies[0] > 200)) {
                            callback(null, true);
                        } else {
                            callback(null, false);
                        }
                    }
                });
            },
            function(needShrink, callback) {
                if(needShrink) {
                    shrinkNotificationsHistoryOfUser(email, callback);
                } else {
                    callback(null);
                }
            }
        ], function(err) {
            console.log("shrinkNotificationsHistoryOfUser err: " + err);
            callback(null);
        }
    );
}

module.exports = {
    attachNotificationToHistory: attachNotificationToHistory,
    getLastNotifications: getLastNotifications,
    shrinkNotificationsHistoryOfUser: shrinkNotificationsHistoryOfUser,
}
