"use strict";
var async = require('async');
var Common = require('../common.js');
var LogsModule = require('./syslog/httpHandler.js');
var getProfilesModule = require('./getProfiles.js');
var getProfileDetailsModule = require('./getProfileDetails.js');
var addProfileModule = require('./addProfile.js');
var deleteProfilesModule = require('./deleteProfiles.js');
var activateProfilesModule = require('./activateProfiles.js');
var inviteProfilesModule = require('./inviteProfiles.js');
var activateDeviceModule = require('./activateDevice.js');
var deleteAppsModule = require('./deleteApps.js');
var deleteAppFromProfilesModule = require('./deleteAppFromProfiles.js');
var installAppsModule = require('./installApps.js');
var getAllAppsModule = require('./getAllApps.js');
var getGroupsModule = require('./getGroups.js');
var createGroupModule = require('./createGroup.js');
var getGroupDetailsModule = require('./getGroupDetails.js');
var deleteGroupsModule = require('./deleteGroups.js');
var removeProfilesFromGroupModule = require('./removeProfilesFromGroup.js');
var addProfilesToGroupModule = require('./addProfilesToGroup.js');
var getCompanyDetailsModule = require('./getCompanyDetails.js');
var updateProfileDetailsModule = require('./updateProfileDetails.js');
var getProfilesFromAppModule = require('./getProfilesFromApp.js');
var checkApkStatusModule = require('./checkApkStatus.js');
var updateApkDescriptionModule = require('./updateApkDescription.js');
var addAppRuleModule = require('./addAppRule.js');
var getRulesModule = require('./getRules.js');
var deleteAppRuleModule = require('./deleteAppRule.js');
var editAppRuleModule = require('./editAppRule.js');
var getNetwotkAccessStatusModule = require('./getNetwotkAccessStatus.js');
var setNetwotkAccessStatusModule = require('./setNetwotkAccessStatus.js');
var addAdminsModule = require('./addAdmins.js');
var removeAdminsModule = require('./removeAdmins.js');
var checkCertificateModule = require('./checkCertificate.js');
var addAppsToProfilesModule = require('./addAppsToProfiles.js');
var deleteAppModule = require('./deleteApp.js');
var securityPasscodeModule = require('./setSecurityPasscode.js');
var gecurityPasscodeModule = require('./getSecurityPasscode.js');
var getBlockedDevicesModule = require('./getBlockedDevices.js');
var deleteBlockedDevicesRuleModule = require('./deleteBlockedDevicesRule.js');
var UpdateBlockedDevicesRuleModule = require('./updateBlockedDevicesRule.js');
var addBlockedDevicesRuleModule = require('./addBlockedDevicesRule.js');
var killSessionModule = require('./killDeviceSession.js');
var approveUsersModule = require('./approveUsers.js');
var updateDeviceApprovalModule = require('./updateDeviceApproval.js');
var getAdminDeviceApprovalModule = require('./getAdminDeviceApproval.js');
var getWaitingForApprovalProfiles = require('./getWaitingForApprovalProfiles.js');
var generateReportsModule = require('./generateReports.js');
var runAdSyncModule = require('./runAdSync.js');
var getMainDashboardModule = require('./getMainDashboard.js');
var getOnlineUsersGroupDashboardModule = require('./getOnlineUsersGroupDashboard.js');
var getTabletDashboardModule = require('./getTabletDashboard.js');
var getAppUsageWeeklyDashboardModule = require('./getAppUsageWeeklyDashboard.js');
var resetLoginAttemptsToUserModule = require('./resetLoginAttemptsToUser.js');
let locale = require('../locale.js').locale;
var logger = Common.getLogger(__filename);
var setPasscode = require('../setPasscode.js');
var Login = require('../login.js');
const LongOperationNotif = require('../longOperationsNotif.js');
const AdminPermissions = require('../adminPermissions');
const orgsModule = require('./orgs');
const Plugin =  require('../plugin');
const LoginAttempts = require('../loginAttempts.js');

var setting = require('../settings.js');
const checkPasscode = require('../checkPasscode.js');

const ADMIN_LOGIN_REDIS_KEY = 'adminLogin:';


