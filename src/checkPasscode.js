"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var crypto = require('crypto');
var util = require('util');
var Login = require('./login.js');
var async = require('async');
var ThreadedLogger = require('./ThreadedLogger.js');
var smsNotification = require('./SmsNotification.js');
var Otp = require('./otp.js');
var CommonUtils = require("./commonUtils.js");
var setPasscode = require('./setPasscode.js');
var UserUtils = require('./userUtils.js');
var Notifications = require('./Notifications.js');
let locale = require('./locale.js').locale;
const _ = require('underscore');

var MIN_DIFFERENT_DIGITS = 4;
// user is allowed 3 login attempts. then he will be locked.
var MAX_LOGIN_ATTEMPTS = 3;

function checkPasscode(req, res, next) {
    // https://oritest.nubosoftware.com/checkPasscode?loginToken=[]&passcode=[]
    const finish = "__finish";

    var logger = new ThreadedLogger(Common.getLogger(__filename));
    res.contentType = 'json';
    var status = Common.STATUS_ERROR;
    var message = 'Internal error';

    var loginToken = req.params.loginToken;
    var passcode = req.params.passcode;
    var clientIP = req.header('x-client-ip');

    var login;
    var dbPasscode;
    var passcodeSalt;
    var hashedPasscode;
    var loginattempts;
    var isUserActive;
    var isDeviceActive;
    var decryptedPassword;
    var passcodetypechange;
    var passcodeTypePrev;
    var userTrId;
    var additionalEnterpriseMethodRequired = false;
    var webClient;

    var sendAdminParams = false;
    var adminName = "";
    var adminEmail = "";
    let alreadyCheckedPasscode = false;
    let isValidPasscode = false;

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

                    return callback("shouldn't get this error!!!");
                }

                if (loginObj.getPasscodeActivationRequired() != "false" || loginObj.getAuthenticationRequired() != "false") {
                    status = Common.STATUS_ERROR;
                    message = "Pascode enter not allowed";

                    return callback("Pascode enter not allowed");
                }

                login = loginObj;
                logger.user(login.getEmail());
                webClient = login.getDeviceID().includes("web");
                callback(null);
            });
        },
        function(callback) {
            if (Common.restrictWebClientAccess && webClient) {
                if (CommonUtils.webclientAllowedToaccess(clientIP)) {
                    return callback(null);
                } else {
                    return callback("web client accesses from unallowed network, shouldn't get here!!!!!!!!");
                }
            }

            callback(null);
        },
        function(callback) {
            Common.db.User.findAll({
                attributes: ['isactive', 'passcode', 'passcodetypechange', 'passcodetypeprev','passcodesalt'],
                where: {
                    orgdomain: login.getMainDomain(),
                    email: login.getEmail()
                },
            }).complete(function(err, results) {
                if (!!err) {
                    return callback(err);
                }

                if (!results || results == "") {
                    status = Common.STATUS_ERROR;
                    message = "Cannot find user or user is inactive";
                    return callback("Cannot find user or user is inactive");
                }

                dbPasscode = results[0].passcode;
                passcodeSalt = results[0].passcodesalt;
                isUserActive = results[0].isactive != null ? results[0].isactive : 0;
                passcodetypechange = results[0].passcodetypechange != null ? results[0].passcodetypechange : 0;
                passcodeTypePrev = results[0].passcodetypeprev != null ? results[0].passcodetypeprev : 0;
                callback(null);
            });
        },
        function(callback) {
            if (webClient || !Common.virtualKeyboardEnabled || !Common.isEnterpriseEdition()) {
                decryptedPassword = passcode;
                return callback(null);
            }

            if (passcodetypechange === 1 && passcodeTypePrev === 0) {
                logger.warn("checkPasscode: user in process change from passcode to password (no virtual keyboard)");
                decryptedPassword = passcode;
                return callback(null);

            }
            
            Common.getEnterprise().passwordUtils.virtaulKeyboardDecrypt(login,passcode,false,null,null,function(err,plain) {
                decryptedPassword = plain;
                callback(err);
            });

        },
        function(callback) {
            Common.db.UserDevices.findAll({
                attributes: ['active', 'loginattempts'],
                where: {
                    email: login.getEmail(),
                    imei: login.getDeviceID(),
                    maindomain: login.getMainDomain()
                },
            }).complete(function(err, results) {
                if (!!err) {
                    return callback(err);
                }

                if (!results || results == "") {
                    status = Common.STATUS_ERROR;
                    message = `Cannot find device ${login.getDeviceID()}, email: ${login.getEmail()}, maindomain: ${login.getMainDomain()}`;
                    return callback(message);
                }

                isDeviceActive = results[0].active != null ? results[0].active : 0;
                 // when user is first created, he gets loginattempts = 0.
                // there is no possibility that user has loginattempts = null.
                // this can only be due to reasons such as alter table from old db
                loginattempts = results[0].loginattempts != null ? results[0].loginattempts : 0;
                callback(null);
            });
        },
        function(callback) {
            if (isUsersDeviceActive(isUserActive, isDeviceActive)) {
                return callback(null);
            }

            Common.db.User.findAll({
                attributes: ['email', 'firstname', 'lastname'],
                where: {
                    orgdomain: login.getMainDomain(),
                    isadmin: '1'
                },
            }).complete(function(err, results) {
                if (!!err) {
                    return callback(err);
                }

                if (results && results.length > 0) {
                    var row = results[0];
                    adminName = row.firstname + " " + row.lastname;
                    adminEmail = row.email;
                    sendAdminParams = true;
                }

                if (isUserActive == 0) {
                    status = Common.STATUS_DISABLE_USER;
                    message = "User is inactive " + login.getUserName();
                    logger.info("checkPasscode: " + message);
                } else {
                    //inactive device
                    status = Common.STATUS_DISABLE_USER_DEVICE;
                    message = "Device is inactive " + login.getDeviceID();
                    logger.info("checkPasscode: " + message);
                }

                // remove login token from redis
                Common.redisClient.del('login_' + loginToken, function(err) {
                    if (err) {
                        return callback(err);
                    }

                    callback(finish);
                });
            });
        },
        function(callback) {
            if (Common.isEnterpriseEdition()) {
                // let enterprise edition check password
                let entParams = {
                    alreadyCheckedPasscode,
                    isValidPasscode
                }
                Common.getEnterprise().settings.checkPasswordEnterprise(login,entParams,function(err){
                    if (!err) {
                        // update params from enterprise edition changes
                        alreadyCheckedPasscode = entParams.alreadyCheckedPasscode;
                        isValidPasscode = entParams.isValidPasscode;
                    }
                    callback();
                });
            } else {
                callback();
            }
        },
        function(callback) {
            if (!isUsersDeviceActive(isUserActive, isDeviceActive)) {
                return callback("should be active at this stage");
            }

            hashedPasscode = setPasscode.hashPassword(decryptedPassword,passcodeSalt);


            if (!alreadyCheckedPasscode) {
                if (dbPasscode === hashedPasscode) {
                    isValidPasscode = true;
                }
            }
            if (isValidPasscode) {
                login.setValidPassword(true);
                login.save(callback);
                return;
            }

            Common.db.UserDevices.update({
                loginattempts: (loginattempts + 1)
            }, {
                where: {
                    email: login.getEmail(),
                    imei: login.getDeviceID(),
                    maindomain: login.getMainDomain()
                }
            }).then(function() {
                logger.info("checkPasscode: checking login attempts for user device");

                let maxLoginAttempts = MAX_LOGIN_ATTEMPTS;
                if(Common.hasOwnProperty("maxLoginAttempts")){
                    maxLoginAttempts = Common.maxLoginAttempts;
                }
                if (!Common.withService && maxLoginAttempts > 0 && loginattempts + 1 >= maxLoginAttempts) {
                    logger.error("checkPasscode: login attempts failed");
                    status = Common.STATUS_PASSWORD_LOCK;
                    message = "You have incorrectly typed your passcode 3 times. An email was sent to you. Open your email to open your passcode.";

                    findUserNameSendEmail(login.getEmail(), login.getDeviceID(),req);

                    Common.redisClient.del('login_' + loginToken, function(err) {
                        if (err) {
                            return callback(err);
                        }

                        return callback(finish);
                    });

                } else {
                    status = Common.STATUS_ERROR;
                    message = "Invalid passcode";
                    return callback(finish);
                }

            }).catch(function(err) {
                return callback(err);
            });
        },
        function(callback) {
            if (!isValidPasscode) {
                return callback('passwords should be equal at this stage');
            }

            if (loginattempts == 0) {
                return callback(null);
            }

            Common.db.UserDevices.update({
                loginattempts: '0'
            }, {
                where: {
                    email: login.getEmail(),
                    imei: login.getDeviceID(),
                    maindomain: login.getMainDomain()
                }
            }).then(function() {
                callback(null);
            }).catch(function(err) {
                return callback(err);
            });
        },
        function(callback) {

            var l = login.loginParams;
            var passcodeexpirationdate;
            if (l.passcodeexpirationdays > 0 || passcodetypechange == 1) {
                var passcodeupdate = new Date(l.passcodeupdate);
                var now = new Date();
                passcodeexpirationdate = new Date(passcodeupdate.getTime() + l.passcodeexpirationdays * 24 * 60 * 60 * 1000);
                if (now > passcodeexpirationdate) {
                    status = Common.STATUS_EXPIRED_PASSCODE;
                    message = "Passcode is valid, but expired";
                    return callback(finish);
                }

                return callback(null);
            }

            return callback(null);
        },
        function(callback) {
            if (Common.isEnterpriseEdition()) {
                let response = {
                    status,
                    message,
                    trId: null,
                    additionalEnterpriseMethodRequired
                }
                Common.getEnterprise().passwordUtils.afterPasscode(false,login,webClient,response,function(err){
                    //logger.info(`afterPasscode. response" ${JSON.stringify(response,null,2)}`);
                    status = response.status;
                    message = response.message;
                    userTrId = response.trId;
                    additionalEnterpriseMethodRequired = response.additionalEnterpriseMethodRequired;
                    callback(err);
                });
            } else {
                callback(null);
            }
        },
        function(callback) {
            if (!additionalEnterpriseMethodRequired) {
                status = Common.STATUS_OK;
                message = "Passcode checked";
                login.setValidLogin(true);
            }

            login.save(callback);
        }
    ], function(err) {
        if (err) {
            if (err === finish) {
                logger.warn("checkPasscode: " + message);
            } else {
                logger.error("checkPasscode: " + err);
                if (login) {
                    login.delete(function() {});
                }
            }
        }

        var response = {
            status: status,
            message: message
        };

        if (userTrId) {
            response.trId = userTrId;
        }

        if (sendAdminParams) {
            response.adminName = adminName;
            results.adminEmail = adminEmail;
        }

       
        console.log("\n\ncheckPasscode: ", response)
        res.send(response);
    });

}

