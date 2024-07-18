"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);

var async = require('async');
var sender = null;
var util = require('util');
var request = require('./request.js');
var querystring = require('querystring');
var ThreadedLogger = require('./ThreadedLogger.js');
const {  decode } = require('html-entities')
var userModule = require('./user.js');
var NotificationsHistory = require('./NotificationsHistory.js');
const { QueryTypes } = require('sequelize');
const crypto = require('crypto');

var Notifications = {
    // 'notifyClient' : notifyClient,
    // 'notifyExchangeClient' : notifyExchangeClient,
    'pushNotification': pushNotification,
    'notify': notify,
    'sendNotificationByRegId': sendNotificationByRegId,
    'sendNotificationByActivation': sendNotificationByActivation,
    sendNotificationByUserDevice: sendNotificationByUserDevice,
    sendNotificationToAdmins,
    pushNotificationImp
        // 'sendNotificationFromRemoteServer': sendNotificationFromRemoteServer
};

module.exports = Notifications;


var NEW_ACTIVATION_TYPE = '-2';
var NUBO_DEFAULT_APP = '-1';
var NUBO_EMAIL_APP = '0';
var NUBO_CALENDAR_APP = '1';
var NUBO_MESSENGER_APP = '2';
var NOT_SENDING_NOTIFICATION = "not sending Notification"
var SENDING_NOTIFICATION = "sending Notification"

function notifyClient(req, res,next) {
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    var sessionId = req.params.sessionId;
    if (sessionId === undefined) {
        logger.error("notifyClient: Missing sessionId");
    }
    var id = req.params.id;
    if (id === undefined) {
        logger.error("notifyClient: Invalid notification id");
    }
    var tickerText = req.params.tickerText;
    if (tickerText === undefined) {
        logger.error("notifyClient: Invalid notification tickerText");
    }
    var priority = req.params.priority;
    if (priority === undefined) {
        logger.error("notifyClient: Invalid notification priority");
    }
    var contentText = req.params.contentText;
    if (contentText === undefined) {
        contentText = '';
        logger.error("notifyClient: Invalid notification contentText");
    }
    var contentTitle = req.params.contentTitle;
    if (contentTitle === undefined) {
        contentTitle = 'Nubo';
        logger.error("notifyClient: Invalid notification contentTitle");
    }

    console.log("sessionId= " + sessionId);

    //read sessioinId from redis
    Common.redisClient.hget("sess_" + sessionId, "activation", function(err, replies) {
        if (err) {
            logger.error("ERROR:" + err);
            return;
        }
        var status;
        if (replies !== null) {
            //            this.params = replies;
            var activationKey = replies;
            logger.info("activationKey= " + activationKey);
            //sendNotificationByActivation(activationKey, tickerText, contentTitle, contentText);
            status = 1;
        } else {
            logger.info("replies is null");
            status = 0;
        }
        res.send({
            status: status,
            tickerText: tickerText,
            contentTitle: contentTitle,
            contentText: contentText
        });
    });
}

/*
 activationKey = user activation from db

 EMAIL       -    (activationKey, sender, NU, opt<text>, 0)
 CALENDAR    -    (activationKey, eventName, when, location, 1)
 IM          -    (activationKey, sender, NU, opt<text>, 2)
 else        -    (activationKey, sender, NU, opt<text>, -1)
 */

