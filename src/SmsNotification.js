"use strict";

var Common = require('./common.js');
var util = require('util');
var request = require('request');
var querystring = require('querystring');
var async = require('async');
var sessionModule = require('./session.js');
var PlatformModule = require('./platform.js');
var Sequelize = require('sequelize');
const Op = Sequelize.Op;

var Platform = PlatformModule.Platform;
var logger = Common.getLogger(__filename);

var SmsNotification = {
    'sendSmsNotification' : sendSmsNotification,
    'sendSmsNotificationFromRemoteServer' : sendSmsNotificationFromRemoteServer,
    'sendSmsNotificationInternal' : sendSmsNotificationInternal,
    'platformUserSendSms': platformUserSendSms,
    'receiveSMS': receiveSMS,
    deliverSMSToNuboUser,
    deliverPendingMessagesToSession
};

module.exports = SmsNotification;

function sendSmsNotification(req, res) {
    var status = 1;
    var msg = "OK";
    function readParam(paramName) {
        var value = req.params[paramName];
        if (status == 1 && value === undefined) {
            msg = "Missing parameter: "+paramName;
            logger.error("sendNotificationFromRemoteServer: "+msg);
            status = 0;
        }
        return value;
    }

    var toPhone = readParam("toPhone");
    var body = readParam("body");
    logger.info("sendSmsNotification status = " + status);

    sendSmsNotificationInternal(toPhone,body,function(returnMessage,status)  {
        res.send({
            status : status,
            msg : returnMessage
        });
        return;
    });
}

const MessagingResponse = require('twilio').twiml.MessagingResponse;


function deliverPendingMessagesToSession(session,cb) {
    var email = session.params.email;
    var localid = session.params.localid;
    var platform = session.platform;
    var deviceId = session.params.deviceid;
    let haveMsgs = true;
    let msg;
    let cnt = 0;
    async.whilst( () => {
        return haveMsgs;
    }, (cb) => {
        Common.redisClient.spop('msgs_' + email + '_' + deviceId,(err,msg) => {
            if (err) {
                logger.error("deliverPendingMessagesToSession redis error",err);
                cb(err);
                return;
            }
            if (!msg) {
                haveMsgs = false;
                cb(null);
                return;
            }
            cnt++;
            let toInd = msg.indexOf(":");
            if (toInd < 0) {
                cb(null);
                return;
            }
            let to = msg.substring(0, toInd);
            let fromInd = msg.indexOf(":", toInd + 1);
            if (fromInd < 0) {
                cb(null);
                return;
            }
            let from = msg.substring(toInd + 1, fromInd);
            let text = msg.substring(fromInd + 1);
            platform.receiveSMS(to, from, text, localid, (err) => {
                cb(null);
            });
        });
    }, err => {
        //logger.info(`deliverPendingMessagesToSession. Finished. Found ${cnt} messages`);
        if (cb) {
            cb(err);
        }
    });

}

