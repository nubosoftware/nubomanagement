"use strict";
var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var crypto = require('crypto');
var User = require('./user.js');
var eventLog = require('./eventLog.js');
var smsNotification = require('./SmsNotification.js');
var Notifications = require('./Notifications.js');
let locale = require('./locale.js').locale;
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const _ = require('underscore');
const util = require('util');

const { APIException, RedirectException } = require('./exceptions');

/**
 * Activate new device
 * Client call this handler to register new user/device and
 * obtain an activation key.
 * Usually after call to activae the new activation need to be approved
 * By confirm and email/sms or by an admin
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @returns
 */
async function activate(req, res, next) {
    var responseSent = false;
    try {

        // Read and validate input parameters
        let email = req.params.email;
        if (!email) {
            throw new APIException("Invalid email", 1);
        }
        var deviceid = req.params.deviceid;
        if (deviceid == undefined || deviceid.length < 2) {
            throw new APIException("Invalid device ID", 1);
        }

        var imsi = req.params.imsi;

        var clientIP = req.headers['x-client-ip'];
        checkDOS(clientIP);

        // check that we do not need to re-direct user to another data center
        await checkRedirection(email);

        var deviceName = req.params.deviceName;
        if (deviceName == undefined || deviceName == '') {
            deviceName = "unknown";
        }

        var phoneNumber = req.params.phoneNumber;
        if (phoneNumber == undefined) {
            phoneNumber = "";
        }
        if (phoneNumber !== "") {
            // check that the email field is valid
            let emailArr = email.split("@");
            let emailPart = emailArr[0];
            let phoneHashed = crypto.createHash('sha256').update(phoneNumber, 'utf-8').digest('hex').toLowerCase();
            if (phoneHashed !== emailPart) {
                logger.info(`Invalid phone hash. emailPart: ${emailPart}, phoneHashed: ${phoneHashed}, phoneNumber: ${phoneNumber}`);
                throw new APIException("Invalid phone has", 1);
            }
        }
        var first = undefined,
            last = undefined,
            title = undefined;
        var alreadyUser = req.params.alreadyUser;
        if (alreadyUser != 'Y') {
            // if this is a signup process, validate that signup is enabled and read signup parameters
            if (Common.disableSignup) {
                throw new APIException("Cannot signup users", 1);
            }
            first = req.params.first;
            if (first == undefined || first.length < 1) {
                throw new APIException("Invalid first name", 1);
            }
            last = req.params.last;
            if (last == undefined || last.length < 1) {
                throw new APIException("Invalid last name", 1);
            }
            title = req.params.title;
            if (!title) {
                title = "NA";
            }
        } else {
            try {
                const details = await User.getUserDetailsPromise(email);
                first = details.firstName;
                last = details.lastName;
                title = details.jobTitle;
            } catch(err) {
                throw new APIException("Email not found",1);
            }
        }

        var deviceType = req.params.deviceType;
        if (deviceType == undefined || deviceType.length < 1)
            deviceType = 'Android';



        var regid = req.params.regid;
        if (regid == undefined || regid.length < 1) {
            regid = "none";
        }

        // convert device name to human readble format (if avilable)
        let devNameResults = await Common.db.DeviceModelConvert.findAll({
            attributes: ['devicemodel'],
            where: {
                hardwaredesc: deviceName
            },
        });
        if (devNameResults && devNameResults != "") {
            deviceName = devNameResults[0].devicemodel;
        }

        // create activation key and email token
        var token = crypto.randomBytes(48).toString('hex');
        var emailtoken = crypto.randomBytes(48).toString('hex');

        //logger.info("token: " + token);

        // set creation date of the activation link
        var currentDate = new Date();

        // build expiration date 48 hours from creation date (make it settings later on)
        //logger.info('Activation Timeout Period:' + Common.activationTimeoutPeriod);
        var expirationDate = new Date();
        expirationDate.setHours(expirationDate.getHours() + Common.activationTimeoutPeriod);

        // logger.info('Activation expirationDate:' + expirationDate.getHours());
        var domainEmail;
        let userObj = await User.getUserObjPromise(email);

        if (userObj.orgdomain) {
            domainEmail = userObj.orgdomain;
        } else {
            domainEmail = email.substr(email.indexOf('@') + 1);
        }
        email = email.toLowerCase();
        domainEmail = domainEmail.toLowerCase();

        // load organization by domain
        let org = await Common.db.Orgs.findOne({
            attributes: ['allowdevicereg','notifieradmin', 'deviceapprovaltype'],
            where: {
                maindomain: domainEmail
            },
        });
        if (!org) {
            // this is a new domain
            org = {
                allowdevicereg: 1,
                notifieradmin: "",
                deviceapprovaltype: 0
            };
        }
        if (org.allowdevicereg != 1) {
            // if device registration is not allowed - check that such device exists
            let userDevice = await Common.db.UserDevices.findOne({
                attributes : ['email'],
                where : {
                    email : email,
                    imei : deviceid
                },
            });
            if (!userDevice) {
                throw new APIException("Device doesn't exist", Common.STATUS_DISABLE_USER_DEVICE);
            }
        }

        // insert activationKey row to db
        await Common.db.Activation.create({
            activationkey: token,
            deviceid: deviceid,
            status: 0,
            email: email,
            firstname: first,
            lastname: last,
            jobtitle: title,
            emailtoken: emailtoken,
            pushregid: regid,
            firstlogin: 1,
            resetpasscode: 0,
            devicetype: deviceType,
            createdate: currentDate,
            expirationdate: expirationDate,
            maindomain: domainEmail,
            imsi: imsi,
            devicename: deviceName
        });

        // mark all other activations for the same user and device as expired
        await Common.db.Activation.update({
            status: 2
        }, {
            where: {
                activationkey: {
                    [Op.ne]: token
                },
                email: email,
                deviceid: deviceid,
                devicetype: deviceType,
                maindomain: domainEmail
            }
        });

        // Create events in Eventlog
        createLogEvents(deviceid, email, domainEmail, first, last, regid, currentDate, deviceType, token, function (err) {
            if (err) {
                logger.info('createLogEvents error:' + err);
            }
        });

        logger.log('info',`Added activation. user: ${email}, device: ${deviceid}`,{
            user: email,
            device: deviceid,
            mtype: "important"
        });

        // send result to the user
        let retObj = {
            status: 0,
            activationKey: token,
            message: "Activation link has been sent"
        };
        if (Common.changeClientURL && Common.changeClientURL != "") {
            retObj.mgmtURL = Common.changeClientURL;
        }
        res.send(retObj);
        responseSent = true;

        // handle cases when activation should be approved automatically
        var demoUserList = [];
        if (Common.demoUserList) {
            demoUserList = Common.demoUserList;
        }

        if (Common.autoActivation || (demoUserList.indexOf(email) > -1)) {
            var newreq = {
                params: {
                    token: emailtoken
                },
                connection: {}
            };
            var newres = {
                send: function () {
                    logger.info("Autoactivation: \n", arguments);
                }
            };
            // send request to the activation link handler and quit
            require('./activationLink.js').func(newreq, newres, null);
            return;
        }

        // prepare notification

        // read paramters from organization (if available)
        let rows = await Common.db.Orgs.findAll({
            attributes: ['notifieradmin', 'deviceapprovaltype'],
            where: {
                maindomain: domainEmail
            },
        });
        let row;
        if (!rows || !rows[0]) {
            // default value if org not found in DB
            logger.info(`activateDevice. org not found in DB: ${domainEmail}`);
            row = {
                notifieradmin: "",
                deviceapprovaltype: 0
            }
        } else {
            row = rows[0];
        }
        if (!row.deviceapprovaltype) {
            logger.info(`row.deviceapprovaltype not found! row: ${row}`);
        } else {
            logger.info(`row.deviceapprovaltype: ${row.deviceapprovaltype}`);
        }
        var notifieradmin = row.notifieradmin != null ? row.notifieradmin : '';
        var deviceapprovaltype = row.deviceapprovaltype != null ? row.deviceapprovaltype : 0;
        logger.info(`activateDevice. deviceapprovaltype: ${deviceapprovaltype}, domainEmail: ${domainEmail}`);

        var senderEmail = Common.emailSender.senderEmail;
        var senderName = Common.emailSender.senderName;

        // define to recepient and subject based on device approval type
        var toEmail = '';
        var notifyAdminsByNotification = false;
        var emailSubject = '';
        var toName = '';
        let templateSettings;
        if (Common.isDesktop()) {
            const Bowser = require("bowser");
            const browser = Bowser.getParser(req.headers['user-agent']).getBrowser();
            templateSettings = {
                first,
                last,
                email,
                browser : `${browser.name} ${browser.version}`,
                ip: clientIP
            }
        }

        if (deviceapprovaltype == 0) { // default behavior, user approve himself
            if (userObj.orgemail && userObj.orgemail.length > 2) {
                toEmail = userObj.orgemail;
            } else {
                toEmail = email;
            }
            toName = first + " " + last;

            if (Common.isDesktop()) {
                emailSubject = locale.getValue("desktopSignupEmailSubject", Common.defaultLocale)
            } else {
                emailSubject = locale.getValue("createPlayerEmailSubject", Common.defaultLocale);//'Create a Player';
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
                emailSubject =  _.template(locale.getValue("desktopSignupEmailSubject", Common.defaultLocale))(templateSettings);
            } else {
                emailSubject = util.format(locale.getValue("createPlayerEmailSubjectToAdmin", Common.defaultLocale), first, last);
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
                emailSubject =  _.template(locale.getValue("desktopSignupEmailSubject", Common.defaultLocale))(templateSettings);
            } else {
                emailSubject = util.format(locale.getValue("createPlayerEmailSubjectToAdmin", Common.defaultLocale), first, last);
            }

        } else if (deviceapprovaltype == 3) { // send SMS to subscriber
            if (phoneNumber === "") {
                let emailArr = email.split("@");
                phoneNumber = "+" + emailArr[0];
            } else {
                phoneNumber = "+" + phoneNumber;
            }
            var val = Math.floor(10000 + Math.random() * 90000);
            emailtoken = val.toString();
            await Common.db.Activation.update({
                emailtoken: emailtoken,
                phone_number: phoneNumber
            }, {
                where: {
                    activationkey: token,
                    email: email,
                    deviceid: deviceid,
                    devicetype: deviceType,
                    maindomain: domainEmail
                }
            });
            logger.info("Sending activation SMS to " + phoneNumber + ". Code: " + emailtoken);
            if (phoneNumber.startsWith("+97255888")) {
                logger.info("Ignore messages to +97255888 numbers (debug only");
                return;
            }
            smsNotification.sendSmsNotificationInternal(phoneNumber, 'Your activation code: ' + emailtoken, null, function (message, status) {
                logger.info(message);
            });

        }
        if (notifyAdminsByNotification == true) { // notify nubo admins by push notifications
            let pushTitle;
            let pushText;
            if (Common.isDesktop()) {
                pushTitle = locale.getValue("desktopSignupReqNotifTitle");  //"Nubo Player Activation Request";
                pushText =  _.template(locale.getValue("desktopSignupReqNotifText", Common.defaultLocale))(templateSettings);
            } else {
                pushTitle = locale.getValue("activationReqNotifTitle");  //"Nubo Player Activation Request";
                pushText = locale.format("activationReqNotifText", first, last, email);
            }
            Notifications.sendNotificationToAdmins(domainEmail, pushTitle, pushText);
        }

        if (toEmail !== "") {
            // send email if reciepient found
            var activationLinkURL = Common.dcURL + "activationLink?token=" + encodeURIComponent(emailtoken) + "&email=" + encodeURIComponent(email);
            logger.info(`Activation Link: ${activationLinkURL}`);

            // setup e-mail data with unicode symbols
            var mailOptions = {
                from: senderEmail,
                // sender address
                fromname: senderName,
                to: toEmail,
                // list of receivers
                toname: toName,
                subject: emailSubject,
            };

            if (Common.isDesktop()) {
                templateSettings.link = activationLinkURL;
                mailOptions.text = _.template(locale.getValue("desktopSignupEmailBody", Common.defaultLocale))(templateSettings);
                mailOptions.html = _.template(locale.getValue("desktopSignupEmailBodyHTML", Common.defaultLocale))(templateSettings);
            } else {
                mailOptions.text = locale.format("createPlayerEmailBody", first, last, activationLinkURL);
                mailOptions.html = locale.format("createPlayerEmailBodyHTML", first, last, activationLinkURL, first, last)

            }

            //logger.info(`mailOptions: ${JSON.stringify(mailOptions,null,2)}, templateSettings: ${JSON.stringify(templateSettings,null,2)}`);

            Common.mailer.send(mailOptions, function (success, message) {
                if (!success) {
                    logger.info("email send error: " + message);
                }
            });
        }

        // send SMS only if user can approve himself
        if (Common.activateBySMS && (deviceapprovaltype == 0 || deviceapprovaltype == 2)) {
            var mobilePhone = userObj.mobilephone != null ? userObj.mobilephone : '';
            // some validation on mobile phone even they are coming from the data base
            if (mobilePhone != null && mobilePhone.length > 0 && mobilePhone.length < 20) {
                smsNotification.sendSmsNotificationInternal(mobilePhone, 'Click your Nubo activation link ' + activationLinkURL, null, function (message, status) {
                    logger.info(message);
                });
            }
        }

        if (Common.isEnterpriseEdition()) {
            var appid = deviceid + "_" + token;
            Common.getEnterprise().audit(appid, 'Activation request', clientIP, {
                email: email,
                firstname: first,
                lastname: last,
                title: title
            }, {
                dcname: Common.dcName,
                devicetype: deviceType,
                alreadyuser: alreadyUser,
                deviceid: deviceid
            });
        }


    } catch (err) {
        if (!responseSent) {
            if (err instanceof APIException) {
                logger.info(`Activate request error. status: ${err.status}, message: ${err.message}`);
                res.send({
                    status: err.status,
                    message: err.message
                });
            } else if (err instanceof RedirectException) {
                res.send({
                    status: err.status,
                    message: err.message,
                    mgmtURL: err.mgmtURL
                });
            } else {
                logger.error(`Activate internal error: ${err}`, err);
                res.send({
                    status: 1,
                    message: "Internal error"
                });
            }
        } else {
            logger.error(`Activate internal error: ${err}`, err);
        }
    }
}