function sendNotificationByActivation(activationKey, notifyTitle, notifyTime, notifyLocation, type, packageID) {

    var query = 'select a1.pushregid as pushregid, a1.devicetype as devicetype, u1.enablesound as enablesound,' +
        ' u1.enablevibrate as enablevibrate, o1.showfullnotif as showfullnotif from activations AS a1 ' +
        ' INNER JOIN users as u1 ON (a1.email=u1.email AND a1.maindomain=u1.orgdomain) ' +
        ' INNER JOIN orgs as o1 ON (o1.maindomain=a1.maindomain) where a1.activationkey= :activationkey';

    var queryParams = { activationkey: activationKey };

    Common.sequelize.query(query, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

        //get the regId from the db with the deviceId
        var pushRegID = results[0].pushregid != null ? results[0].pushregid : '';
        var deviceType = results[0].devicetype != null ? results[0].devicetype : '';
        var enableSound = results[0].enablesound != null ? results[0].enablesound : 0;
        var enableVibrate = results[0].enablevibrate != null ? results[0].enablevibrate : 0;
        var showFullNotif = results[0].showfullnotif != null ? results[0].showfullnotif : 0;
        //send GCM message (push notification) to the client by the regId
        sendNotificationByRegId(deviceType, pushRegID, notifyTitle, notifyTime, notifyLocation, type, enableSound, enableVibrate, showFullNotif, packageID);
        return;

    }).catch(function(err) {
        return;
    });
}

function sendNotificationToAdmins(maindomain, notifyTitle,notifyLocation) {

    var query = 'select a1.pushregid as pushregid, a1.devicetype as devicetype, u1.enablesound as enablesound,' +
        ' u1.enablevibrate as enablevibrate, o1.showfullnotif as showfullnotif , a1.email as email from activations AS a1 ' +
        ' INNER JOIN users as u1 ON (a1.email=u1.email AND a1.maindomain=u1.orgdomain) ' +
        ' INNER JOIN orgs as o1 ON (o1.maindomain=a1.maindomain) where o1.maindomain= :maindomain AND u1.isadmin = 1 ';

    var queryParams = { maindomain: maindomain };

    Common.sequelize.query(query, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

        for (let i = 0; i < results.length; i++) {
            //get the regId from the db with the deviceId
            var pushRegID = results[0].pushregid != null ? results[i].pushregid : '';
            var deviceType = results[0].devicetype != null ? results[i].devicetype : '';
            var enableSound = results[0].enablesound != null ? results[i].enablesound : 0;
            var enableVibrate = results[0].enablevibrate != null ? results[i].enablevibrate : 0;
            var showFullNotif = 1; //results[0].showfullnotif != null ? results[i].showfullnotif : 0;
            //send GCM message (push notification) to the client by the regId
            let packageID = "com.nubo.controlpanel";
            let appNum = 10;
            //logger.info(`sendNotificationToAdmins. to admin:  ${results[0].email}`);
            sendNotificationByRegId(deviceType, pushRegID, notifyTitle, "", notifyLocation, appNum, enableSound, enableVibrate, showFullNotif, packageID);
        }

    }).catch(function(err) {
        logger.error("Error in sendNotificationToAdmins",err);
        return;
    });
}
/**
 * sendNotificationFromRemoteServer
 * Service for sending push from remote nubo installations
 * Each server need to authenticate with serverID and serverAuthKey
 */
function sendNotificationFromRemoteServer(req, res) {
    var status = 1;
    var msg = "";

    function readParam(paramName) {
        var value = req.params[paramName];
        if (status == 1 && value === undefined) {
            msg = "Missing parameter: " + paramName;
            logger.error("sendNotificationFromRemoteServer: " + msg);
            status = 0;
        }
        return value;
    }
    if (!Common.RemoteServers) {
        msg = "Missing RemoteServers";
        logger.error("sendNotificationFromRemoteServer: " + msg);
        status = 0;
    }
    var serverID = readParam("serverID");
    var serverAuthKey = readParam("serverAuthKey");
    var confAuthKey = Common.RemoteServers[serverID];
    if (status == 1 && confAuthKey != serverAuthKey) {
        msg = "Invalid serverAuthKey";
        logger.error("sendNotificationFromRemoteServer: " + msg);
        status = 0;
    }
    var deviceType = readParam("deviceType");
    var pushRegID = readParam("pushRegID");
    var notifyTitle = readParam("notifyTitle");
    var notifyTime = readParam("notifyTime");
    var notifyLocation = readParam("notifyLocation");
    var type = readParam("type");
    var enableSound = readParam("enableSound");
    var enableVibrate = readParam("enableVibrate");
    var showFullNotif = readParam("showFullNotif");

    if (status == 1) {
        sendNotificationByRegId(deviceType, pushRegID, notifyTitle, notifyTime, notifyLocation, type, enableSound, enableVibrate, showFullNotif);
        msg = "Notification queued";
    }

    res.send({
        status: status,
        msg: msg
    });
}