async function logoutAdmin(req,res) {
    try {
        const currentLogin = req.nubodata.adminLogin;
        await new Promise((resolve, reject) => {
            currentLogin.delete((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        logger.info(`logoutAdmin: Logout successful. loginToken: ${currentLogin.getLoginToken()}. User: ${currentLogin.getUserName()}`);
        res.send({
            status: Common.STATUS_OK,
            message: `Logout successful`,
        });
    } catch (err) {
        logger.info(`logoutAdmin: Logout failed: ${err}`);
        res.send({
            status: Common.STATUS_ERROR,
            message: `Logout failed: ${err}`,
        });
    }
}
async function loginWebAdminAsync(req, res, arg1) {
    // logger.info(`loginWebAdminAsync: ${JSON.stringify(req.params)}`);
    let status = Common.STATUS_ERROR;
    let message = 'Internal error';
    let activationkey = req.params.activationkey;
    try {
        let userName = req.params.userName;
        let password = req.params.password;
        let passwordHash = req.params.passwordHash;
        let resetPassword = false;
        if (arg1 === "reset") {
            password = "reset";
            resetPassword = true;
        }
        if (!userName || (!password && !passwordHash)) {
            res.send({
                status: '0',
                message: "Invalid parameters"
            });
            res.end();
            return;
        }

        let validActivation = false;
        let deviceid = req.params.deviceid;
        let deviceName = req.params.deviceName;


        let selectedDomain = req.params.selectedDomain;

        let dbPasscode;
        let passcodeSalt;
        let passcodetypechange;
        let passcodeTypePrev;
        let isValidPasscode = false;
        let login, orgdomain, isadmin;
        let firstname, lastname, imageurl, orgname;
        let orgs;
        let siteAdmin = 0;
        let platformDomain = 'common';
        let permissions;
        let resetpasscodeResult = 0;

        // Check activation key
        if (activationkey) {
            const results = await Common.db.Activation.findAll({
                attributes: ['activationkey', 'status', 'email', 'deviceid', 'expirationdate', 'resetpasscode'],
                where: {
                    activationkey: activationkey,
                    email: userName,
                    deviceid: deviceid
                },
            });
            logger.info(`Activation for ${activationkey}: ${JSON.stringify(results)}`);
            if (results && results.length === 1) {
                let statusResult = results[0].status;
                if (statusResult === Common.STATUS_ADMIN_ACTIVATION_VALID) {
                    validActivation = true;
                }
                resetpasscodeResult = results[0].resetpasscode;
            }
        }

        // Send activation email if needed
        if (!(validActivation && !resetPassword)) {
            activationkey = null;
            try {
                const activationkeyResult = await new Promise((resolve, reject) => {
                    adminLoginActivate(userName, deviceid, deviceName, resetPassword, validActivation ? activationkey : null, (err, activationkey) => {
                        if (err) {
                            return reject(err);
                        }
                        resolve(activationkey);
                    });
                });
                activationkey = activationkeyResult;
                status = Common.STATUS_ADMIN_ACTIVATION_PENDING;
                message = "Please activate admin login";
                throw message;
            } catch (err) {
                throw err;
            }
        }

        // Find user
        const userResults = await Common.db.User.findAll({
            attributes: ['firstname', 'lastname', 'imageurl', 'isactive', 'passcode', 'passcodetypechange', 'passcodetypeprev', 'passcodesalt', 'isadmin', 'orgdomain'],
            where: {
                isadmin: 1,
                isactive: 1,
                email: userName
            },
            include: [
                {
                    model: Common.db.Admin,
                }
            ]
        });

        if (!userResults || userResults.length === 0) {
            status = Common.STATUS_ERROR;
            message = "Cannot find user or user is inactive";
            throw message;
        }

        const user = userResults[0];
        dbPasscode = user.passcode;
        passcodeSalt = user.passcodesalt;
        passcodetypechange = user.passcodetypechange || 0;
        passcodeTypePrev = user.passcodetypeprev || 0;
        isadmin = user.isadmin || 0;
        orgdomain = user.orgdomain;
        firstname = user.firstname;
        lastname = user.lastname;
        imageurl = user.imageurl;
        permissions = new AdminPermissions(user.admin ? user.admin.permissions : "{}");

        if (selectedDomain && selectedDomain !== "") {
            if (orgdomain !== Common.siteAdminDomain) {
                logger.info("Cannot change selectedDomain to: " + selectedDomain);
                selectedDomain = orgdomain;
            }
        } else {
            selectedDomain = orgdomain;
        }

        const adminSecurityConfig = await setPasscode.getAdminSecurityConfig(orgdomain);
        // Find user device
        let userDevice = await Common.db.UserDevices.findOne({
            attributes: ['active', 'loginattempts'],
            where: {
                email: userName,
                imei: deviceid
            }
        });
        if (!userDevice) {
            logger.info(`userDevice not found. deviceid: ${deviceid}, deviceName: ${deviceName}`);
            userDevice = await Common.db.UserDevices.create({
                imei: deviceid,
                email: userName,
                active: 1,
                maindomain: user.orgdomain,
                devicename: deviceName,
                loginattempts: 0,
                inserttime: new Date()
            })
        }
        let loginattempts = userDevice.loginattempts;
        logger.info(`userDevice: ${JSON.stringify(userDevice)}, loginattempts: ${loginattempts}`);
        if (LoginAttempts.checkIfloginAttemptsExceeded(loginattempts,adminSecurityConfig)) {
            status = Common.STATUS_PASSWORD_LOCK;
            message = "You have incorrectly typed your password too many times. Please contact your administrator.";
            await sendLockAdminNotification(userName, deviceid, selectedDomain,firstname,lastname);  
            throw message;
        }


        // Update password if reset
        if (resetpasscodeResult === 1) {
            const newPassword = req.params.setPassword;
            if (!newPassword || newPassword.length < 1) {
                status = Common.STATUS_PASSWORD_NOT_MATCH;
                message = "Invalid password";
                throw message;
            }
             
            const newSalt = req.params.setSalt;
            const salt = newSalt || setPasscode.generateUserSalt(userName);
            const newPasswordHash =  passwordHash ? newPassword : setPasscode.hashPassword(newPassword, salt);
            const { validPassword, message } = await setPasscode.checkAdminPasswordHistory(userName, newPasswordHash, user.orgdomain);
            if (!validPassword) {
                status = Common.STATUS_PASSWORD_HISTORY_NOT_MATCH;
                message = message;
                throw message;
            }
            await Common.db.User.update({
                passcodeupdate: new Date(),
                passcode: newPasswordHash,
                passcodetypechange: 0,
                passcodesalt: salt
            }, {
                where: {
                    email: userName
                }
            });
            logger.info("Password updated!");
            isValidPasscode = true;

            // Reset resetpasscode flag
            await Common.db.Activation.update({
                resetpasscode: 0
            }, {
                where: {
                    activationkey: activationkey,
                    email: userName,
                    deviceid: deviceid
                },
            });
        }

        // Validate passcode
        if (!isValidPasscode) {
            const hashedPasscode = passwordHash ? passwordHash : setPasscode.hashPassword(password, passcodeSalt);
            if (dbPasscode === hashedPasscode) {
                isValidPasscode = true;
            }
          
            logger.info(`isValidPasscode: ${isValidPasscode}`);
            if (!isValidPasscode) {
                // Increment attempts on failure
                const result = await LoginAttempts.checkAndUpdateAttempts(
                    userName, 
                    deviceid, 
                    selectedDomain, 
                    null, 
                    false,
                    adminSecurityConfig
                );
                logger.info(`checkAndUpdateAttempts result: ${JSON.stringify(result)}`);
                if (result.exceeded) {
                    status = Common.STATUS_PASSWORD_LOCK;
                    message = "You have incorrectly typed your password too many times. Please contact your administrator.";
                    await sendLockAdminNotification(userName, deviceid, selectedDomain,firstname,lastname);  
                    throw message;
                } else {
                    status = Common.STATUS_PASSWORD_NOT_MATCH;
                    message = "Invalid password";
                    throw message;
                }
            } else {
                // Reset attempts on success
                await LoginAttempts.checkAndUpdateAttempts(
                    userName, 
                    deviceid, 
                    selectedDomain, 
                    null, 
                    true,
                    adminSecurityConfig
                );
            }
        }

        // Get org details
        let qOptions;
        if (orgdomain === Common.siteAdminDomain && Common.siteAdminDomain && Common.siteAdminDomain !== "" && permissions.checkPermission("@/", "rw")) {
            siteAdmin = 1;
            qOptions = {
                attributes: ['orgname', 'maindomain', 'dedicatedplatform'],
                order: [["orgname", "ASC"], ["maindomain", "ASC"]]
            };
        } else {
            siteAdmin = 0;
            qOptions = {
                attributes: ['orgname', 'maindomain', 'dedicatedplatform'],
                where: {
                    maindomain: selectedDomain
                }
            };
        }

        const orgResults = await Common.db.Orgs.findAll(qOptions);
        orgResults.forEach(row => {
            if (row.maindomain === selectedDomain) {
                orgname = row.orgname;
                if (row.dedicatedplatform === 1) {
                    platformDomain = selectedDomain;
                }
            }
        });
        const oneLoginPerUser = Common.oneAdminLoginPerUser;
        logger.info(`loginWebAdminAsync. orgname: ${orgname}, results.length: ${orgResults.length}, selectedDomain: ${selectedDomain}, oneAdminLoginPerUser: ${oneLoginPerUser}`);
        orgs = orgResults;


        if (oneLoginPerUser) {
            // search redis for login token for this user
            const redis = Common.redisClient;
            const redisKey = `${ADMIN_LOGIN_REDIS_KEY}${userName}`;
            const currentLoginToken = await redis.get(redisKey);
            if (currentLoginToken) {
                // check if that login token is still valid by trying to load it
                const currentLogin = await new Promise((resolve, reject) => {
                    new Login(currentLoginToken, (err, login) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(login);
                        }
                    });
                });
                let deleteCurrentLogin = false;
                if (currentLogin){
                    // if the user gave explicit permission to delete the current login, delete it
                    if (req.params.deleteCurrentLogin) {
                        logger.info(`loginWebAdminAsync: Deleting previous login for user ${userName}`);
                        await new Promise((resolve, reject) => {
                            currentLogin.delete((err) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            });
                        });
                        deleteCurrentLogin = true;
                    } else {
                        status = Common.STATUS_ADMIN_OTHER_SESSION;
                        message = "This user is already logged in in another session. Approve to logout from other session.";
                        throw message;
                    }
                } else {
                    deleteCurrentLogin = true;
                }
                if (deleteCurrentLogin) {
                    await redis.del(redisKey);
                }
            }

        }

        // Create new login token
        login = await new Promise((resolve, reject) => {
            new Login(null, (err, newLogin) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(newLogin);
                }
            });
        });

        login.setAuthenticationRequired(false);
        login.setPasscodeActivationRequired(false);
        login.setValidPassword(true);
        login.setDeviceName("Web Browser");
        login.setDeviceID("none");
        login.setEmail(userName);
        login.setUserName(userName);
        login.setIsAdmin(isadmin);
        login.setMainDomain(selectedDomain);
        login.setAdminConsoleLogin(1);
        login.setSiteAdmin(siteAdmin);
        login.setPlatformDomain(platformDomain);
        login.setAdminPermissions(permissions.getJSON());
        login.setValidLogin(true);

        await new Promise((resolve, reject) => {
            login.save((err, loginInstance) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(loginInstance);
                }
            });
        });
        if (oneLoginPerUser) {
            // add the new login token to redis
            const redis = Common.redisClient;
            const redisKey = `${ADMIN_LOGIN_REDIS_KEY}${userName}`;
            await redis.set(redisKey, login.getLoginToken());
        }

        status = Common.STATUS_OK;
        message = "Login Successful";
        logger.info(`loginWebAdmin: ${message}`);
        res.send({
            status: status,
            message: message,
            loginToken: login.getLoginToken(),
            mainDomain: login.getMainDomain(),
            firstname,
            lastname,
            imageurl,
            orgname,
            orgs,
            edition: Common.getEdition(),
            pluginsEnabled: Common.pluginsEnabled,
            productName: Common.productName,
            deviceTypes: Common.getDeviceTypes(),
            siteAdmin: siteAdmin === 1,
            siteAdminDomain: siteAdmin === 1 ? Common.siteAdminDomain : null,
            permissions: permissions.getJSON()
        });
        res.end();

    } catch (err) {
        logger.info(`loginWebAdminAsync error: ${err}`);
        res.send({
            status: status,
            message: message,
            activationkey: status === Common.STATUS_ADMIN_ACTIVATION_PENDING ? activationkey : undefined
        });
        res.end();
    }
}


