"use strict";

var async = require('async');

var Common = require('./common.js');
var ThreadedLogger = require('./ThreadedLogger.js');
var Notifications = require('./Notifications.js');
const { QueryTypes } = require('sequelize');

var NUBO_NOTIF_ACTION_ADD = 1;
var NUBO_NOTIF_ACTION_DEL = 2;

function post(req, res, next) {
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    logger.user(req.params.username);
    //logger.info("platformUserNotification query: " + JSON.stringify(req.params));

    var opts = {
        urlparams: req.params,
        logger: logger,
        session: req.nubodata.session,
    };

    platformUserNotificationInternal(opts, function(err, obj) {
        if (err) {
            res.send({
                status: 0,
                message: err
            });
            logger.error("platformUserNotification err = " + err);
        } else {
            res.send({
                status: 1,
                message: "Success"
            });
            //logger.info("platformUserNotification done");
        }
    });
}

function removeAllSessionNotifications(session,closeSessionMsg,logger,callback) {
    var pushRegID,deviceType;
    //logger.info(`removeAllSessionNotifications. closeSessionMsg: ${closeSessionMsg}`);
    if (!closeSessionMsg) {
        closeSessionMsg = '';
    }
    async.series(
        [
            function(callback) {
                // first get the user params
                var activationkey = session.params.activation;
                var query = 'select a1.pushregid as pushregid , a1.devicetype as devicetype' +
                    ' from activations AS a1 ' +
                    ' where a1.activationkey= :activationkey';

                var queryParams = { activationkey: activationkey };
                Common.sequelize.query(query, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

                    //get the regId from the db with the deviceId
                    if (results != null && results.length > 0) {
                        pushRegID = results[0].pushregid != null ? results[0].pushregid : '';
                        deviceType = results[0].devicetype != null ? results[0].devicetype : '';
                        callback(null);
                    } else {
                        logger.info("Cannot find user info for activation :"+activationkey);
                        callback("User not found");
                    }
                }).catch(function (err) {
                    // handle error;
                    logger.info("Error getting notification user info",err);
                    callback(err);
                });
            },
            function(callback) {
                var notifCode = 7;
                //logger.info("Clear all platform notification for user with pushRegID: "+pushRegID);
                Notifications.sendNotificationByRegId(deviceType, pushRegID, 'remove session', '', closeSessionMsg, notifCode, 1, 0, 1, 'ALL');
                callback(null);
            }
        ], function(err) {
            if (callback)
                callback(null);
        });
}

function platformUserNotificationInternal(opts, callback) {

    var pushRegID,deviceType,enableSound,enableVibrate,showFullNotif,appname,maindomain;
    var logger = opts.logger;
    var hasSound,hasVibrate;

    async.series(
        [
            function(callback) {
                // first get the user params
                if (!opts.session) {
                    var err = new Error("User session not found");
                    logger.info("platformUserNotificationInternal: User session not found");
                    callback(err);
                    return;
                }
                if (opts.urlparams.pkg == "com.google.android.gms") {
                    // ignore google apps notifications
                    callback("ignore google apps");
                    return;
                }
                var activationkey = opts.session.params.activation;
                hasSound = (opts.urlparams.hasSound == '1' ? true : false);
                hasVibrate = (opts.urlparams.hasVibrate == '1' ? true : false);
                opts.logger.info("platformUserNotification sendNotificationByActivation. title: " + opts.urlparams.title +
                    ", keyHash: "+opts.urlparams.keyHash+
                    ", text: "+opts.urlparams.text+
                    ", pkg: "+opts.urlparams.pkg+
                    ", activationkey: "+activationkey);
                    //", opts.session.params: "+JSON.stringify(opts.session.params,null,2));
                var query = 'select a1.pushregid as pushregid, a1.devicetype as devicetype, u1.enablesound as enablesound,' +
                    ' u1.enablevibrate as enablevibrate, o1.showfullnotif as showfullnotif '+
                    ' , o1.maindomain as maindomain ' +
                    ' from activations AS a1 ' +
                    ' INNER JOIN users as u1 ON (a1.email=u1.email) ' +
                    ' INNER JOIN orgs as o1 ON (o1.maindomain=u1.orgdomain) where a1.activationkey= :activationkey';

                var queryParams = { activationkey: activationkey };

                Common.sequelize.query(query, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

                    //get the regId from the db with the deviceId
                    if (results != null && results.length > 0) {
                        pushRegID = results[0].pushregid != null ? results[0].pushregid : '';
                        deviceType = results[0].devicetype != null ? results[0].devicetype : '';
                        enableSound = (results[0].enablesound != null && hasSound) ? results[0].enablesound : 0;
                        enableVibrate = (results[0].enablevibrate != null && hasVibrate) ? results[0].enablevibrate : 0;
                        showFullNotif = results[0].showfullnotif != null ? results[0].showfullnotif : 0;
                        maindomain = results[0].maindomain != null ? results[0].maindomain : '';
                        callback(null);
                    } else {
                        logger.info("Cannot find user info for activation :"+activationkey);
                        callback("User not found");
                    }
                    //send GCM message (push notification) to the client by the regId
                    //sendNotificationByRegId(deviceType, pushRegID, notifyTitle, notifyTime, notifyLocation, type, enableSound, enableVibrate, showFullNotif, packageID);
                }).catch(function (err) {
                    // handle error;
                    logger.info("Error getting notification user info",err);
                    callback(err);
                });

                //Notifications.sendNotificationByActivation(activationkey, opts.urlparams.title, "", opts.urlparams.text, 6, opts.urlparams.pkg+","+opts.urlparams.keyHash);

            },
            function(callback) {
                // get the app name
                var query = 'select appname from apks where packagename = :packagename ';
                var queryParams = { packagename: opts.urlparams.pkg};
                Common.sequelize.query(query, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {
                    //get the appname from the db with the packagename and domain
                    if (results != null && results.length > 0) {
                        appname = results[0].appname != null ? results[0].appname : '';
                        logger.info("Appname: "+appname);
                        callback(null);
                    } else {
                        logger.info("Cannot find app info for packagename :"+opts.urlparams.pkg);
                        callback("User not found");
                    }
                }).catch(function (err) {
                    logger.info("Error getting notification app info",e);
                    callback(err);
                });
            },
            function(callback) {
                var title = (opts.urlparams.title ? appname+': '+opts.urlparams.title : appname );
                var text = (opts.urlparams.text ? opts.urlparams.text : "");
                var notifCode = (opts.urlparams.action == "1" ? 6 : 7 );
                if (opts.urlparams.pkg === "com.nubo.sip" && (opts.urlparams.title === "RING" || opts.urlparams.title === "CANCEL") ) {
                    if (notifCode === 6) {
                        notifCode = 5;
                        title = opts.urlparams.title;
                        Notifications.sendNotificationByRegId(deviceType, pushRegID, title, '', text, notifCode, 1, 1, showFullNotif, opts.urlparams.pkg);
                    }
                } else {
                    Notifications.sendNotificationByRegId(deviceType, pushRegID, title, '', text, notifCode, enableSound, enableVibrate, showFullNotif, opts.urlparams.pkg+","+opts.urlparams.keyHash);
                }
                callback(null);
            }
        ], function(err) {
            callback(null);
        }
    );
}

module.exports = {
    post: post,
    removeAllSessionNotifications: removeAllSessionNotifications
}