/**
 * sendNotificationToRemoteSever
 * Deliver the push notification to remote server (gateway)
 * Detailed of the gateway are located in Settings.json
 */
function sendNotificationToRemoteSever(deviceType, pushRegID, notifyTitle, notifyTime, notifyLocation, type, ip, port, UserName, enableSound, enableVibrate, showFullNotif, packageID) {

    var urlQuery = {
        deviceType: deviceType,
        pushRegID: pushRegID,
        notifyTitle: notifyTitle,
        notifyTime: notifyTime.toString(),
        notifyLocation: notifyLocation,
        enableVibrate: enableVibrate,
        type: type,
        enableSound: enableSound,
        showFullNotif: showFullNotif,
        packageID: (packageID === undefined ? "" : packageID),
        serverID: Common.NotificationGateway.serverID,
        serverAuthKey: Common.NotificationGateway.authKey
    }


    //needed only for udp notification
    if (ip && port && UserName) {
        urlQuery.ip = ip;
        urlQuery.port = port;
        urlQuery.userName = UserName;
    }

    var urlstr = Common.NotificationGateway.url + "?" + querystring.stringify(urlQuery);


    request({
        'method': 'GET',
        url: urlstr,
        'strictSSL': true,
        timeout: 5000
    }, function(error, response, body) {
        if (error) {
            logger.error('sendNotificationToRemoteSever: ' + error);
            return;
        }

        try {
            var resObj = JSON.parse(body);
        } catch (err) {
            logger.error('sendNotificationToRemoteSever: ' + err);
            return;
        }

        if (resObj.status === 1) {
            if (resObj.pushregid) {
                Common.db.Activation.update({
                    'pushregid': resObj.pushregid
                }, {
                    where: {
                        'pushregid': pushRegID,
                        'devicetype': deviceType
                    }
                }).then(function(res) {
                    logger.info("sendNotificationToRemoteSever: activation updated with new regid: ", resObj.pushregid);
                });
            }

        } else {
            logger.error('sendNotificationToRemoteSever: got error from remote server: ' + JSON.stringify(resObj));
        }
    });
}

function sendNotificationByRegId(deviceType, pushRegID, notifyTitle, notifyTime, notifyLocation, type, enableSound, enableVibrate, showFullNotif, packageID) {

    if (showFullNotif != 1) {
        notifyLocation = '';
        notifyTime = '';
    }

    if (!pushRegID || pushRegID === '' || pushRegID == '(null)' || pushRegID === 'none') {
        logger.info('Aborting push notification to ' + deviceType + ', push reg id is null');
        return;
    }

    if (Common.NotificationGateway) {
        //logger.info(`sendNotificationByRegId deviceType: ${deviceType}, pushRegID: ${pushRegID}, notifyTitle: ${notifyTitle}`);
        sendNotificationToRemoteSever(deviceType, pushRegID, notifyTitle, notifyTime, notifyLocation, type, "", "", "", enableSound, enableVibrate, showFullNotif, packageID);
        return;
    } else {
        logger.error("Cannot send push notification as NotificationGateway is not registered in settings");
    }


}