const adminLoginUnlock = async (req,res) => {
    let email = req.params.email;
    let loginemailtoken = req.params.token;
    let deviceID = req.params.deviceid;
    const qs = require('qs');

    try {
        if (!email || !loginemailtoken || !deviceID) {
            throw new Error("Invalid parameters");
        }
        // check if the loginemailtoken is valid
        const results = await Common.db.User.findAll({
            attributes: ['loginemailtoken'],
            where: {
                email: email,
                loginemailtoken: loginemailtoken
            }
        });
        if (!results || results.length != 1) {
            throw new Error("Invalid token");
        }

        // update loginattempts to 0
        await Common.db.UserDevices.update({
            loginattempts: 0
        }, {
            where: {
                email: email,
                imei: deviceID
            }
        });

        // redirect (302) to control panel with success message
        let redirectURL = Common.controlPanelURL+"html/admin/#/Message?"+qs.stringify({
            message: "Password unlocked",
            status: 0
        });
        res.writeHead(302, {
            'Location': redirectURL
        });
        res.end();
    } catch (err) {
        logger.error("Error in adminLoginUnlock", err);
        let redirectURL = Common.controlPanelURL+"html/admin/#/Message?"+qs.stringify({
            message: "Invalid token",
            status: 1
        });
        res.writeHead(302, {
            'Location': redirectURL
        });
        res.end();
    }
}

const sendLockAdminNotification = async (email, deviceid, selectedDomain,firstname,lastname) => {
    try {
        var loginEmailToken = Common.crypto.randomBytes(48).toString('hex');
        //update loginemailtoken and send unlock email to user

        await Common.db.User.update({
            loginemailtoken: loginEmailToken
        }, {
            where: {
                email: email
            }
        });

        // send email to admin
        var activationLinkURL = Common.controlPanelURL + "api/auth/activate?unlock=Y&token=" + encodeURIComponent(loginEmailToken) + "&email=" + encodeURIComponent(email)+ "&deviceid=" + encodeURIComponent(deviceid);
        logger.info(`Unlock Link: ${activationLinkURL}, email: ${email}`);
        var senderEmail = Common.emailSender.senderEmail;
        var senderName = Common.emailSender.senderName;
        let toName = `${firstname} ${lastname}`;
        let emailSubject = locale.getValue("adminUnlockEmailSubject",Common.defaultLocale);

        // setup e-mail data with unicode symbols
        var mailOptions = {
            from: senderEmail,
            // sender address
            fromname: senderName,
            to: email,
            // list of receivers
            toname: toName,
            subject: emailSubject,
            // Subject line
            text: locale.format("adminUnlockEmailBody",firstname,lastname,activationLinkURL),
            //"Dear " + first + " " + last + ", \nClick the following link to connect to your working environment, and then continue working from your mobile device.\n\n" + activationLinkURL + "\n\n- The Nubo Team",
            // plaintext body
            html: locale.format("adminUnlockBodyHTML",firstname,lastname,activationLinkURL,firstname,lastname)
            //"<p>Dear " + first + " " + last + ",</p><p> \nClick the following link to connect to your working environment, and then continue working from your mobile device.</p>\n\n" + "<p><a href=\"" + activationLinkURL + "\">" + first + " " + last + " – Player Activation</a></p>  \n\n<p>- The Nubo Team</p>" // html body
        };
        
        logger.info(`sendLockAdminNotification. mailOptions: ${JSON.stringify(mailOptions)}`);

        await new Promise((resolve, reject) => {
            Common.mailer.send(mailOptions, function (success, message) {
                if (!success) {
                    logger.info("sendLockAdminNotification. email error: " + message);
                    reject(message);
                } else {
                    logger.info("sendLockAdminNotification. email sent to admin");
                    resolve();
                }
            });
        });
    } catch (err) {
        logger.error("Error in sendLockAdminNotification", err);
    }
}

var loginWebAdmin  = function(req,res,arg1) {
    loginWebAdminAsync(req,res,arg1).catch((err) => {
        logger.error(`loginWebAdmin error: ${err}`);
        res.send({
            status: Common.STATUS_ERROR,
            message: "Internal error"
        });
        res.end();
    });
}

