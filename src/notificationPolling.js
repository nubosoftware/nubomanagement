"use strict";

/*  @autor Ori Sharon
 *  in this class we get all notifications that are associated within a specific user.
 *  we send the user name and receive its notifications
 */

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var async = require('async');
var ThreadedLogger = require('./ThreadedLogger.js');
var setting = require('./settings.js');
var Login = require('./login.js');
const { Op } = require('sequelize');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

// first call goes to here
function notificationPolling(req, res, next) {
    // https://login.nubosoftware.com/notificationPolling?activationKey=[]&username=[]&timeStamp=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    var sendLastTimeStamp = false;

    var activationKey = req.params.activationKey;

    var userName = req.params.username;
    if (userName == null || userName == "") {
        logger.info("notificationPolling. Invalid userName");
        status = 0;
        msg = "Invalid parameters";
    }

    var timeStamp = req.params.timestamp;
    if (timeStamp == null || timeStamp == "") {
        sendLastTimeStamp = true;
    }

    if (status != 1) {
        res.send({
            status : status,
            message : msg
        });
        return;
    }

    Common.db.Activation.findAll({
        attributes : ['email', 'status','maindomain'],
        where : {
            activationkey : activationKey
        },
    }).complete(function(err, results) {

        if (!!err) {
            logger.error('notificationPolling: ' + err);
            res.send({
                status : Common.STATUS_ERROR,
                message : 'Internal Error'
            });
            return;
        }

        if (!results || results == "") {
            logger.error("notificationPolling: Cannot find user to send notifications");
            res.send({
                status : Common.STATUS_ERROR,
                message : 'Internal Error'
            });

            return;
        }
        var maindomain = results[0].maindomain != null ? results[0].maindomain : '';
        var email = results[0].email != null ? results[0].email : '';

        var activation_status = results[0].status != null ? results[0].status : '';
        if (activation_status !== 1) {
            logger.error("notificationPolling: user isn't activated")
            res.send({
                status : Common.STATUS_ERROR,
                message : 'Internal Error'
            });
            return;

        } else {
            var lastTimeStamp = new Date();

            if (sendLastTimeStamp) {
                var resObj = {
                    status : '1',
                    message : "import last timestamp from user succedded",
                    timestamp : lastTimeStamp
                };
                res.send(resObj);
                return;
            }

            getNotifications(maindomain, email, userName, timeStamp, function(err, results, lastRowTime) {
                var resObj;
                if(err) {
                    logger.error("failed with err: " + err);
                    resObj = {
                        status : Common.STATUS_ERROR,
                        message : err
                    };
                } else {

                    if (results && results.length > 0 && lastRowTime) {
                        lastTimeStamp = lastRowTime;
                    }

                    resObj = {
                        status : '1',
                        message : "sent last timestamp succedded",
                        notifications : results,
                        timestamp : lastTimeStamp
                    };

                }
                res.send(resObj);
                return;
            });
        }
    });
}

function getNotifications(maindomain, email, userName, timeStamp, callback) {
    var notifications = [];
    var lastRowTime;

    var appList = [];
    var userEnableSound = 1;
    var userEnableVibrate = 1;

    async.series([
        function(callback) {
            Common.db.User.findAll({
            attributes : ['enablesound', 'enablevibrate'],
            where : {
                email : email,
                orgdomain : maindomain
            },
            }).complete(function(err, results) {
                if (!!err) {
                    var msg = "getNotifications.  err: " + err;
                    logger.info(msg);
                    callback(msg);
                    return;
                }
                if (!results || results == "") {
                    var msg = 'getNotifications. Cannot find ' + email;
                    logger.info(msg);
                    callback(msg);
                    return;
                }

                results.forEach(function(row) {
                    userEnableSound = row.enablesound;
                    userEnableVibrate = row.enablevibrate;
                 });
                callback(null);
            });
        },
        function(callback) {
            Common.db.UserApplicationNotifs.findAll({
                attributes : ['appname'],
                where : {
                    email      : email,
                    sendnotif  : 1
                },
            }).complete(function(err, results) {
                if (!!err) {
                    var msg = "getNotifications err: " + err;
                    logger.info(msg);
                    callback(msg);
                    return;

                }
                if (!results || results == "") {
                    var msg = 'getNotifications, Cannot find User Application Notifs for userName: ' + userName;
                    logger.info(msg);
                    callback(msg);
                    return;
                }
                var resCnt = 0;

                results.forEach(function(row) {
                    if (row.appname === 'Email') {
                        appList.push("0");
                    } else if (row.appname === 'Calendar') {
                        appList.push("1");
                    } else if (row.appname === 'Messaging') {
                        appList.push("2");
                    }
                 });
                callback(null);
            });
        }
    ],
    function(err) {
        Common.db.UserNotificationsHistory.findAll({
            attributes : ['date'/*, 'titleText', 'notifyTime', 'notifyLocation'*/, 'appName'],
            where : {
                email : userName,
                date: { [Op.gt]: timeStamp}
            },
            order:  [["date"]]
        }).complete(function(err, results) {
            if (!!err) {
                logger.info("getNotifications. " + err);
                callback("getNotifications err: " + err);
                return;
            }

            if (!results || results == "") {
                var msg = 'getNotifications, Cannot find notifications for userName: ' + userName;
                logger.info(msg);
                callback(null);
                return;
            }

            // counter that checks when we finish our results iterations
            var resCnt = 0;

            results.forEach(function(row) {
                var appName = row.appName != null ? row.appName : '';
                var ind = appList.indexOf(appName);

                if (appList.indexOf(appName) > -1) {
                    var jsonNotification = {
                        appName : appName,
                        enablesound : userEnableSound,
                        enablevibrate : userEnableVibrate
                    };

                    notifications.push(jsonNotification);
                }
                resCnt++;
                if (resCnt >= results.length) {
                    lastRowTime = row.date != null ? row.date : '';
                }
            });
            callback(null, notifications, lastRowTime);
        });
    });
}

var NotificationPolling = {
    func : notificationPolling
};

module.exports = NotificationPolling;
