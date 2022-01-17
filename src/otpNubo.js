"use strict"

var http = require('./http.js');
var Common = require('./common.js');
var crypto = require('crypto');
var async = require('async');
var Login = require('./login.js');
var ThreadedLogger = require('./ThreadedLogger.js');
var url = require('url');
var querystring = require('querystring');
var path = require('path');
const request = require('request');
var smsNotification = require('./SmsNotification.js');
let locale = require('./locale.js').locale;
const totp = require("totp-generator");


function sendUserOtpCode(login, logger, callback) {


    const email = login.getEmail();
    const deviceID = login.getDeviceID();
    let mobilephone;
    let otpcode;
    let status = Common.STATUS_ERROR;

    async.series([
        function(callback) {
            if (login.loginParams.secondauthmethod == Common.SECOND_AUTH_METHOD_OTP || login.loginParams.secondauthmethod == Common.SECOND_AUTH_METHOD_BIOMETRIC_OR_OTP) {
                callback(null);
            } else {
                let msg = "OTP authentication is not configured";
                logger.error(`sendUserOtpCode: ${msg}`);
                callback(msg);
            }
        },
        function(callback) {
            if (login.loginParams.otptype == 1) {
                callback(null);
            } else {
                let msg = "OTP type is not SMS";
                logger.error(`sendUserOtpCode: ${msg}. otptype: ${login.loginParams.otptype} `);
                callback(msg);
            }
        },
        function(callback) {
            // read user mobile number
            Common.db.User.findAll({
                attributes: ['mobilephone'],
                where: {
                    email: email,
                },
            }).then(results => {
                if (!results || results.length != 1) {
                    let msg = `sendUserOtpCode. user ${email} not found`
                    logger.error(msg);
                    callback(new Error(msg));
                    return;
                }
                mobilephone = results[0].mobilephone;
                if (!mobilephone || mobilephone.length < 1) {
                    let msg = `sendUserOtpCode. user ${email} not found mobile number`
                    logger.error(msg);
                    status = Common.STATUS_INVALID_RESOURCE;
                    callback(new Error(msg));
                    return;
                }
                callback(null);
            }).catch(err => {
                callback(err);
            });
        },
        function(callback) {
            var val = Math.floor(10000 + Math.random() * 90000);
            otpcode = val.toString();
            login.loginParams.otpNuboCode = otpcode;
            login.save(callback);
        },
        function(callback) {
            // send OTP sms to user
            let body = locale.format("otpCode",otpcode );
            if (Common.otpDebug) {
                logger.info(body);
                callback();
                return;
            }
            smsNotification.sendSmsNotificationInternal(mobilephone, body, null, function (message, smsStatus) {
                if (smsStatus == 1) {
                    logger.info(message);
                    callback(null);
                } else {
                    let err = "OTP send error: "+message
                    logger.info(err);
                    status = Common.STATUS_INVALID_RESOURCE;
                    callback(err);
                }
            });
        },
        function(callback) {
            var multi = Common.getRedisMulti();

            var otpTimer = 'otp_timer_' + email + "_" + deviceID;
            multi.set(otpTimer, Common.otpTimeout);
            multi.expire(otpTimer, Common.otpTimeout);

            multi.exec(callback);
        },
    ], function(err) {
        if (err) {
            logger.error("sendUserOtpCode: " + err+", status: "+status);
            callback(err,status);
            return;
        }
        status = Common.STATUS_OK;
        return callback(null,status);
    });

}

function checkUserOtpCode(login, SMSCode, logger, callback) {
    if (login.loginParams.secondauthmethod != Common.SECOND_AUTH_METHOD_OTP && login.loginParams.secondauthmethod != Common.SECOND_AUTH_METHOD_BIOMETRIC_OR_OTP) {
        let msg = "OTP authentication is not configured";
        logger.error(`checkUserOtpCode: ${msg}`);
        callback(null,msg,Common.STATUS_ERROR);
        return;
    }
    if (login.loginParams.otptype == 1) {
        checkUserOtpCodeSMS(login, SMSCode, logger, callback);
    } else {
        checkUserOtpCodeTOTP(login, SMSCode, logger, callback);
    }
}