var loadAdminParamsFromRequest = function(req,res,cb) {
    let loginToken = req.params.adminLoginToken;
    if (loginToken && loginToken != "") {
        new Login(loginToken, function(err, loginObj) {
            if (err) {
                return cb(err);
            }
            if (loginObj.isValidLogin() && loginObj.getIsAdmin() == 1 && loginObj.getAdminConsoleLogin() == 1) {
                logger.info("adminLoginToken validated. userName: "+loginObj.loginParams.userName);
                cb(null,loginObj);
            } else {
                logger.info("Invalid login for admin");
                cb(new Error("Invalid login for admin"));
            }
        });
    } else {
        // if admin login token not found - try to use session params from control panel
        setting.loadAdminParamsFromSession(req, res, cb);
    }
};


var setActiveOrgForSiteAdmin = function(req, res,next) {

    let adminLogin = req.nubodata.adminLogin;

    if (!adminLogin || adminLogin.getSiteAdmin() != 1) {
        res.writeHead(403, {
            "Content-Type": "text/plain"
        });
        res.end("403 Forbidden\n");
        return;
    }
    let selectedDomain = req.params.selectedDomain;
    if (!selectedDomain || selectedDomain == "") {
        res.writeHead(400, {
            "Content-Type": "text/plain"
        });
        res.end("403 Bad Request \n");
        return;
    }

    async.series([
        (cb) => {
            let qOptions = {
                attributes : ['orgname','maindomain','dedicatedplatform'],
                where: {
                    maindomain: selectedDomain
                }
            };
            Common.db.Orgs.findAll(qOptions).then((results) => {
                if (results && results.length == 1 && results[0].dedicatedplatform == 1) {
                    adminLogin.setPlatformDomain(selectedDomain);
                } else {
                    adminLogin.setPlatformDomain('common');
                }
                cb();
            }).catch((err) => {
                cb(err);
            });
        }, (cb) => {
            adminLogin.setMainDomain(selectedDomain);
            adminLogin.save(function(err, login) {
                cb(err);
            });
        }
    ],(err) => {
        if (err) {
            logger.error("Error in setActiveOrgForSiteAdmin: "+err);
            res.send({
                status : Common.STATUS_ERROR,
                message : "Internal error."
            });
            res.end();
            return;
        }
        res.send({
            status : Common.STATUS_OK,
            message : "Domain changed."
        });
        res.end();
    });



}



var adminLoginActivateLink = function(req,res) {
    // check if its unlock link
    if (req.params.unlock) {
        adminLoginUnlock(req,res);
        return;
    }
    req.params.isControlPanel = true;
    require('../activationLink').func(req,res);
};

var validateWebLogin = function(req,res) {
    if (!req.nubodata.adminLogin) {
        res.writeHead(403, {
            "Content-Type": "text/plain"
        });
        res.end("403 Forbidden\n");
        return;
    }
    res.send({
        status : Common.STATUS_OK,
        message : "Validated."
    });
    res.end();
};


async function adminLoginValidateActivation(req, res) {
    let email = req.params.email;
    let activationkey = req.params.activationkey;
    let deviceid = req.params.deviceid;
    
    if (!email || email == "" || !activationkey || activationkey == "" || !deviceid) {
        res.writeHead(400, {
            "Content-Type": "text/plain"
        });
        res.end("403 Bad Request \n");
        return;
    }

    try {
        const results = await Common.db.Activation.findAll({
            attributes: ['status', 'resetpasscode', 'maindomain', 'devicename'],
            where: {
                email: email,
                deviceid: deviceid,
                activationkey: activationkey,
            },
        });

        if (!results || results.length != 1) {
            res.send({
                status: '0',
                message: "Not found"
            });
            res.end();
            return;
        }

        let status = results[0].status;
        if (status == Common.STATUS_ADMIN_ACTIVATION_PENDING || status == Common.STATUS_ADMIN_RESET_PENDING) {
            res.send({
                status: status,
                message: "Activation pending"
            });
            res.end();
        } else if (status == Common.STATUS_ADMIN_ACTIVATION_VALID) {
            const maindomain = results[0].maindomain;
            const devicename = results[0].devicename;

            const adminSecurityConfig = await setPasscode.getAdminSecurityConfig(maindomain);
            
            
            // check that user device not exceeded max login attempts
            // Find user device
            let userDevice = await Common.db.UserDevices.findOne({
                attributes: ['active', 'loginattempts'],
                where: {
                    email: email,
                    imei: deviceid
                }
            });
            if (!userDevice) {
                userDevice = await Common.db.UserDevices.create({
                    imei: deviceid,
                    email: email,
                    active: 1,
                    maindomain: maindomain,
                    devicename: devicename,
                    loginattempts: 0,
                    inserttime: new Date()
                })
            }
            let loginattempts = userDevice.loginattempts;
            // logger.info(`userDevice: ${JSON.stringify(userDevice)}, loginattempts: ${loginattempts}`);
            if (LoginAttempts.checkIfloginAttemptsExceeded(loginattempts,adminSecurityConfig)) {
                status = Common.STATUS_PASSWORD_LOCK;
                // logger.info(`loginattempts exceeded. email: ${email}, deviceid: ${deviceid}, maindomain: ${maindomain}, activationkey: ${activationkey}`);
                const message = "You have incorrectly typed your password too many times. Account locked.";
                if (req.params.resendEmail) {
                    // read firstname and lastname from user table
                    const user = await Common.db.User.findOne({
                        attributes: ['firstname', 'lastname'],
                        where: {
                            email: email
                        }
                    });
                    await sendLockAdminNotification(email, deviceid, maindomain, user?.firstname || "", user?.lastname || "");
                }
                
                res.send({
                    status: status,
                    message: message,
                });
                res.end();
                return;
            }


            res.send({
                status: status,
                message: "Activation is valid",
                resetpasscode: results[0].resetpasscode,
                adminSecurityConfig: adminSecurityConfig
            });
            res.end();
        } else {
            res.send({
                status: '0',
                message: "Not found"
            });
            res.end();
        }

    } catch (err) {
        logger.error("adminLoginValidateActivation error", err);
        res.send({
            status: '0',
            message: "Not found"
        });
        res.end();
    }
}

/**
 * Activate admin login by entering activation record to DB and send verification email to admin
 * @param {*} email
 * @param {*} deviceid
 * @param {*} cb
 */