function isUsersDeviceActive(isUserActive, isDeviceActive) {
    if (isUserActive == 0 || isDeviceActive == 0) {
        return false;
    } else {
        return true;
    }
}



function findUserNameSendEmail(userEmail, deviceID,req) {

    var status;
    var msg;

    Common.db.User.findAll({
        attributes: ['firstname', 'lastname', 'mobilephone', 'orgdomain','orgemail'],
        where: {
            email: userEmail,
        },
    }).complete(function(err, results) {

        if (!!err) {
            status = Common.STATUS_ERROR;
            msg = "Internal Error: " + err;
            logger.info("findUserNameSendEmail:" + msg);
            return;
        }

        if (!results || results == "") {
            status = Common.STATUS_ERROR;
            msg = "Cannot find user " + userEmail;
            logger.info("findUserNameSendEmail:" + msg);
            return;
        }

        var firstname = results[0].firstname != null ? results[0].firstname : '';
        var lastname = results[0].lastname != null ? results[0].lastname : '';
        var mobilePhone = results[0].mobilephone != null ? results[0].mobilephone : '';
        var mainDomain = results[0].orgdomain != null ? results[0].orgdomain : '';
        var orgemail = results[0].orgemail != null ? results[0].orgemail : '';

        Common.crypto.randomBytes(48, function(ex, buf) {
            Common.crypto.randomBytes(48, function(ex, buf) {
                var loginEmailToken = buf.toString('hex');
                //update loginemailtoken and send unlock email to user

                Common.db.User.update({
                    loginemailtoken: loginEmailToken
                }, {
                    where: {
                        email: userEmail
                    }
                }).then(function() {
                    sendNotification(userEmail, firstname, lastname, loginEmailToken, mobilePhone, mainDomain, deviceID,orgemail,req);
                }).catch(function(err) {
                    status = Common.STATUS_ERROR;
                    msg = "Internal Error: " + err;
                    logger.info("findUserNameSendEmail:update loginemailtoken" + msg);
                    return;
                });

            });
        });
    });
}