function notifyExchangeClient(req, res,next) {

    var status = 0;
    var emailStatus = 1;
    var calendarStatus = 1;
    var OrgUserAccountFromDB = null;
    var appType = -1;

    var notifyTitle = req.params.notifyTitle;
    if (notifyTitle === undefined) {
        logger.error("ERROR - notifyExchangeClient: Invalid notification notifyTitle");
        emailStatus = 0;
        calendarStatus = 0;
    }
    var notifyTime = req.params.notifyTime;
    if (notifyTime === undefined) {
        logger.error("ERROR - notifyExchangeClient: Invalid notification notifyTime");
        calendarStatus = 0;
    }
    var notifyLocation = req.params.notifyLocation;
    if (notifyLocation === undefined) {
        logger.error("ERROR - notifyExchangeClient - Invalid notification notifyLocation");
        calendarStatus = 0;
    }
    var notifyAccount = req.params.notifyAccount;
    if (notifyAccount === undefined) {
        logger.error("ERROR - notifyExchangeClient - Invalid notification notifyLocation");
        calendarStatus = 0;
    }

    var pkgName = req.params.pkgName;
    if (pkgName != "com.android.email" && pkgName != "com.android.calendar") {
        calendarStatus = 0;
        emailStatus = 0;
        status = 1;
        logger.error("ERROR - notifyExchangeClient: Invalid notification pkgName");
    }

    if (pkgName.toString() == "com.android.calendar" && calendarStatus == 0) {
        res.send({
            status: 0,
            message: "invalid calendar params"
        });
        return;
    }

    if (pkgName.toString() == "com.android.email" && emailStatus == 0) {
        res.send({
            status: 0,
            message: "invalid email params"
        });
        return;
    }

    if (status == 1) {
        res.send({
            status: 0,
            message: "invalid email params"
        });
        return;
    }

    logger.info("  notifyTitle= " + notifyTitle + "  notifyTime= " + notifyTime + "  notifyLocation= " + notifyLocation + "  notifyAccount= " + notifyAccount + "  pkgName= " + pkgName);

    async.series([
        function(callback) {
            if (pkgName.toString() == "com.android.email") {
                appType = 0;
            }
            if (pkgName.toString() == "com.android.calendar") {
                appType = 1;
            }

            Common.db.User.findAll({
                attributes: ['email'],
                where: {
                    orgemail: notifyAccount.toString()
                },
            }).complete(function(err, results) {

                if (!!err) {
                    logger.error("Error while reading useremail " + err);
                    callback("Error while reading useremail " + err);
                    return;
                }

                if (!results || results == "") {
                    logger.error("Error - there is no account " + notifyAccount.toString());
                    callback("Error - there is no account " + notifyAccount.toString());
                    return;
                }

                OrgUserAccountFromDB = results[0].email != null ? results[0].email : '';
                callback(null);
            });

        },

        function(callback) {

            Common.db.Activation.findAll({
                attributes: ['activationkey', 'onlinestatus', 'status'],
                where: {
                    email: OrgUserAccountFromDB.toString(),
                    status: 1
                },
            }).complete(function(err, results) {

                if (!!err) {
                    logger.error("Error while getting activationkey, onlinestatus, status FROM activations " + err);
                    callback("Error while getting activationkey, onlinestatus, status FROM activations " + err);
                    return;
                }

                if (!results || results == "") {
                    logger.error("Error while getting activationkey, onlinestatus, status FROM activations - there is no email " + OrgUserAccountFromDB);
                    callback("Error while getting activationkey, onlinestatus, status FROM activations - there is no email " + OrgUserAccountFromDB);
                    return;
                }

                for (var i = 0; i < results.length; i++) {
                    var onlinestatus = results[i].onlinestatus != null ? results[i].onlinestatus : 0;
                    if (onlinestatus == "1") {
                        callback("user is connected to Nubo");
                        return;
                    } //if (onlinestatus == "1"){
                } // for

                for (var i = 0; i < results.length; i++) {
                    var activationkey = results[i].activationkey != null ? results[i].activationkey : '';
                    var activationStatus = results[i].status != null ? results[i].status : '';
                    if (activationStatus == "1") {
                        sendNotificationByActivation(activationkey, notifyTitle, notifyTime, notifyLocation, appType.toString());
                    } //if (activationStatus == "1"){
                } // for
                callback(null);
            });

        }
    ], function(err, results) {
        res.send({
            status: (err) ? 0 : 1,
            notifyAccount: notifyAccount,
            pkgName: pkgName
        });
        if (err) {
            logger.error("Error during send notification to client: " + err);
        } else {
            logger.info("notification sent to client");
        }
    });
    //async.series
}