var adminLoginActivate = function(email,deviceid,deviceName,resetPassword,oldActivationkey,cb) {
    let domain;
    let activationkey;
    let emailtoken;
    let firstname;
    let lastname;
    const devicetype = "NuboAdmin";
    async.series([
        (cb) => {
            // validate this is active admin
            Common.db.User.findAll({
                attributes: [ 'orgdomain','firstname', 'lastname'],
                where: {
                    isadmin: 1,
                    isactive: 1,
                    email: email
                },
            }).then(function(results) {
                if (!results || results.length != 1) {
                    cb("Invalid admin user");
                    return;
                }
                domain = results[0].orgdomain;
                firstname = results[0].firstname;
                lastname = results[0].lastname;
                cb();
            }).catch(function(err) {
                cb(err);
            });
        },
        (cb) => {
            if (oldActivationkey) {
                cb();
                return;
            }
            // disable past activation from the same device
            Common.db.Activation.update({
                status : 2
            }, {
            where : {
                email: email,
                deviceid : deviceid,
                devicetype: devicetype,
                maindomain: domain
            }
            }).then(function() {
                cb();
            }).catch(function(err) {
                cb(err);
            });
        },
        (cb) => {
            if (oldActivationkey) {
                activationkey = oldActivationkey;
                cb();
                return;
            }
            // create activation key
            Common.crypto.randomBytes(48, function(err, buf) {
                if (err) {
                    cb(err);
                    return;
                }
                activationkey = buf.toString('hex');
                cb();
            });
        },
        (cb) => {
            // create email token
            Common.crypto.randomBytes(48, function(err, buf) {
                if (err) {
                    cb(err);
                    return;
                }
                emailtoken = buf.toString('hex');
                cb();
            });
        },
        (cb) => {
            // insert activation record to DB
            const currentDate = new Date();
            let expirationDate = new Date();
            let status = (resetPassword ? Common.STATUS_ADMIN_RESET_PENDING : Common.STATUS_ADMIN_ACTIVATION_PENDING);
            expirationDate.setHours(expirationDate.getHours() + Common.activationTimeoutPeriod);
            Common.db.Activation.upsert({
                activationkey: activationkey,
                deviceid: deviceid,
                status: status,
                email: email,
                firstname: firstname,
                lastname: lastname,
                jobtitle: devicetype,
                emailtoken: emailtoken,
                pushregid: "",
                firstlogin: 0,
                resetpasscode: (resetPassword ? 1 : 0),
                devicetype: devicetype,
                createdate: currentDate,
                expirationdate: expirationDate,
                maindomain: domain,
                imsi: "",
                devicename: deviceName
            }).then(function() {
                logger.info("Inserted activation record");
                cb();
            }).catch(function(err) {
                logger.error("Error on activation record",err);
                cb(err);
            });
        },
        (cb) => {
            if (Common.autoActivationOnce) { // if this is first time after bootstap - auth activate user
                logger.info(`Auth activate admin ${email} for the first time after bootstrap`);
                var newreq = {
                    params: {
                        token: emailtoken
                    },
                    connection: {}
                };
                var newres = {
                    send: function () {
                        logger.info("Autoactivation: \n", arguments);
                        // if this is a one time only activation for first admin delete this settings
                        logger.info(`After first admin activation. delete autoActivationOnce setings`);
                        Common.updateSettingsJSON({
                            autoActivationOnce : false
                        });

                    }
                };
                require('../activationLink.js').func(newreq, newres, null);
                cb();
            } else {
                cb();
            }
        },
        (cb) => {
            // send email to admin
            var activationLinkURL = Common.controlPanelURL + "api/auth/activate?token=" + encodeURIComponent(emailtoken) + "&email=" + encodeURIComponent(email);
            logger.info(`Activation Link: ${activationLinkURL}, email: ${email}`);
            var senderEmail = Common.emailSender.senderEmail;
            var senderName = Common.emailSender.senderName;
            let toName = `${firstname} ${lastname}`;
            let emailSubject = locale.getValue((resetPassword ? "adminResetEmailSubject" : "adminActivationEmailSubject"),Common.defaultLocale);

            // setup e-mail data with unicode symbols
            var mailOptions = {
                from: senderEmail,
                // sender address
                fromname: senderName,
                to: email,
                // list of receivers
                toname: toName,
                subject: emailSubject,
                // Subject line
                text: locale.format((resetPassword ? "adminResetEmailBody" : "adminActivationEmailBody"),firstname,lastname,activationLinkURL),
                //"Dear " + first + " " + last + ", \nClick the following link to connect to your working environment, and then continue working from your mobile device.\n\n" + activationLinkURL + "\n\n- The Nubo Team",
                // plaintext body
                html: locale.format(resetPassword ? "adminResetBodyHTML" : "adminActivationBodyHTML",firstname,lastname,activationLinkURL,firstname,lastname)
                //"<p>Dear " + first + " " + last + ",</p><p> \nClick the following link to connect to your working environment, and then continue working from your mobile device.</p>\n\n" + "<p><a href=\"" + activationLinkURL + "\">" + first + " " + last + " – Player Activation</a></p>  \n\n<p>- The Nubo Team</p>" // html body
            };

            Common.mailer.send(mailOptions, function (success, message) {
                if (!success) {
                    logger.info("email error: " + message);
                } else {
                    logger.info("Activation email sent to admin");
                }
            });
            cb();
        }
    ],(err) => {
        cb(err,activationkey);
    });
}

// var apiPluginAccess = function(req, res) {
//     let pluginName = req.params.pluginName;
//     if (Common.pluginsEnabled) {
//         const handled = Plugin.handleApiPluginRequest(pluginName,req,res);
//         if (handled) {
//             return;
//         }
//     }
//     logger.info(`apiPluginAccess. 404. pluginName: ${pluginName}, method: ${req.method}`);
//     res.writeHead(404, {
//         "Content-Type": "text/plain"
//     });
//     res.end("404 Not Found\n");

// }