/*
    Map of all ip address accessed activation
*/
let activateIPs = {

}

const DOS_TTL = 1000 * 600; // 10 minutes TTL
const DOS_MAX_ATTEMPTS = 30; // not more than 30 attemots from the same ip in 10 minutes

/**
 * Check that this IP not accessed the service too many time to prevent DOS attacks
 * @param {*} clientIP
 */
function checkDOS(clientIP) {
    if (!clientIP) {
        throw new APIException("Invalid client IP", 1);
    }
    var now = new Date().getTime();
    let obj = activateIPs[clientIP];
    if (obj) {
        // check that value not expired
        const objTime = now - obj.now;
        if (objTime > DOS_TTL) {
            obj = null;
        }
    }
    if (!obj) {
        obj = {
            now,
            cnt: 0
        };
    }
    obj.cnt++;
    activateIPs[clientIP] = obj;
    if (obj.cnt > DOS_MAX_ATTEMPTS) {
        logger.info("Activate too many user attmepts for ip: " + clientIP);
        throw new APIException("Too many activate attemps", 1);
    }
}

// Event log Const
var EV_CONST = eventLog.EV_CONST;
var EV_CREATE_PLAYER = EV_CONST.EV_CREATE_PLAYER;
var INFO = EV_CONST.INFO;

