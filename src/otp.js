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
const otpNubo = require('./otpNubo');
const LoginAttempts = require('./loginAttempts.js');
const checkPasscode = require('./checkPasscode.js');





async function checkOtpAuth(req, res) {
    const logger = new ThreadedLogger(Common.getLogger(__filename));
    const loginToken = req.params.loginToken;
    const OTPCode = req.params.OTPCode;
    const ip = req.connection.remoteAddress;

    const response = {
        status: Common.STATUS_ERROR,
        message: 'Internal error'
    };

    try {
        // Get login object
        const login = await new Promise((resolve, reject) => {
            new Login(loginToken, (err, loginObj) => {
                if (err) reject(err);
                if (!loginObj) {
                    response.status = Common.STATUS_EXPIRED_LOGIN_TOKEN;
                    response.message = "Invalid loginToken";
                    reject("Invalid login token");
                }
                resolve(loginObj);
            });
        });

        logger.user(login.getEmail());
        logger.device(login.getDeviceID());

        let isValidOtp = true;
        // Check OTP code
        const otpProvider = getOTPProvider();
        await new Promise((resolve, reject) => {
            otpProvider.checkUserOtpCode(login, OTPCode, logger, (err, message, status) => {
                if (err) reject(err);
                if (message) {
                    response.message = message;
                    response.status = status;
                    isValidOtp = false;
                    resolve();
                } else {
                    response.status = Common.STATUS_OK;
                    response.message = 'OTP password ok';
                    resolve();
                }
            }, Common);
        });

        // Handle login attempts
        if (Common.otpLockDevice === true) {
            if (!isValidOtp) {
                // Increment attempts on failure
                const result = await LoginAttempts.checkAndUpdateAttempts(
                    login.getEmail(), 
                    login.getDeviceID(), 
                    login.getMainDomain(), 
                    null, 
                    false
                );
                if (result.exceeded) {
                    response.status = Common.STATUS_PASSWORD_LOCK;
                    response.message = "You have incorrectly typed your OTP code too many times. Please contact your administrator.";
                    const deviceapprovaltype = await checkPasscode.findUserSendLockNotification(login.getEmail(), login.getDeviceID(), login.getActivationKey(), req);
                    response.deviceapprovaltype = deviceapprovaltype;
                    // Delete login token
                    await new Promise((resolve) => {
                        Common.redisClient.del('login_' + loginToken, () => resolve());
                    });
                }
            } else {
                // Reset attempts on success
                await LoginAttempts.checkAndUpdateAttempts(
                    login.getEmail(), 
                    login.getDeviceID(), 
                    login.getMainDomain(), 
                    null, 
                    true
                );
            }
        }

        // Log result and send response
        if (response.status != Common.STATUS_OK) {
            logger.info("checkOtpAuth: " + response.message, {mtype: "important"});
        } else {
            logger.info("checkOtpAuth: OTP code is valid.", {mtype: "important"});
        }
        res.send(response);

    } catch (err) {
        logger.error("checkOtpAuth: " + err, {mtype: "important"});
        res.send(response);
    }
}



function getOtpConf(logger, callback) {
    const otpProvider = getOTPProvider();
    if (otpProvider && otpProvider.getOtpConf) {
        otpProvider.getOtpConf(logger,callback);
    } else {
        //logger.error("getOtpConf is not supported!");
        callback("getOtpConf is not supported!");
    }
}


function getOTPProvider() {
    let otpProvider;
    if (Common.otpProvider) {
        let scriptFile;
        if (Common.otpProvider.startsWith('/')) {
            scriptFile = Common.otpProvider;
        } else {
            scriptFile = Common.path.join(Common.rootDir,Common.otpProvider);
        }
        otpProvider = require(scriptFile);
    } else {
        otpProvider = otpNubo;
    }
    if (Common.isEnterpriseEdition()) {
        let entOtp = Common.getEnterprise().passwordUtils.getOTPProvider();
        if (entOtp) {
            otpProvider = entOtp;
        }
    }
    return otpProvider;
}
function resendOtpCode(req, res, callback) {

    var logger = new ThreadedLogger(Common.getLogger(__filename));
    var loginToken = req.params.loginToken;

    var response = {
        status: Common.STATUS_ERROR,
        message: 'Internal error'
    };

    var login;

    async.series([
        function(callback) {
            new Login(loginToken, function(err, loginObj) {
                if (err) {
                    return callback(err);
                }

                if (!loginObj) {
                    response.status = Common.STATUS_EXPIRED_LOGIN_TOKEN;
                    response.message = "Invalid loginToken";
                    return callback("shouldn't get this error!!!");
                }

                login = loginObj;
                logger.user(login.getEmail());
                callback(null);
            });
        },
        function(callback) {
            login.setOtpCounter();
            login.save(callback);
        },
        function(callback) {
            let otpProvider = getOTPProvider();
            let func = otpProvider.sendUserOtpCode;
            func(login, logger, function(err,newStatus) {
                if (newStatus) {
                    response.status = newStatus;
                }
                callback(err);
            });
        }
    ], function(err) {
        if (err) {
            logger.error("resendOtpCode: " + err);
            res.send(response);
            return;
        }

        response.status = Common.STATUS_OK;
        response.message = 'OTP code sent';
        res.send(response);
    });
}


module.exports = {
    checkOtpAuth: checkOtpAuth,
    getOtpConf: getOtpConf,
    resendOtpCode: resendOtpCode,
    getOTPProvider
}