var apiAccess = function(req, res,next) {
    let objectType = req.params.objectType;
    let arg1 = req.params.arg1;
    let arg2 = req.params.arg2;
    let arg3 = req.params.arg3;
    //logger.info(`apiAccess. objectType: ${objectType}, arg1: ${arg1}, arg2: ${arg2}, arg3: ${arg3}, method: ${req.method}, url: ${req.url}`);
    let requestType = null;
    if (objectType === 'auth') {
        if (arg1 == "activate") {
            adminLoginActivateLink(req,res);
        } else if(arg1 == "validate") {
            adminLoginValidateActivation(req,res);
        } else if (arg1 == "salt") {
            adminLoginGetSalt(req,res);
        } else {
            loginWebAdminAsync(req, res,arg1);
        }
        return;
    }
    let adminLogin = req.nubodata.adminLogin;
    if (!adminLogin) {
        res.writeHead(403, {
            "Content-Type": "text/plain"
        });
        res.end("403 Forbidden\n");
        return;
    }
    // ger permission object
    let perms = new AdminPermissions(adminLogin.getAdminPermissions());

    let checkPerm = function(perm,accessType){
        let ret = perms.checkPermission(perm,accessType);
        if (!ret) {
            res.writeHead(403, {
                "Content-Type": "text/plain"
            });
            res.end("403 Forbidden\n");
            logger.info(`403 Forbidden. objectType: ${objectType}, arg1: ${arg1}, arg2: ${arg2}, method: ${req.method}, admin: ${adminLogin.getEmail()}, perms: ${perms.getJSON()}`);
        }
        return ret;
    };

    if (objectType =="validateLogin" ) {
        validateWebLogin(req, res);
        return;
    } else if (objectType === "logout") {
        logoutAdmin(req,res);
        return;
    } else if (objectType === 'profiles') {
        if (!checkPerm('/profiles','r')) return;
        if (!arg1) {
            requestType = 'getProfiles';
        } else {
            req.params.email = arg1;
            if (!arg2) {
                if (req.method == "GET") {
                    requestType = 'getProfileDetails';
                } else if (req.method == "PUT") {
                    if (!checkPerm('/profiles','w')) return;
                    requestType = 'addProfile';
                } else if (req.method == "POST") {
                    if (!checkPerm('/profiles','w')) return;
                    requestType = 'updateProfileDetails';
                } else if (req.method == "DELETE") {
                    if (!checkPerm('/profiles','w')) return;
                    requestType = 'deleteProfiles';
                }
            } else if (arg2 == "invite") {
                if (!checkPerm('/profiles','w')) return;
                requestType = 'inviteProfiles';
            } else if (arg2 == "activate") {
                if (!checkPerm('/profiles','w')) return;
                requestType = 'activateProfiles';
            }
        }
    } else if (objectType === 'onlineProfiles') {
        if (!checkPerm('/profiles','r')) return;
        requestType = 'getOnlineProfiles';
    } else  if (objectType === 'groups') {
        if (!checkPerm('/groups','r')) return;
        if (!arg1) {
            requestType = 'getGroups';
        } else {
            if (arg1.indexOf("#") > 0) {
                let arr = arg1.split("#");
                req.params.groupName = arr[0];
                req.params.adDomain = arr[1];
            } else {
                req.params.groupName = arg1;
                req.params.adDomain = "";
            }
            if (!arg2) {
                if (req.method == "GET") {
                    requestType = 'getGroupDetails';
                } else if (req.method == "DELETE") {
                    if (!checkPerm('/groups','w')) return;
                    requestType = 'deleteGroups';
                } else if (req.method == "PUT") {
                    if (!checkPerm('/groups','w')) return;
                    requestType = 'createGroup';
                }
            } else {
                if (arg2 == "addProfiles") {
                    if (!checkPerm('/groups','w')) return;
                    requestType = 'addProfilesToGroup';
                } else  if (arg2 == "removeProfiles") {
                    if (!checkPerm('/groups','w')) return;
                    requestType = 'removeProfilesFromGroup';
                }
            }
        }
    } else if (objectType === 'apps') {
        if (!checkPerm('/apps','r')) return;
        if (!arg1) {
            if (req.method == "GET") {
                requestType = 'getAllApps';
            }
        } else {
            if (arg1 == "debs" || arg1 == "webapp") {
                // this is desktop or mobile command do not change  requestType
            } else {
                req.params.packageName = arg1;
                if (!arg2) {
                    if (req.method == "GET") {
                        requestType = "getProfilesFromApp";
                    } else if (req.method == "POST") {
                        if (!checkPerm('/apps','w')) return;
                        requestType = "updateApkDescription";
                    } else if (req.method == "DELETE") {
                        if (!checkPerm('/apps','w')) return;
                        requestType = "deleteApk";
                    }
                } else if (arg2 == "deleteFromProfiles") {
                    if (!checkPerm('/apps','i')) return;
                    requestType = "deleteAppFromProfiles";
                } else if (arg2 == "install") {
                    if (!checkPerm('/apps','i')) return;
                    requestType = "installApps";
                } else if (arg2 == "uninstall") {
                    if (!checkPerm('/apps','i')) return;
                    requestType = "deleteApps";
                } else if (arg2 == "checkUploadStatus") {
                    if (!checkPerm('/apps','w')) return;
                    requestType = "checkApkStatus";
                }
            }
        }
    } else if (objectType === 'notifications') {
        if (!checkPerm('/profiles','r')) return;
        if (!arg1 && req.method == "PUT") {
            require('../Notifications').pushNotification(req,res);
            return;
        }
    } else if (objectType === 'logs') {
        if (!checkPerm('@/','r')) return;
        if (!arg1) {
            requestType = "getLogs";
        } else if (arg1 === "getFilters") {
            LogsModule.getFiltersFromLogs(req,res);
            return;
        } else if (arg1 === "files") {
            if (!arg2 && req.method === "GET") {
                LogsModule.listLogFiles(req,res);
                return;
            } else if (arg2 && req.method === "GET") {
                LogsModule.downloadLogFile(arg2,req,res);
                return;
            }
        }
    } else if (objectType === 'events') {
        if (!checkPerm('/','r')) return;
        if (!arg1) {
            require('../eventLog').getEvents(req,res);
            return;
        }
    } else if (objectType === 'plugins' && Common.pluginsEnabled) {
        if (!checkPerm('@/','rw')) return;
        if (!arg1) {
            if (req.method == "GET") {
                require('../plugin').getAll(req,res);
                return;
            } else if (req.method == "PUT") {
                require('../plugin').upload(req,res);
                return;
            }
        } else {
            logger.info(`Plugin: ${arg1}`);
            if (req.method == "DELETE") {
                require('../plugin').delete(arg1,req,res);
                return;
            } else if (req.method == "POST") {
                require('../plugin').update(arg1,req,res);
                return;
            } else if (req.method == "GET") {
                require('../plugin').getPlugin(arg1,req,res);
                return;
            } else if (req.method == "PUT") {
                require('../plugin').upload(req,res,arg1);
                return;
            }
        }
    } else if (objectType === 'admins') {
        if (!checkPerm('/','w')) return;
        if (arg1) {
            req.params.email = arg1;
            if (req.method == "GET") {
                addAdminsModule.getAdmin(req,res);
                return;
            } else if (req.method == "PUT") {
                requestType = "addAdmins";
            } else if (req.method == "DELETE") {
                requestType = "removeAdmins";
            }
        }
    } else if (objectType === 'orgs') {
        if (!checkPerm('/','w')) return;
        if (arg1) {
            req.params.selectedDomain = arg1;
            if (req.method == "PUT") {
                if (!checkPerm('@/','w')) return;
                setActiveOrgForSiteAdmin(req,res);
                return;
            } else if (req.method == "POST") {
                orgsModule.post(req,res);
                return;
            } else if (req.method == "GET") {
                orgsModule.get(req,res);
                return;
            } else if (req.method == "DELETE") {
                orgsModule.deleteOrg(req,res);
                return;
            }
        } else {
            if (!checkPerm('@/','w')) return;
            orgsModule.get(req,res);
            return;
        }
    } else if (objectType == 'upload') {
        if (!checkPerm('/apps','w')) return;
        require('../upload').uploadFromNuboAdmin(req,res);
        return;
    } else if (objectType == 'devices') {
        if (arg1 && arg2) {
            req.params.email = arg1;
            req.params.imei = arg2;
            if (!checkPerm('/profiles','w')) return;
            if (req.method == "POST") {
                let action = req.params.action;
                if (action == "endSession") {
                    requestType = "killDeviceSession";
                } else if (action == "disable") {
                    requestType = "activateDevice";
                    req.params.activate = "N";
                } else if (action == "enable") {
                    requestType = "activateDevice";
                    req.params.activate = "Y";
                }
            } else if (req.method == "PUT") {
                activateDeviceModule.addDevice(req,res);
                return;
            } else if (req.method == "DELETE") {
                activateDeviceModule.deleteDevice(req,res);
                return;
            }
        } else if (req.method == "GET") {
            if (!checkPerm('/profiles','r')) return;
            req.params.email = arg1;
            getProfilesModule.getDevices(req,res);
            return;
        }
    } else if (objectType == 'approvals') {
        if (!checkPerm('/profiles','r')) return;
        if (!arg1) {
            if (req.method == "GET") {
                requestType = "getWaitingForApprovalProfiles";
            }
        } else if (arg1 && arg2 && arg3 && (req.method == "PUT" || req.method == "DELETE")) {
            if (!checkPerm('/profiles','w')) return;
            req.params.email = arg1;
            req.params.deviceId = arg2;
            req.params.approveType = arg3;
            req.params.all = "N";
            if (req.method == "PUT") {
                req.params.approve = "Y";
            } else {
                req.params.approve = "N";
            }
            requestType = "approveUsers";
        }
    } else if (objectType == "security") {
        if (!checkPerm('/','w')) return;
        if (arg1 == "deviceApproval") {
            if (req.method == "GET") {
                requestType = "getAdminDeviceApproval";
            } else if (req.method == "POST") {
                requestType = "updateDeviceApproval";
            }
        } else if (arg1 == "authentication") {
            if (req.method == "GET") {
                requestType = "getSecurityPasscode";
            } else if (req.method == "POST") {
                requestType = "setSecurityPasscode";
            }
        } else if (arg1 == "deviceRules") {
            if (req.method == "GET") {
                requestType = "getBlockedDevices";
            } else if (req.method == "PUT") {
                requestType = "addBlockedDevicesRule";
            } else if (req.method == "POST") {
                requestType = "updateBlockedDevicesRule";
            } else if (req.method == "DELETE") {
                requestType = "deleteBlockedDevicesRule";
            }
        } else if (arg1 == "adminAuthentication") {
            if (req.method == "POST") {
                securityPasscodeModule.setAdminAuthentication(req,res);
                return;
            }
        }

        //getBlockedDevices deleteBlockedDevicesRule
    } else if (objectType == "dashboard") {
        if (req.method == "GET") {
            requestType = "getTabletDashboard";
        }
    } else if (objectType == "reports") {
        if (!checkPerm('/reports','r')) return;
        if (arg1 && req.method == "GET") {
            requestType = "generateReports";
            req.params.reportId = arg1;
        }
    } else if (objectType == "recordings") {
        if (!checkPerm('/','w')) return;
        if (!arg1 && req.method == "GET") {
            // get recording list
            require('./recordings').getRecordings(req,res);
            return;
        } else if (arg1 == "profiles" && req.method == "GET" ) {
            require('./recordings').getProfiles(req,res);
            return;
        } else if (arg1 == "profiles" && (req.method == "PUT" || req.method == "DELETE") ) {
            require('./recordings').addRemoveProfiles(req,res);
            return;
        } else if (arg1 && arg2 && req.method == "POST") {
            // prepare video file
            require('./recordings').prepareVideoFile(req,res,arg1,arg2);
            return;
        } else if (arg1 && arg2 && req.method == "GET") {
            // get video file
            require('./recordings').getVideo(req,res,arg1,arg2);
            return;
        }
    } else if (objectType == "platforms") {
        if (!checkPerm('@/','w')) return;
        if (!arg1 && req.method == "GET") {
            require('./platformControl').getPlatformList(req,res);
            return;
        } else if (arg1 && !arg2) {
            req.params.platID = arg1;
            if ( req.method == "GET") {
                require('./platformControl').getPlatformDetails(req,res);
                return;
            } else if ( req.method == "PUT") {
                req.params.cmd = "start";
                require('./platformControl').platformCommand(req,res);
                return;
            } else if ( req.method == "DELETE") {
                req.params.cmd = "stop";
                require('./platformControl').platformCommand(req,res);
                return;
            } else if ( req.method == "POST") {
                require('./platformControl').updateStaticPlatform(req,res);
                return;
            }
        } else if (arg1 && arg2) {
            req.params.platID = arg1;
            req.params.cmd = arg2;
            require('./platformControl').platformCommand(req,res);
            return;
        }
    } else if (objectType == "system") {
        if (!checkPerm('@/','r')) return;
        if (arg1 == "versions" && req.method == "GET") {
            require('../componentVersions.js').getVersions(req,res);
            return;
        }
    } else if (objectType == "longOperations") {
        if (arg1 && req.method == "GET") {
            let notif = new LongOperationNotif(arg1);
            notif.get().then((str) => {
                if (!str || str == "") {
                    res.send({
                        status : Common.STATUS_NOTIF_EMPTY,
                        message : "Empty"
                    });
                    res.end();
                } else {
                    try {
                        let obj = JSON.parse(str);
                        res.send(obj);
                        res.end();
                    } catch (err) {
                        res.send({
                            status : Common.STATUS_ERROR,
                            message : "Error parsing notification: "+err
                        });
                        res.end();
                    }
                }
            }).catch((err) => {
                res.send({
                    status : Common.STATUS_ERROR,
                    message : "Error getting notification: "+err
                });
                res.end();
            });
            return;
        }
    }
    if (!requestType) {
        if (Common.isEnterpriseEdition()) {
            const handled = Common.getEnterprise().handleRestApiRequest(objectType,arg1,arg2,arg3,perms,adminLogin,req,res);
            if (handled) {
                return;
            }
        }
        if (Common.isMobile()) {
            const handled = Common.getMobile().handleRestApiRequest(objectType,arg1,arg2,arg3,perms,adminLogin,req,res);
            if (handled) {
                return;
            }
        }
        if (Common.isDesktop()) {
            const handled = Common.getDesktop().handleRestApiRequest(objectType,arg1,arg2,arg3,perms,adminLogin,req,res);
            if (handled) {
                return;
            }
        }
        if (Common.pluginsEnabled) {
            const handled = Plugin.handleRestApiRequest(objectType,arg1,arg2,arg3,perms,adminLogin,req,res);
            if (handled) {
                return;
            }
        }
    }



    if (requestType) {
        req.params.requestType = requestType;
        restGet(req,res);
        return;
    } else {
        logger.info(`404. objectType: ${objectType}, arg1: ${arg1}, arg2: ${arg2}, method: ${req.method}`);
        res.writeHead(404, {
            "Content-Type": "text/plain"
        });
        res.end("404 Not Found\n");
    }

}