/*
 The 'pushNotification' function shall receive email, notification params
 and notify the client
 req {[email], titleText, ticketText, messageText ,appName}
 res {status, msg}
 APP       <NUM>
 EMAIL     <0>     -    ( [ TOemail ] , 	sender,      "",     opt<text>, 0)
 CALENDAR  <1>     -    ( [ TOemail ] , 	eventName,  when,    location, 1)
 IM        <2>     -    ( [ TOemail ] , 	sender,      "",     opt<text>, 2)
 else      <-1>    -    ( [ TOemail ] , 	title,       "",     opt<text>, -1)

 https://login.nubosoftware.com//Notifications/pushNotification?email=[]&email=[]&titleText=[]&notifyTime=[]&notifyLocation=[]&appName=[]
 */

function pushNotification(req, res,next) {
    let params = {
        email: req.params.email,
        titleText : req.params.titleText,
        notifyTime : req.params.notifyTime,
        notifyLocation : req.params.notifyLocation,
        appName : req.params.appName,
        authKey : req.params.authKey,
        adminLogin: req.nubodata.adminLogin,
        contentId: req.params.contentId
    }
    pushNotificationImp(params,(result) => {
        res.send(result);
    });
}


function pushNotificationImp(params,cb) {
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    var status = -1;
    var msg = "";

    var email = params.email;
    if (email === undefined) {
        logger.error("ERROR - pushNotification: Invalid email");
        status = 0;
        msg = msg + " - ERROR - pushNotification: Invalid email";
    }
    logger.user(email);

    var titleText = params.titleText;
    if (titleText === undefined) {
        logger.error("ERROR - pushNotification: Invalid titleText");
        status = 0;
        msg = msg + " - ERROR - pushNotification: Invalid titleText";
    }

    var notifyTime = params.notifyTime;
    if (notifyTime === undefined) {
        logger.error("ERROR - pushNotification: Invalid notifyTime");
        status = 0;
        msg = msg + " - ERROR - pushNotification: Invalid notifyTime";
    }

    var notifyLocation = params.notifyLocation;
    if (notifyLocation === undefined) {
        logger.error("ERROR - pushNotification: Invalid notifyLocation");
        status = 0;
        msg = msg + " - ERROR - pushNotification: Invalid notifyLocation";
    }

    var remoteNotifApps = Common.remoteNotifApps;
    if (notifyLocation === undefined) {
        logger.error("ERROR - pushNotification: remoteNotifApps not found");
        status = 0;
        msg = msg + " - ERROR - pushNotification: remoteNotifApps not found";
    }
    var contentId = params.contentId;
    var appData;
    var appName = params.appName;
    var authKey = params.authKey;
    if (remoteNotifApps && appName) {
        appData = remoteNotifApps[appName];
    }

    if (appName === undefined || authKey === undefined || appData === undefined || authKey != appData.authKey) {

        if (!params.adminLogin) {
            logger.error("ERROR - pushNotification: Invalid appID or authKey");
            status = 0;
            msg = msg + " - ERROR - pushNotification: Invalid appID or authKey";
        } else {
            appData = {
                appNum: "4",
            };

        }
    }


    if (status == 0) {
        cb({
            status: status,
            message: msg
        });
        return;

    } else {
        if (!util.isArray(email)) {
            email = [email];
        }
        var appNum = appData.appNum;

        var failedEmailNotification = [];

        //TODO change the name to something more appropriate!!!
        if (Common.withService) {
            logger.info("inserting notification into db...");
        } else {
            logger.info("sending push notification...");
        }


        async.eachSeries(email, function(emailItem, callback) {
            if (appNum == "0" || appNum == "1" || appNum == "2") {
                userModule.getUserNotificationsStatusForAllApps(emailItem, function(errorMessage, appsNotifResponse) {
                    if (errorMessage) {
                        logger.error('pushNotification::getUserNotificationsStatusForAllApps failed!!!');
                        callback(null);
                    } else {
                        var dataRes = '{"status" : "1",' + appsNotifResponse + '}';
                        var data = JSON.parse(dataRes.toString());
                        if (data == null || data.appsNotifStatus == null || data.appsNotifStatus == "") {
                            notify(emailItem, titleText, notifyTime, notifyLocation, appNum, function(err) {
                                if (err) {
                                    logger.error('ERROR::pushNotification: ' + err);
                                    failedEmailNotification.push(emailItem);
                                }
                                callback(null);
                            });
                        } else {
                            isUserNotificationEnabled(data.appsNotifStatus, appNum, function(retVal) {
                                if (retVal) {
                                    notify(emailItem, titleText, notifyTime, notifyLocation, appNum, function(err) {
                                        if (err) {
                                            logger.error('ERROR::pushNotification:: ' + err);
                                            failedEmailNotification.push(emailItem);
                                        }
                                        callback(null);
                                    });
                                } else {
                                    callback(null);
                                }
                            });
                        }
                    }
                });
            } else if (appData.wakeUpSession === true) {
                // search for user device based on phone number and wakeup session
                //let userEmail,imei,device;
                let devices = [];
                async.series(
                    [
                        function (callback) {
                            // check the type of emailItem (local extension or email)
                            let where;
                            if (emailItem.indexOf("@") > 0) {
                                where = { email: emailItem  };
                            } else {
                                where = { local_extension: emailItem  };
                            }

                            Common.db.UserDevices.findAll({
                                where: where
                            }).complete(function (err, results) {
                                if (err) {
                                    logger.error("pushNotification: Error getting UserDevices: " + err);
                                    callback(err);
                                    return;
                                }
                                if (!results || results == "") {
                                    let msg = "Cannot find user device in DB. local_extension: "+emailItem;
                                    logger.info("pushNotification: " + msg);
                                    callback(msg);
                                    return;
                                }
                                devices = results;
                                callback(null);
                            });
                        },
                        function (callback) {

                            async.eachSeries(
                                devices,
                                function(device, callback) {
                                    let userEmail = device.email;
                                    let imei = device.imei;
                                    if (!userEmail || !imei || userEmail == "" || imei == "") {
                                        let msg = "Invalid email or imei";
                                        logger.info("pushNotification: " + msg);
                                        callback(msg);
                                        return;
                                    }
                                    require('./StartSession.js').startSessionByDevice(userEmail,imei,device,(err) => {
                                        callback(err);
                                    });

                                },
                                function(err) {
                                    callback(err);
                                }
                            );
                        }
                    ], function(err) {
                        if (err) {
                            logger.error("pushNotification. wakeup session failed: ",err)
                        }
                        callback(err);

                    });

            } else {
                let packageID = appData.packageID;
                if ((appNum == "6" || appNum == "8") && packageID != "") {
                    packageID = `${appData.packageID},API${crypto.randomBytes(16).toString("hex")}`;
                }
                if (contentId) {
                    packageID = `${appData.packageID},CONTENT_ID:${contentId}`;
                }
                notify(emailItem, titleText, notifyTime, notifyLocation, appNum, function(err) {
                    if (err) {
                        logger.error('ERROR::pushNotification:: ' + err);
                        failedEmailNotification.push(emailItem);
                    }
                    callback(null);
                }, packageID);
            }

        }, function(err) {
            if (err) {
                logger.error('pushNotification::Sending notication failed!!!');
                cb({
                    status: '0',
                    message: "Notification::message was not delivered"
                });
            } else {
                cb({
                    status: failedEmailNotification.length == 0 ? '1' : '0',
                    message: failedEmailNotification.length == 0 ? ["Notification::message was successfully delivered..."] : failedEmailNotification,
                });

            }
        });

    }
}