function createLogEvents(deviceid, email, domain, firstName, lastName, regid, creationData, deviceType, activationKey) {
    var eventtype = EV_CREATE_PLAYER;
    var extra_info = 'email:' + email + ' firstName:' + firstName + ' lastName:' + lastName +
        ' regid:' + regid + ' creationData:' + creationData + ' deviceType:' + deviceType +
        ' activationKey:' + activationKey;

    // Create event in Eventlog
    eventLog.createEvent(eventtype, email, domain, extra_info, INFO, function (err) {
        if (err) {
            logger.error(err);
        }
    });
}

/**
 * Client the activateIPs map from expired objects
 */
setTimeout(function () {
    var now = new Date().getTime();
    for (const clientIP in activateIPs) {
        const obj = activateIPs[clientIP];
        console.log(`${clientIP}: ${JSON.stringify(obj)}`);
        const objTime = now - obj.now;
        if (objTime > DOS_TTL) {
            delete activateIPs[clientIP];
        }
    }
}, 1000 * 60);

/**
 * Check if we need to redirect the user to another data center
 * @param {*} email
 */
async function checkRedirection(email) {
    if (Common.orgRedirectionMap) {
        let orgRedirectionMap = (Common.orgRedirectionMap ? Common.orgRedirectionMap : {});
        var emailDomain = await User.getUserDomainPromise(email);
        var redirect = orgRedirectionMap[emailDomain];
        if (redirect && redirect != Common.dcURL) {
            const msg = "Redirecting user from " + emailDomain + " to " + redirect;
            logger.info(msg);
            throw new RedirectException(msg, redirect);
        }
    }
}


module.exports = {
    func: activate
}