var restGet = function(req, res,next) {
    var resDone = false;
    var domain = "";
    var admin = "";
    async.series([
            function(callback) {
                loadAdminParamsFromRequest(req, res, function(err, login) {
                    if(err){
                        callback(err);
                        return;
                    }

                    if(!login){
                        callback('missing login token');
                        return;
                    }

                    if(setting.getDebugMode()){
                        domain = "nubosoftware.com";
                        admin = "nubosoftware.com";
                        callback(null);
                        return;
                    }

                    domain = login.loginParams.mainDomain;
                    admin = login.loginParams.userName;
                    callback(null);
                });
            }
        ], function(err) {
            if(err) {
                res.send({
                    status : '0',
                    message : err
                });
                res.end();
            } else {
                //logger.info("Control Panel. requestType: "+req.params.requestType);
                if(req.params.requestType === 'getProfiles') {
                    getProfilesModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'getOnlineProfiles') {
                    getProfilesModule.getOnlineProfiles(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'getProfileDetails') {
                    getProfileDetailsModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'addProfile') {
                    addProfileModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'deleteProfiles') {
                    deleteProfilesModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'activateProfiles') {
                    activateProfilesModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'inviteProfiles') {
                    inviteProfilesModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'activateDevice') {
                    activateDeviceModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'deleteApps') {
                    deleteAppsModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'deleteAppFromProfiles') {
                    deleteAppFromProfilesModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'installApps') {
                    installAppsModule.get(req,res);
                    resDone = true;
                }

                if(req.params.requestType === 'getAllApps') {
                    getAllAppsModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'getGroups') {
                    getGroupsModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'createGroup') {
                    createGroupModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'getGroupDetails') {
                    getGroupDetailsModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'deleteGroups') {
                    deleteGroupsModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'removeProfilesFromGroup') {
                    removeProfilesFromGroupModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'addProfilesToGroup') {
                    addProfilesToGroupModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'getCompanyDetails') {
                    getCompanyDetailsModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'updateProfileDetails') {
                    updateProfileDetailsModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'getProfilesFromApp') {
                    getProfilesFromAppModule.get(req,res);
                    resDone = true;
                }


                if(req.params.requestType === 'checkApkStatus') {
                    checkApkStatusModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'updateApkDescription') {
                    updateApkDescriptionModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'addAppRule') {
                    addAppRuleModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'getRules') {
                    getRulesModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'deleteAppRule') {
                    deleteAppRuleModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'editAppRule') {
                    editAppRuleModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'getNetwotkAccessStatus') {
                    getNetwotkAccessStatusModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'setNetwotkAccessStatus') {
                    setNetwotkAccessStatusModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'addAdmins') {
                    addAdminsModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'removeAdmins') {
                    removeAdminsModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'checkCertificate') {
                    checkCertificateModule.get(req,res);
                    resDone = true;
                }

                if(req.params.requestType === 'addAppsToProfiles') {
                    addAppsToProfilesModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'getLogs') {
                    LogsModule.get(req,res);
                    resDone = true;
                }
                if(req.params.requestType === 'deleteApk') {
                    deleteAppModule.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'killDeviceSession') {
                    killSessionModule.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'setSecurityPasscode') {
                    securityPasscodeModule.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'getSecurityPasscode') {
                    gecurityPasscodeModule.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'getBlockedDevices') {
                    getBlockedDevicesModule.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'deleteBlockedDevicesRule') {
                    deleteBlockedDevicesRuleModule.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'updateBlockedDevicesRule') {
                    UpdateBlockedDevicesRuleModule.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'addBlockedDevicesRule') {
                    addBlockedDevicesRuleModule.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'approveUsers') {
                    approveUsersModule.get(req, res, domain, admin);
                    resDone = true;
                }
                if(req.params.requestType === 'updateDeviceApproval') {
                    updateDeviceApprovalModule.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'getAdminDeviceApproval') {
                    getAdminDeviceApprovalModule.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'getWaitingForApprovalProfiles') {
                    getWaitingForApprovalProfiles.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'generateReports') {
                    generateReportsModule.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'runAdSync') {
                    runAdSyncModule.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'getMainDashboard') {
                    getMainDashboardModule.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'getOnlineUsersGroupDashboard') {
                    getOnlineUsersGroupDashboardModule.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'getTabletDashboard') {
                    getTabletDashboardModule.get(req, res, domain);
                    resDone = true;
                }
                if(req.params.requestType === 'getAppUsageWeeklyDashboard') {
                    getAppUsageWeeklyDashboardModule.get(req, res, domain);
                    resDone = true;
                }

                if(req.params.requestType === 'resetLoginAttemptsToUser') {
                    resetLoginAttemptsToUserModule.get(req, res);
                    resDone = true;
                }
                if (!resDone && Common.isMobile()) {
                    resDone = Common.getMobile().restGet(req,res);
                }
                if (!resDone && Common.isDesktop()) {
                    resDone = Common.getDesktop().restGet(req,res);
                }

                if(!resDone) {
                    logger.info(`Not found requestType: ${req.params.requestType }`)
                    res.end({
                        status: 0,
                        message: "Request type not found"
                    });
                }
            }
        }
    );

};

async function adminLoginGetSalt(req, res) {
    try {
        const userName = req.params.userName;
        const activationkey = req.params.activationkey;
        const deviceid = req.params.deviceid;

        if (!userName) {
            res.send({
                status: Common.STATUS_ERROR,
                message: "Missing userName parameter"
            });
            return;
        }

        // Check activation key if provided
        let validActivation = false;
        if (activationkey) {
            const results = await Common.db.Activation.findAll({
                attributes: ['activationkey', 'status', 'email', 'deviceid', 'expirationdate'],
                where: {
                    activationkey: activationkey,
                    email: userName,
                    deviceid: deviceid
                },
            });
            if (results && results.length === 1) {
                let statusResult = results[0].status;
                if (statusResult === Common.STATUS_ADMIN_ACTIVATION_VALID) {
                    validActivation = true;
                }
            }
        }

        // Send activation email if needed
        if (!validActivation) {
            try {
                const activationkeyResult = await new Promise((resolve, reject) => {
                    adminLoginActivate(userName, deviceid, req.params.deviceName, false, null, (err, activationkey) => {
                        if (err) {
                            return reject(err);
                        }
                        resolve(activationkey);
                    });
                });
                res.send({
                    status: Common.STATUS_ADMIN_ACTIVATION_PENDING,
                    message: "Please activate admin login",
                    activationkey: activationkeyResult
                });
                return;
            } catch (err) {
                throw err;
            }
        }

        // Find user and get their salt
        const userResults = await Common.db.User.findAll({
            attributes: ['passcodesalt'],
            where: {
                isadmin: 1,
                isactive: 1,
                email: userName
            }
        });

        if (!userResults || userResults.length === 0) {
            logger.info(`adminLoginGetSalt. User not found for ${userName}`);
            res.send({
                status: Common.STATUS_ERROR,
                message: "User not found"
            });
            return;
        }

        const user = userResults[0];
        logger.info(`adminLoginGetSalt. User found for ${userName}. Salt: ${user.passcodesalt}`);
        res.send({
            status: Common.STATUS_OK,
            salt: user.passcodesalt
        });

    } catch (err) {
        logger.error(`adminLoginGetSalt error: ${err}`, err);
        res.send({
            status: Common.STATUS_ERROR,
            message: "Internal error"
        });
    }
}

module.exports = {
    get: restGet,
    loginWebAdmin,
    apiAccess
};