function sendNotification(email, first, last, loginEmailToken, mobilePhone, mainDomain, deviceID,orgemail,req) {
    Common.db.Orgs.findAll({
        attributes: ['notifieradmin', 'deviceapprovaltype'],
        where: {
            maindomain: mainDomain
        },
    }).complete(function(err, results) {

        if (!!err) { // error on fetching org
            logger.error('Error on get orgs details for ' + mainDomain + ', error: ' + err);
        } else if (!results || results == "") { // no org in DB
            logger.error('Cannot find org + ' + mainDomain);
        } else { // get org details and act accordingly
            var row = results[0];
            var notifieradmin = row.notifieradmin != null ? row.notifieradmin : '';
            var deviceapprovaltype = row.deviceapprovaltype != null ? row.deviceapprovaltype : 0;

            var senderEmail = Common.emailSender.senderEmail;
            var senderName = Common.emailSender.senderName;

            // define to recepient and subject based on device approval type
            var toEmail = '';
            var emailSubject = '';
            var toName = '';
            var notifyAdminsByNotification = false;
            let templateSettings;
            if (Common.isDesktop()) {
                const Bowser = require("bowser");
                const browser = Bowser.getParser(req.headers['user-agent']).getBrowser();
                templateSettings = {
                    first,
                    last,
                    email,
                    browser: `${browser.name} ${browser.version}`,
                    ip: req.headers['x-client-ip']
                }
            }
            if (deviceapprovaltype == 0) { // default behavior, user approve himself
                if (orgemail && orgemail.length > 2) {
                    toEmail = orgemail;
                } else {
                    toEmail = email;
                }
                toName = first + " " + last;
                if (Common.isDesktop()) {
                    emailSubject = locale.getValue("desktopUnlockPasscodeEmailSubject")
                } else {
                    emailSubject = locale.getValue("unlockPasscodeEmailSubject");
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
                    emailSubject =  _.template(locale.getValue("desktopUnlockPasscodeEmailSubjectToAdmin", Common.defaultLocale))(templateSettings);
                } else {
                    emailSubject =  locale.format("unlockPasscodeEmailSubjectToAdmin",first ,last);
                }
            } else if (deviceapprovaltype == 2) { // both for admin and user
                if (notifieradmin == "PUSH@nubo.local") {
                    notifyAdminsByNotification = true;
                    toEmail = email;
                } else {
                    toEmail = [notifieradmin, email];
                }                
                toName = '';
                if (Common.isDesktop()) {
                    emailSubject =  _.template(locale.getValue("desktopUnlockPasscodeEmailSubjectToAdmin", Common.defaultLocale))(templateSettings);
                } else {
                    emailSubject =  locale.format("unlockPasscodeEmailSubjectToAdmin",first ,last);
                }

            }

            if (notifyAdminsByNotification == true) { // notify nubo admins by push notifications
                let pushTitle = locale.getValue("unlockPasscodeNotifTitle");
                let pushText = locale.format("unlockPasscodeNotifText",first,last,email );
                Notifications.sendNotificationToAdmins(mainDomain,pushTitle,pushText);
            }

            // build reset password URL
            /*var unlockPasswordURL = Common.dcURL + "html/player/login.html#unlockPassword/" + encodeURIComponent(loginEmailToken)
            + "/" + encodeURIComponent(email)
            + "/" + encodeURIComponent(mainDomain)
            + "/" + encodeURIComponent(deviceID);*/
            var unlockPasswordURL = `${Common.dcURL}unlockPassword?email=${encodeURIComponent(email)}&loginemailtoken=${encodeURIComponent(loginEmailToken)}&mainDomain=${encodeURIComponent(mainDomain)}&deviceID=${encodeURIComponent(deviceID)}`
            logger.info("Unlock Link: " + unlockPasswordURL);

            if (toEmail != null && toEmail.length > 0) {
                // setup e-mail data with unicode symbols
                var mailOptions = {
                    from: senderEmail,
                    // sender address
                    fromname: senderName,
                    to: toEmail,
                    // list of receivers
                    toname: toName,
                    subject: emailSubject                    
                };
                if (Common.isDesktop()) {
                    templateSettings.link = unlockPasswordURL;
                    mailOptions.text = _.template(locale.getValue("desktopUnlockPasscodeEmailBody", Common.defaultLocale))(templateSettings);
                    mailOptions.html = _.template(locale.getValue("desktopUnlockPasscodeEmailBodyHTML", Common.defaultLocale))(templateSettings);                
                } else {
                    mailOptions.text = locale.format("unlockPasscodeEmailBody",first,last);
                    mailOptions.html = locale.format("unlockPasscodeEmailBodyHTML",first,last,unlockPasswordURL)                                   
                }
                logger.info("sent " + email + " unlockpassword email");
                Common.mailer.send(mailOptions, function(success, message) {
                    if (!success) {
                        logger.info("sendgrid error: " + message);
                        return;
                    }
                });
            }

            // send SMS
            if (Common.activateBySMS && (deviceapprovaltype == 0 || deviceapprovaltype == 2)) {
                smsNotification.sendSmsNotificationInternal(mobilePhone, 'Click to unlock your Nubo account ' + unlockPasswordURL, null, function(message, status) {
                    logger.info(message);
                });
            }
        }
    });
}

var checkPasscode = {
    func: checkPasscode,
    findUserNameSendEmail: findUserNameSendEmail
};

module.exports = checkPasscode;