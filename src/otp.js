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





function checkOtpAuth(req, res, next) {

    var finish = "__finish";
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    var loginToken = req.params.loginToken;
    var OTPCode = req.params.OTPCode;
    var ip = req.connection.remoteAddress;

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
            let otpProvider = getOTPProvider();
            let func = otpProvider.checkUserOtpCode;
            func(login, OTPCode, logger, function(err, message, status) {
                if (err) {
                    return callback(err);
                }

                if (message) {
                    response.message = message;
                    response.status = status;
                    return callback(finish);
                }

                response.status = Common.STATUS_OK;
                response.message = 'OTP password ok';
                return callback(null);
            },Common);
        }
    ], function(err) {
        if (err && err !== finish) {
            sendTrack(login, ip, response.message, response.status);
            logger.error("checkOtpAuth: " + err);
            res.send(response);
            return;
        }

        if (response.status != Common.STATUS_OK) {
            logger.warn("checkOtpAuth: " + response.message);
        }

        res.send(response);        
    });
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