function isUserNotificationEnabled(data, appName, callback) {


    async.eachSeries(data, function(item, callback) {
        if ((item.appName == "Email" && appName == "0") || (item.appName == "Calendar" && appName == "1") || (item.appName == "Messaging" && appName == "2")) {
            if (item.sendNotif == 1) {
                callback(SENDING_NOTIFICATION);
            } else {
                callback(NOT_SENDING_NOTIFICATION);
            }
        } else {
            callback(null);
        }


    }, function(retVal) {
        if (retVal == SENDING_NOTIFICATION) {
            callback(true);
        } else if (retVal == NOT_SENDING_NOTIFICATION) {
            callback(false);
        } else {
            callback(false);
        }
    });
}

/*
 Sends a GCM notification to the client
 */
function sendNotificationToAllDevices(email, titleText, notifyTime, notifyLocation, appName, packageID, callback) {
    //logger.info("sendNotificationToAllDevices. email: "+email);
    async.series([
        function(callback) {
            // check that notfication has been enabled to this app
            var strAppName = appName;
            if (appName == 0 || appName == "0") {
                strAppName = 'Email';
            } else if (appName == 1 || appName == "1") {
                strAppName = 'Calendar';
            } else if (appName == 2 || appName == "2") {
                strAppName = 'Messaging';
            } else { // skip check if it not email/calendar/messaging
                callback(null);
                return;
            }
            //logger.info("sendNotificationToAllDevices. strAppName: "+strAppName);
            Common.db.UserApplicationNotifs.findAll({
                attributes : ['sendnotif'],
                where : {
                    appname: strAppName,
                    email      : email,
                    sendnotif  : 1
                }
            }).complete(function(err, results) {
                //logger.info("sendNotificationToAllDevices. err: "+err+", results: "+results);
                if (!results || results.length == 0) {
                    var msg = 'sendNotificationToAllDevices, User '+ email+" disabled notifications to appName: "+strAppName;
                    logger.info(msg);
                    callback(msg);
                    return;
                }
                //logger.info("sendNotificationToAllDevices. results: "+JSON.stringify(results,null,2));

                callback(null);
            });
        },
        function(callback) {
            Common.db.Activation.findAll({
                attributes: ['activationkey', 'onlinestatus', 'status','maindomain'],
                where: {
                    email: email,
                    status: 1
                },
            }).complete(function(err, results) {
                if (err) {
                    callback("sendNotificationToAllDevices:: Failed accessing DB");
                    return;
                } else {
                    results.forEach(function(row) {
                        var activationkey = row.activationkey != null ? row.activationkey : '';
                        let appSettingsKey = `${appName}:${row.maindomain}`;
                        if (Common.remoteNotifApps) {
                            let appData = Common.remoteNotifApps[appSettingsKey];
                            if (appData) {
                                if (appData.packageID) {
                                    packageID = appData.packageID;
                                }
                                if (appData.appNum) {
                                    appName = appData.appNum;
                                }
                                logger.info(`sendNotificationToAllDevices. Found app data for ${appSettingsKey}. change packageID: ${packageID}, appName: ${appName}`);
                            }
                        }
                        sendNotificationByActivation(activationkey, titleText, notifyTime, notifyLocation, appName.toString(), packageID);
                    });
                    callback(null);
                }
            });
        }
    ],function(err) {
        callback(err);
    });
}

function sendNotificationByUserDevice(email,imei,titleText, notifyTime, notifyLocation, appName, packageID) {
    Common.db.Activation.findAll({
        attributes: ['activationkey', 'onlinestatus', 'status'],
        where: {
            email: email,
            deviceid: imei,
            status: 1
        },
    }).complete(function(err, results) {
        if (err) {
            logger.error("sendNotificationToAllDevices:: Failed accessing DB",err);
            return;
        } else {
            results.forEach(function(row) {
                var activationkey = row.activationkey;
                if (activationkey!= null && activationkey !== "") {
                    sendNotificationByActivation(activationkey, titleText, notifyTime, notifyLocation, appName, packageID);
                }
            });
        }
    });
}

function xmlDecode(str) {
    return decode(str, {level: 'xml'})
}

function notify(email, titleText, notifyTime, notifyLocation, appName, callback, packageID) {
    logger.info("Notification.js::notify. appName: "+appName+", email: "+email);
    titleText = xmlDecode(titleText);
    notifyLocation = xmlDecode(notifyLocation);
    notifyTime = xmlDecode(notifyTime);
    sendNotificationToAllDevices(email, titleText, notifyTime, notifyLocation, appName, packageID, callback);



}