function deliverSMSToNuboUser(toAssigned,toLocal, fromLocal, fromAssigned, text,cb) {
    let retObj = {
        status: 1,
        msg: "OK",
        err: null
    };

    let email, imei, session;
    let platid, localid;
    let platform;
    let device;
    let to,from;
    logger.info("deliverSMSToNuboUser");
    let where;
    if (toAssigned && toLocal) {
        //where = [' assigned_phone_number = ?  or local_extension = ?', toAssigned, toLocal];
        where = {
            [Op.or] : {
                assigned_phone_number: toAssigned,
                local_extension: toLocal
            }
        };
        to = toLocal;
    } else if (toLocal) {
        where = {
            local_extension: toLocal
        };
        to = toLocal;
    } else {
        where = {
            assigned_phone_number: toAssigned
        };
        to = toAssigned;
    }
    async.series(
        [
            function (callback) {
                Common.db.UserDevices.findAll({
                    attributes: ['email', 'imei', 'active', 'devicename', 'platform', 'gateway','assigned_phone_number','local_extension'],
                    where: where
                }).complete(function (err, results) {
                    if (err) {
                        logger.error("deliverSMSToNuboUser: Error getting UserDevices: " + err);
                        retObj.status = 0; // user not found
                        retObj.msg = "deliverSMSToNuboUser: Error getting UserDevices: " + err;
                        retObj.err = err;
                        callback(retObj);
                        return;
                    }
                    if (!results || results == "") {
                        retObj.status = 0; // user not found
                        retObj.msg = "Cannot find user device in DB. to:"+to;
                        logger.info("deliverSMSToNuboUser: " + retObj.msg);
                        callback(retObj);
                        return;
                    }
                    email = results[0].email;
                    imei = results[0].imei;
                    device = results[0];
                    if (!email || !imei || email == "" || imei == "") {
                        retObj.status = 0; // user not found
                        retObj.msg = "Invalid email or imei";
                        logger.info("deliverSMSToNuboUser: " + retObj.msg);
                        callback(retObj);
                        return;
                    }
                    callback(null);
                });
            },
            function (callback) {
                sessionModule.getSessionOfUserDevice(email, imei, function (err, sess) {
                    if (err) {
                        logger.error("deliverSMSToNuboUser: Error getSessionOfUserDevice: " + err);
                        retObj.status = 2; // session not found
                        retObj.msg = "deliverSMSToNuboUser: Error getSessionOfUserDevice: " + err;
                        retObj.err = err;
                        callback(retObj);
                        return;
                    }
                    if (!sess) {
                        retObj.status = 2; // session not found
                        retObj.msg = "Cannot find active session for user";
                        logger.info("deliverSMSToNuboUser: " + retObj.msg);
                        callback(retObj);
                        return;
                    }
                    session = sess;
                    platid = session.params.platid;
                    localid = session.params.localid;
                    if (isNaN(localid) || isNaN(localid)) {
                        retObj.status = 2; // session not found
                        retObj.msg = "platid or localid not found";
                        logger.info("deliverSMSToNuboUser: " + retObj.msg);
                        callback(retObj);
                        return;
                    }
                    callback(null);

                });
            }, function (callback) {
                new Platform(platid, null, function (err, obj) {
                    if (err || !obj) {
                        retObj.status = 2; // session not found
                        retObj.msg = "Platform does not exist. err: " + err;
                        logger.info("deliverSMSToNuboUser: " + retObj.msg);
                        retObj.err = err;
                        callback(msg);
                        return;
                    }
                    platform = obj;
                    callback(null);
                });
            }, function (callback) {
                if (toAssigned && toLocal) {
                    //logger.info(`deliverSMSToNuboUser. device.assigned_phone_number: ${device.assigned_phone_number}, toAssigned: ${toAssigned}`);
                    if (device.assigned_phone_number == toAssigned) {
                        to = toAssigned;
                        from = fromAssigned;
                        //logger.info(`deliverSMSToNuboUser. toAssigned: ${toAssigned}, fromAssigned: ${fromAssigned}`);
                    } else {
                        to = toLocal;
                        from = fromLocal;
                        //logger.info(`deliverSMSToNuboUser. toLocal: ${toLocal}, fromLocal: ${fromLocal}`);
                    }

                } else if (toLocal) {
                    to = toLocal;
                    from = fromLocal;
                    //logger.info(`deliverSMSToNuboUser (local). to: ${to}, from: ${from}`);
                } else {
                    to = toAssigned;
                    from = fromAssigned;
                    //ogger.info(`deliverSMSToNuboUser (assigned). to: ${to}, from: ${from}`);
                }
                logger.info("Sending SMS to platform: " + platid + ", localid: " + localid + ", from: " + from + ", to: "+ to +", text: " + text);
                platform.receiveSMS(to, from, text, localid, (err) => {
                    if (err) {
                        retObj.status = 2; // session not found
                        retObj.msg = "Platform request error. err: " + err;
                        logger.info("deliverSMSToNuboUser: " + retObj.msg);
                        retObj.err = err;
                        callback(msg);
                        return;
                    }
                    callback(null);
                });
            }
        ], function (err) {
            if (!err) {
                cb(retObj);
            } else {
                if (err.status === 2) {
                    // add the message for deliver later when session is online
                    let redisMsg = `${to}:${from}:${text}`;
                    Common.redisClient.sadd('msgs_' + email + '_' + imei, redisMsg, function(err) {
                        if (err) {
                            logger.error("Error saving message to redis",err);
                        }
                        // try to start session
                        require('./StartSession.js').startSessionByDevice(email,imei,device,(err) => {

                        });
                    });
                }
                cb(err);
            }
        });
}
function receiveSMS(req, res) {
    logger.info("Params: "+ JSON.stringify(req.params,null,2));
    //const twiml = new MessagingResponse();
    //twiml.message('The Robots are coming! Head for the hills!');
    //res.writeHead(200, {'Content-Type': 'text/xml'});
    //res.end(twiml.toString());
    var status = 1;
    var msg = "OK";
    function readParam(paramName) {
        var value = req.params[paramName];
        if (status == 1 && value === undefined) {
            msg = "Missing parameter: "+paramName;
            logger.error("receiveSMS: "+msg);
            status = 0;
        }
        return value;
    }

    let to = readParam("To");
    let text = readParam("Body");
    let from = readParam("From");
    let email,imei,session;
    let platid,localid;
    let platform;


    if (status != 1) {
        res.send({
            status: status,
            msg: msg
        });
        return;
    }

    if (to.indexOf("+") < 0) {
        to = "+"+to;
    }
    if (from.indexOf("+") < 0) {
        from = "+"+from;
    }

    deliverSMSToNuboUser(to,null,from,from,text,(retObj) => {
        res.send(retObj);
    });

}