function checkUserOtpCodeTOTP(login, SMSCode, logger, callback){
    logger.info("checkUserOtpCodeTOTP..");
    var finish = "__finish";
    var email = login.getEmail();
    var deviceID = login.getDeviceID();

    var message;
    var status;
    let addToken = false;
    async.series([
        function(callback) {
            Common.db.Activation.findAll({
                attributes: ['otp_token'],
                where: {
                    activationkey: login.getActivationKey(),
                    maindomain: login.getMainDomain(),
                    email: login.getEmail()
                },
            }).complete(function(err, results) {
                if (!!err) {
                    return callback(err);
                }

                if (!results || results == "") {
                    status = Common.STATUS_ERROR;
                    message = "Cannot find activation";
                    return callback(finish);
                }

                if (results[0].otp_token == "") {
                    logger.info(`Adding new otp token ${SMSCode}`,{mtype: "important"});                    
                    try {
                        totp(SMSCode);
                    } catch (err) {
                        message = `Invalid new OTP token. Error: ${err}`;
                        status = Common.STATUS_ERROR;
                        callback(finish);
                        return;
                    }
                    addToken = true;
                    callback(null);
                } else {
                    let calculatedCode;
                    try {
                        calculatedCode = totp(results[0].otp_token);
                    } catch (err) {
                        message = `Invalid OTP token. Error: ${err}`;
                        status = Common.STATUS_ERROR;
                        callback(finish);
                        return;
                    }
                    if (calculatedCode != SMSCode) {
                        logger.info(`OTP tokens do not match. calculated code: ${calculatedCode}, client code: ${SMSCode}`);
                        message = "OTP token does not match";
                        status = Common.STATUS_PASSWORD_NOT_MATCH;
                        callback(finish);
                        return;
                    }
                    callback(null);
                }

            });
        },
        function(callback) {
            if (!addToken) {
                callback(null);
                return;
            }
            Common.db.Activation.update({
                otp_token : SMSCode
            }, {
                where: {
                    activationkey: login.getActivationKey(),
                    maindomain: login.getMainDomain(),
                    email: login.getEmail()
                },
            }).then(function() {
                logger.info("Updated otp token to db");
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        },
        function(callback) {
            login.setValidSecondAuth(true);
            if (login.checkValidLogin()) {
                logger.info("Valid login!");
                login.setValidLogin(true);
            }
            login.save(callback);
        }
    ], function(err) {
        if (err && err !== finish) {
            logger.error("checkUserOtpCode: " + err);
            return callback(err);
        }

        callback(null, message, status);
    });
}

function checkUserOtpCodeSMS(login, SMSCode, logger, callback) {

    logger.info("checkUserOtpCode..");
    var finish = "__finish";
    var email = login.getEmail();
    var deviceID = login.getDeviceID();

    var message;
    var status;

    async.series([

        function(callback) {
            if (login.loginParams.secondauthmethod == Common.SECOND_AUTH_METHOD_OTP || login.loginParams.secondauthmethod == Common.SECOND_AUTH_METHOD_BIOMETRIC_OR_OTP) {
                callback(null);
            } else {
                let msg = "OTP authentication is not configured";
                logger.error(`checkUserOtpCode: ${msg}`);
                message = msg;
                status = Common.STATUS_ERROR;
                callback(finish);
            }
        },
        function(callback) {
            var otpTimer = 'otp_timer_' + email + "_" + deviceID;
            Common.redisClient.exists(otpTimer, function(err, isExists) {
                if (err) {
                    return callback(err);
                }

                if (!isExists) {
                    message = "enter otp password timer expired";
                    status = Common.STATUS_OTP_TIMEOUT;
                    return callback(finish);
                }

                callback(null);
            });
        },
        function(callback) {
            login.increaseOtpCounter();
            login.save(callback);
        },
        function(callback) {
            if (login.loginParams.otpNuboCode === SMSCode) {
                callback(null);
                return;
            } else {

                //login.save(callback);
                var userOtpRetries = login.getOtpCounter();
                if (userOtpRetries >= Common.otpMaxTries) {
                    message = "user exceeded number of OTP password retires";
                    status = Common.STATUS_OTP_MAX_TRIES;
                    return callback(finish);
                }
                message = `Invalid OTP Code`;
                status = Common.STATUS_PASSWORD_NOT_MATCH;
                callback(finish);
            }
        },
        function(callback) {
            login.setValidSecondAuth(true);
            if (login.checkValidLogin()) {
                logger.info("Valid login!");
                login.setValidLogin(true);
            }
            login.save(callback);
        }
    ], function(err) {
        if (err && err !== finish) {
            logger.error("checkUserOtpCode: " + err);
            return callback(err);
        }

        callback(null, message, status);
    });

}


module.exports = {
    sendUserOtpCode: sendUserOtpCode,
    checkUserOtpCode: checkUserOtpCode
}