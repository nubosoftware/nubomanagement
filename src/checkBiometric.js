"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var Login = require('./login.js');
var async = require('async');


function checkBiometric(req, res) {
    // https://oritest.nubosoftware.com/checkBiometric?loginToken=[]&token=[]
    const finish = "__finish";

    res.contentType = 'json';
    var status = Common.STATUS_ERROR;
    var message = 'Internal error';

    var loginToken = req.params.loginToken;
    var token = req.params.token;
    var clientIP = req.header('x-client-ip');

    var login;


    async.series([
        function(callback) {
            new Login(loginToken, function(err, loginObj) {
                if (err) {
                    return callback(err);
                }

                if (!loginObj) {
                    status = Common.STATUS_EXPIRED_LOGIN_TOKEN;
                    message = "Invalid loginToken";
                    loginToken = 'notValid';

                    return callback(message);
                }

                login = loginObj;
                // check if biometric login is valid
                if (login.getSecondAuthMethod() == Common.SECOND_AUTH_METHOD_BIOMETRIC || login.getSecondAuthMethod() == Common.SECOND_AUTH_METHOD_BIOMETRIC_OR_OTP) {
                    callback(null);
                } else {
                    message = "Biometric login when biometric is not approved method!";
                    logger.info(message+", getSecondAuthMethod: "+login.getSecondAuthMethod());
                    status = Common.STATUS_ERROR;
                    callback(message);
                }
            });
        },
        function(callback) {
            Common.db.Activation.findAll({
                attributes: ['biometric_token'],
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
                    return callback(message);
                }

                if (results[0].biometric_token == "") {
                    logger.info(`Adding new biometric token ${token}`);
                } else if (token != results[0].biometric_token) {
                    logger.info(`Biometric tokens do not match. db: ${results[0].biometric_token}, new token: ${token}`);
                    message = "Biometric token does not match";
                    status = Common.STATUS_PASSWORD_NOT_MATCH;
                    callback(message);
                    return;
                } else {
                    logger.info(`Tokens do match: ${token}`);
                }
                callback(null);
            });
        },
        function(callback) {
            Common.db.Activation.update({
                biometric_token : token
            }, {
                where: {
                    activationkey: login.getActivationKey(),
                    maindomain: login.getMainDomain(),
                    email: login.getEmail()
                },
            }).then(function() {
                logger.info("Updated biometeric token to db");
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        },

        function(callback) {

            status = Common.STATUS_OK;
            message = "Biometric checked";
            login.setValidSecondAuth(true);
            if (login.checkValidLogin()) {
                logger.info("Valid login!");
                login.setValidLogin(true);
            }
            login.save(callback);
        }
    ], function(err) {
        if (err) {
            if (err === finish) {
                logger.warn("checkBiometric: " + message);
            } else {
                logger.error("checkBiometric: " + err);
            }
        }

        var response = {
            status: status,
            message: message
        };


        console.log("\n\ncheckBiometric: ", response)
        res.send(response);
    });

}



module.exports = {
    checkBiometric
};