function platformUserSendSms(req, res) {
    var status = 1;
    var msg = "OK";
    function readParam(paramName) {
        var value = req.params[paramName];
        if (status == 1 && value === undefined) {
            msg = "Missing parameter: "+paramName;
            logger.error("platformUserSendSms: "+msg);
            status = 0;
        }
        return value;
    }

    //logger.info("platformUserSendSms Session params: "+ JSON.stringify(req.nubodata.session.params,null,2));
    let email = req.nubodata.session.params.email;
    let deviceid = req.nubodata.session.params.deviceid;
    let destAddr = readParam("destAddr");
    let body = readParam("text");
    let fromPhone,regionCode,fromExt;
    let sentLocally = false;
    let toPhone;

    if (!Common.isEnterpriseEdition()) {
        status = 0;
        msg = "Not supported";
    }

    if (status != 1) {
        res.send({
            status : status,
            message : msg
        });
        logger.info("platformUserSendSms status = " + status);
        return;
    }



    destAddr = destAddr.replace(/[^a-zA-Z0-9\+]/g, "");

    async.series(
        [
            function (callback) {
                Common.db.UserDevices.findAll({
                    attributes: ['email', 'imei', 'active', 'devicename','platform' , 'assigned_phone_number', 'region_code','local_extension'],
                    where: {
                        email: email,
                        imei: deviceid
                    },
                }).complete(function(err, results) {
                    if (err) {
                        logger.error("platformUserSendSms: Error getting UserDevices: "+err);
                        callback(err);
                        return;
                    }
                    if (!results || results == "") {
                        callback("Cannot find user device in DB");
                        return;
                    }
                    regionCode = results[0].region_code;
                    fromPhone = results[0].assigned_phone_number;
                    fromExt = results[0].local_extension;
                    if (!fromExt || fromExt === "") {
                        fromExt = fromPhone;
                    }
                    if (!fromPhone || fromPhone.length < 5) {
                        fromPhone = Common.smsOptions.fromPhone;
                        if (!fromPhone || fromPhone.length < 1) {
                            callback("Cannot find assigned phone number");
                            return;
                        }
                    }
                    toPhone = Common.getEnterprise().telephonyAPI.destAddrToPhoneNumber(regionCode,destAddr,fromPhone);

                    callback(null);
                });
            },
            /// Check if the toPhone is local number and if yes send to Nubo
            function(callback) {
                logger.info(`platformUserSendSms Check if the toPhone is local fromPhone: ${fromPhone}, fromExt: ${fromExt}, toPhone: ${toPhone}, destAddr: ${destAddr}`);
                deliverSMSToNuboUser(toPhone,destAddr,fromExt,fromPhone, body,(retObj) => {
                    if (retObj.status === 0) {
                        // user not find localy
                        sentLocally = false;
                    } else {
                        logger.info("Delivered SMS to local user");
                        sentLocally = true;
                    }
                    callback(null);
                });
            },
            function (callback) {
                if (!sentLocally) {
                    logger.info("platformUserSendSms sendSmsNotificationInternal");
                    sendSmsNotificationInternal(toPhone, body, fromPhone, function (returnMessage, returnStatus) {
                        if (returnStatus != 1) {
                            callback(returnMessage);
                            return;
                        }
                        msg = returnMessage;
                        callback(null);
                    });
                } else {
                    callback(null);
                }
            }
        ], function (err) {
            if (err) {
                logger.error("platformUserSendSms error: "+err);
                status = 0;
                msg = err;
            } else {
                logger.info("platformUserSendSms. OK: "+msg);
                status = 1;
            }
            res.send({
                status: status,
                message: msg
            });
        }
    );



}

