"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var crypto = require('crypto');
var util = require('util');
var Login = require('./login.js');
var smsNotification = require('./SmsNotification.js');
var User = require('./user.js');
var Notifications = require('./Notifications.js');
let locale = require('./locale.js').locale;
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const _ = require('underscore');
const commonUtils = require('./commonUtils.js');
var eventLog = require('./eventLog.js');
var EV_CONST = eventLog.EV_CONST;

var isFirstTime = "";

function returnInternalError(err, res) {
    var statusInternal = Common.STATUS_ERROR;
    // internal error
    var msgInternal = "Internal error";
    console.error(err.name, err.message);
    logger.error("resetPasscode internal error: "+err,err);
    if (res != undefined) {
        res.send({
            status : statusInternal,
            message : msgInternal,
            isFirstTime : isFirstTime
        });
    }
    return;
}

function resetPasscode(req, res, loginObj) {
    // https://oritest.nubosoftware.com/resetPasscode?loginToken=[loginToken]
    res.contentType = 'json';
    var msg = "";
    var status = 100
    //unknown
    var statusEmail = 100;
    isFirstTime = "";

    let action = req.params.action;

    if (action != Common.ACTION_RESET_PASSCODE && action != Common.ACTION_CANCEL_RESET_PASSCODE && action != Common.ACTION_WIPE_RESET_PASSCODE
        && action != Common.ACTION_RESET_BIOMETRIC && action != Common.ACTION_RESET_OTP) {
        action = Common.ACTION_RESET_PASSCODE;
    }


    if (action == Common.ACTION_RESET_PASSCODE || action == Common.ACTION_WIPE_RESET_PASSCODE || action == Common.ACTION_RESET_BIOMETRIC || action == Common.ACTION_RESET_OTP) {

        //read and validate params
        var loginToken = req.params.loginToken;

        (function (loginToken) {
            new Login(loginToken, function (err, login) {
                if (err) {
                    logger.error("resetPasscode: " + err)
                    res.send({
                        status: Common.STATUS_ERROR,
                        message: 'internal error'
                    });
                    return;
                }

                if (!login) {
                    logger.error("resetPasscode: shouldn't get this error!!!")
                    res.send({
                        status: Common.STATUS_EXPIRED_LOGIN_TOKEN,
                        message: "Invalid loginToken",
                        loginToken: 'notValid'
                    });
                    return;
                }
                if (login.getPasscodeActivationRequired() != "false" || login.getAuthenticationRequired() != "false") {
                    status = Common.STATUS_ERROR;
                    // invalid parameter
                    msg = "Pascode reset not allowed";
                    res.send({
                        status: status,
                        message: msg
                    });
                    return;
                }
                Common.db.Activation.findAll({
                    attributes: ['status', 'deviceid', 'email', 'firstname', 'lastname', 'emailtoken', 'devicetype'],
                    where: {
                        activationkey: login.getActivationKey()
                    },
                }).complete(function (err, results) {

                    if (!!err) {
                        returnInternalError(err);
                        return;
                    }

                    if (!results || results == "") {
                        returnInternalError("activationKey not found!");
                        return;
                    }

                    var deviceid = results[0].deviceid;
                    var email = results[0].email != null ? results[0].email : '';
                    var firstName = results[0].firstname != null ? results[0].firstname : '';
                    var lastName = results[0].lastname != null ? results[0].lastname : '';
                    //var emailToken = results[0].emailtoken != null ? results[0].emailtoken : '';
                    var devicetype = results[0].devicetype != null ? results[0].devicetype : '';
                    var emailDomain = '';
                    var deviceapprovaltype = 0;

                    User.getUserObj(email, function (userObj) {
                        if (userObj.orgdomain) {
                            emailDomain = userObj.orgdomain;
                        } else {
                            emailDomain = email.substr(email.indexOf('@') + 1);
                        }

                        var deviceText = "";
                        if (devicetype == "Web" || devicetype == "Desktop") {
                            deviceText = ".";
                        } else {
                            deviceText = " from your mobile device:";
                        }
                        logger.info("resetPasscode. deviceType: " + devicetype);

                        (function (email, firstName, lastName) {
                            var expirationDate = new Date();
                            let rbuf = Common.crypto.randomBytes(48);
                            let emailToken = rbuf.toString('hex');
                            let activationStatus;
                            if (action == Common.ACTION_RESET_BIOMETRIC) {
                                activationStatus = Common.STATUS_RESET_BIOMETRIC_PENDING;
                            } else if (action == Common.ACTION_RESET_OTP){
                                activationStatus = Common.STATUS_RESET_OTP_PENDING;
                            } else {
                                activationStatus = Common.STATUS_RESET_PASSCODE_PENDING;
                            }
                            expirationDate.setHours(expirationDate.getHours() + Common.activationTimeoutPeriod);
                            Common.db.Activation.update({
                                status: activationStatus,
                                emailtoken: emailToken,
                                resetpasscode: 0,
                                expirationdate: expirationDate,
                                resetpasscode_wipe: (action == Common.ACTION_WIPE_RESET_PASSCODE ? 1 : 0)
                            }, {
                                    where: {
                                        activationkey: login.getActivationKey()
                                    }
                                }).then(function () {


                                    Common.db.Orgs.findAll({
                                        attributes: ['notifieradmin', 'deviceapprovaltype'],
                                        where: {
                                            maindomain: emailDomain
                                        },
                                    }).complete(function (err, results) {

                                        if (!!err || !results || results == "") { // error on fetching org
                                            logger.error('Error on get orgs details for ' + emailDomain + ', error: ' + err);
                                            returnInternalError(new Error('Error on get orgs details'),res);
                                        } else { // get org details and act accordingly
                                            var row = results[0];
                                            var notifieradmin = row.notifieradmin != null ? row.notifieradmin : '';
                                            deviceapprovaltype = row.deviceapprovaltype != null ? row.deviceapprovaltype : 0;
                                            status = Common.STATUS_OK;
                                            var msg = "Reset passcode sent";
                                            res.send({
                                                status: status,
                                                message: msg,
                                                deviceapprovaltype: deviceapprovaltype
                                            });

                                            // Log password reset event
                                            var resetInfo = `Password reset initiated for device: ${deviceid}, device type: ${devicetype}, approval type: ${deviceapprovaltype}`;
                                            eventLog.createEvent(EV_CONST.EV_RESET_PASSCODE, email, emailDomain, resetInfo, EV_CONST.INFO);

                                            var senderEmail = Common.emailSender.senderEmail;
                                            var senderName = Common.emailSender.senderName;

                                            // define to recepient and subject based on device approval type
                                            var toEmail = '';
                                            var emailSubject = '';
                                            var toName = '';
                                            let userEmail;
                                            let notifyAdminsByNotification = false;
                                            if (userObj.orgemail && userObj.orgemail.length > 2) {
                                                userEmail = userObj.orgemail;
                                            } else {
                                                userEmail = email;
                                            }
                                            let templateSettings;
                                            if (Common.isDesktop()) {
                                                const Bowser = require("bowser");
                                                const browser = Bowser.getParser(req.headers['user-agent']).getBrowser();
                                                templateSettings = {
                                                    first: firstName,
                                                    last: lastName,
                                                    email,
                                                    browser: `${browser.name} ${browser.version}`,
                                                    ip: req.headers['x-client-ip']
                                                }
                                            }
                                            if (deviceapprovaltype == 0) { // default behavior, user approve himself
                                                toEmail = userEmail;
                                                toName = firstName + " " + lastName;
                                                if (Common.isDesktop()) {
                                                    emailSubject = locale.getValue("desktopResetPasscodeEmailSubject")
                                                } else {
                                                    emailSubject = locale.getValue("resetPasscodeEmailSubject");
                                                }


                                            } else if (deviceapprovaltype == 1) { // manually only by admin
                                                if (notifieradmin == "PUSH@nubo.local") {
                                                    notifyAdminsByNotification = true;
                                                    toEmail = "";
                                                } else {
                                                    toEmail = notifieradmin;
                                                }
                                                toName = notifieradmin;
                                                if (Common.isDesktop()) {
                                                    emailSubject =  _.template(locale.getValue("desktopResetPasscodeEmailSubjectToAdmin", Common.defaultLocale))(templateSettings);
                                                } else {
                                                    emailSubject = locale.format("resetPasscodeEmailSubjectToAdmin",firstName,lastName);
                                                }
                                            } else if (deviceapprovaltype == 2) { // both for admin and user
                                                if (notifieradmin == "PUSH@nubo.local") {
                                                    notifyAdminsByNotification = true;
                                                    toEmail = userEmail;
                                                } else {
                                                    toEmail = [notifieradmin, userEmail];
                                                }
                                                toName = '';
                                                if (Common.isDesktop()) {
                                                    emailSubject =  _.template(locale.getValue("desktopResetPasscodeEmailSubjectToAdmin", Common.defaultLocale))(templateSettings);
                                                } else {
                                                    emailSubject = locale.format("resetPasscodeEmailSubjectToAdmin",firstName,lastName);
                                                }
                                            } else if (deviceapprovaltype == 3) { // send SMS
                                                toEmail = null;
                                            }

                                            if (notifyAdminsByNotification == true) { // notify nubo admins by push notifications
                                                let pushTitle = locale.getValue("resetPasscodeNotifTitle");
                                                let pushText = locale.format('resetPasscodeNotifText',firstName,lastName,email );
                                                Notifications.sendNotificationToAdmins(emailDomain,pushTitle,pushText);
                                            }

                                            // build reset password URL
                                            // var resetURL = Common.dcURL + "html/player/login.html#resetPasscodeLink/" +
                                            //                      encodeURIComponent(emailToken) + "/" + encodeURIComponent(email);
                                            var resetURL = Common.dcURL + "resetPasscodeLink?token=" + encodeURIComponent(emailToken) +
                                                "&email=" + encodeURIComponent(email);
                                            logger.info("Reset password Link: " + resetURL);

                                            if (toEmail != null && toEmail.length > 0) {

                                                var mailOptions = {
                                                    from: senderEmail, // sender address
                                                    fromname: senderName,
                                                    to: toEmail,
                                                    toname: toName,
                                                    subject: emailSubject,
                                                };

                                                if (Common.isDesktop()) {
                                                    templateSettings.link = resetURL;
                                                    mailOptions.text = _.template(locale.getValue("desktopResetPasscodeEmailBody", Common.defaultLocale))(templateSettings);
                                                    mailOptions.html = _.template(locale.getValue("desktopResetPasscodeEmailBodyHTML", Common.defaultLocale))(templateSettings);
                                                } else {
                                                    mailOptions.text = locale.format("resetPasscodeEmailBody",firstName,lastName,deviceText,resetURL);
                                                    mailOptions.html = locale.format("resetPasscodeEmailBodyHTML",firstName,lastName,deviceText,resetURL,firstName,lastName)
                                                }

                                                // send mail with defined transport object
                                                logger.info("sent " + email + " reset password email");
                                                Common.mailer.send(mailOptions, function (success, message) {
                                                    if (!success) {
                                                        logger.info("sendgrid error: " + message);
                                                    } else {

                                                    }
                                                });
                                            }

                                            // send SMS
                                            if (Common.activateBySMS && (deviceapprovaltype == 0 || deviceapprovaltype == 2)) {
                                                Common.db.User.findAll({
                                                    attributes: ['mobilephone'],
                                                    where: {
                                                        email: email,
                                                    },
                                                }).complete(function (err, results) {
                                                    if (!!err) {
                                                        status = Common.STATUS_ERROR;
                                                        msg = "Internal Error: " + err;
                                                        logger.info("reset passcode find user by email error: " + msg);
                                                    } else if (!results || results == "") {
                                                        status = Common.STATUS_ERROR;
                                                        msg = "Cannot find user " + login.getUserName();
                                                        logger.info("reset passcode find user by email error, " + msg);
                                                    } else {
                                                        var mobilePhone = results[0].mobilephone != null ? results[0].mobilephone : '';

                                                        // some validation on mobile phone even they are coming from the data base
                                                        if (mobilePhone != null && mobilePhone.length > 0 && mobilePhone.length < 20) {
                                                            smsNotification.sendSmsNotificationInternal(mobilePhone, 'Click your Nubo reset password link ' + resetURL, null, function (message, status) {
                                                                logger.info(message);
                                                            });
                                                        }
                                                    }
                                                });
                                            }
                                            if (deviceapprovaltype == 3) { // send SMS code to device phone
                                                Common.db.UserDevices.findAll({
                                                    attributes: ['reg_phone_number'],
                                                    where: {
                                                        email: email,
                                                        imei: deviceid
                                                    },
                                                }).complete(function (err, results) {
                                                    if (!!err) {
                                                        logger.info("UserDevices.findAll error:", err);
                                                        return;
                                                    }
                                                    if (!results || results == "") {
                                                        logger.info("UserDevices.findAll not found for email: "+email+", deviceid: "+deviceid);
                                                        return;
                                                    }
                                                    let phoneNumber = userObj.mobilephone;
                                                    if (!phoneNumber || phoneNumber.length < 4) {
                                                        phoneNumber = results[0].reg_phone_number;
                                                    }
                                                    if (phoneNumber) {
                                                        let smscode =commonUtils.generateRandomSMSCode();
                                                        var expirationDate = new Date();
                                                        expirationDate.setHours(expirationDate.getHours() + Common.activationTimeoutPeriod);
                                                        Common.db.Activation.update({
                                                            emailtoken: smscode,
                                                            expirationdate: expirationDate,
                                                            deviceapprovaltype: deviceapprovaltype,
                                                        }, {
                                                            where: {
                                                                activationkey: login.getActivationKey()
                                                            }
                                                        }).then(function () {
                                                            logger.info("Sending reset password code to " + phoneNumber + ". Code: " + smscode);
                                                            smsNotification.sendSmsNotificationInternal(phoneNumber,
                                                                locale.format("resetPasscodeSmsMessage",smscode),
                                                                null, function (message, status) {
                                                                logger.info(message);
                                                            });
                                                        }).catch(function (err) {
                                                                logger.error("Error updating nubo code for SMS", err);
                                                                return;
                                                        });

                                                    } else {
                                                        logger.info("Cannot find a valid reg_phone_number for user");
                                                    }
                                                });
                                            }
                                        }
                                    });
                                }).catch(function (err) {
                                    status = Common.STATUS_ERROR
                                    msg = "Internal Error: " + err;
                                    res.send({
                                        status: status,
                                        message: msg
                                    });
                                    return;
                                });

                        })(email, firstName, lastName);
                    });

                });


            }); // Login
        })(loginToken);
    } else {
        let activationKey = req.params.activationKey;

        if (!activationKey || activationKey.length < 10) {
            returnInternalError("activationKey not found!",res);
            return;
        }
        // turn off the resetpasscode status
        //logger.info(`activationKey: ${activationKey}`);
        Common.db.Activation.findAll({
            attributes: ['status', 'resetpasscode'],
            where: {
                activationkey: activationKey
            },
        }).complete(function (err, results) {

            logger.info("Cancel reset. results: "+results+", err: "+err);
            if (!!err) {
                console.error(err);
                returnInternalError(err,res);
                return;
            }

            if (!results || results == "") {
                returnInternalError("activationKey not found!",res);
                return;
            }

            var status = results[0].status != null ? Number(results[0].status) : 0;
            //logger.info(`status: ${status}`);
            if (status != Common.STATUS_RESET_PASSCODE_PENDING && status != Common.STATUS_RESET_BIOMETRIC_PENDING && status != Common.STATUS_RESET_OTP_PENDING) {
                returnInternalError("Device is not in reset passcode mode",res);
                return;
            }

            Common.db.Activation.update({
                status: Common.STATUS_OK,
                emailtoken: "",
                resetpasscode: 0
            }, {
                    where: {
                        activationkey: activationKey
                    }
                }).then(function () {
                    status = Common.STATUS_OK
                    msg = "Reset passcode mode canceled";
                    res.send({
                        status: status,
                        message: msg
                    });
                    logger.info("Reset passcode ")
                    return;
                }).catch(function (err) {
                    status = Common.STATUS_ERROR
                    msg = "Internal Error: " + err;
                    res.send({
                        status: status,
                        message: msg
                    });
                    return;
                });

        });
    }
}


module.exports = {
    func : resetPasscode
};