function sendSmsNotificationInternal(toPhone, body, fromPhone, callback) {
    var status = 1;
    var msg = '';

    if (Common.NotificationGateway != null && Common.NotificationGateway.smsUrl != null
            && Common.NotificationGateway.smsUrl.length > 0) {
        // send SMS to remote server
        sendSmsNotificationToRemoteSever(toPhone, body, function(returnMessage) {
            callback(returnMessage,status);
            return;
        });
    } else {
        // small validation before we have Alex mechanism in place
        if (toPhone == null || toPhone.length <=0 || toPhone.length > 20 || body == null || body.length <= 0 || body.length > 250) {
            status = 0;
        }

        // if everything is OK
        if (status == 1) {
            // send the SMS
            sendSms(toPhone, body,fromPhone, callback);
            msg = "Notification queued";

            return;
        } else {
            callback("Wrong notification params, missing body or number", status);
            return;
        }
    }
}

/**
 * sendNotificationFromRemoteServer Service for sending push from remote nubo
 * installations Each server need to authenticate with serverID and
 * serverAuthKey
 */
function sendSmsNotificationFromRemoteServer(req, res) {
    var status = 1;
    var msg = "OK";
    function readParam(paramName) {
        var value = req.params[paramName];
        if (status == 1 && value === undefined) {
            msg = "Missing parameter: "+paramName;
            logger.error("sendNotificationFromRemoteServer: "+msg);
            status = 0;
        }
        return value;
    }

    var toPhone = readParam("toPhone");
    var body = readParam("body");
    var serverID = readParam("serverID");
    var serverAuthKey = readParam("serverAuthKey");

    if (!Common.RemoteServers) {
        msg = "Missing RemoteServers";
        logger.error("sendSmsNotificationFromRemoteServer: " + msg);
        status = 0;
    }

    var confAuthKey = Common.RemoteServers[serverID];
    if (status == 1 && confAuthKey != serverAuthKey) {
        msg = "Invalid serverAuthKey";
        logger.error("sendNotificationFromRemoteServer: " + msg);
        status = 0;
    }

    async.series(
        [
            function(callback) {
                if(status == 1) {
                    sendSmsNotificationInternal(toPhone, body, null, function(err) {
                        if(err) {
                            status = 0;
                            msg = err;
                        } else {
                            msg = "Sms queued";
                        }
                        callback(null);
                    });
                } else {
                    callback(null);
                }
            }
        ], function(err) {
            res.send({
                status : status,
                msg : msg
            });
        }
    );
}

function sendSms(toPhone, body,fromPhone, callback) {

    if (Common.smsHandler) {
        try {
            let scriptFile;
            if (Common.smsHandler.startsWith('/')) {
                scriptFile = Common.smsHandler;
            } else {
                scriptFile = Common.path.join(Common.rootDir,Common.smsHandler);
            }
            logger.info(`smsHandler: ${scriptFile}`);
            require(scriptFile)(toPhone, body,callback);
        } catch (e) {
            console.log("e: ", e);
            logger.error("Cannot send sms, exception: " + JSON.stringify(e));
        }
    } else if(Common.smsOptions) {
        // Twilio logic to send SMS
        var accountSid = Common.smsOptions.accountSid;
        var authToken = Common.smsOptions.authToken;
        if (!fromPhone)
            fromPhone = Common.smsOptions.fromPhone;
        var client = require('twilio')(accountSid, authToken);
        let params = {
            body : body,
            to : toPhone,
            from : fromPhone
        };
        //logger.info(`sendSms: ${JSON.stringify(params,null,2)}`);
        client.messages.create(params, function(err, message) {
            let status;
            let msg;
            if (err) {
                msg = "Error while sending message " + err;
                logger.error(msg);
                status = 0;
            } else {
                msg = "SMS Message queued, message id " + message.sid;
                logger.info(msg);
                status = 1;
            }
            if (callback) {
                callback(msg,status)
            }

        });
    } else {
        logger.error("SMS notification has not been configured\nMissed Common.smsOptions");
    }
}

/**
 * sendNotificationToRemoteSever Deliver the push notification to remote server
 * (gateway) Detailed of the gateway are located in Settings.json
 */
function sendSmsNotificationToRemoteSever(toPhone, body, callback) {
    var urlstr = Common.NotificationGateway.smsUrl + "?" + querystring.stringify({
        toPhone : toPhone,
        body : body,
        serverID : Common.NotificationGateway.serverID,
        serverAuthKey : Common.NotificationGateway.authKey
    });

    request({
        'method' : 'GET',
        url : urlstr,
        'strictSSL' : true,
        timeout : 5000
    }, function(error, response, body) {
        if (error) {
            logger.info('error: ' + error);
            var msg = "Connection error";
            callback(msg);
            return;
        } else {
            callback(body);
        }
    });
}
