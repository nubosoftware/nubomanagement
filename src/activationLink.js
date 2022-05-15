"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var User = require('./user.js');
var userUtils = require('./userUtils.js');
var Notifications = require('./Notifications.js');
var ThreadedLogger = require('./ThreadedLogger.js');
var async = require('async');
let locale = require('./locale.js').locale;
const { Op, QueryTypes } = require('sequelize');
const qs = require('qs');
var status;
var msg;

var ActivationLink = {
    func: activationLink
};
module.exports = ActivationLink;

function returnInternalError(err, res) {
    status = Common.STATUS_ERROR;
    // internal error
    msg = "Internal error";
    console.error(err.name, err.message);
    if (res != undefined) {
        res.send({
            status: status,
            message: msg
        });
    }
    return;
}

function is_mobile(req) {
    var ua = req.header('user-agent');
    logger.info("user-agent=" + ua);
    if (/Android/.test(ua))
        return true;
    else
        return false;
};

function activationLink(req, res, next) {
    var status = 100;
    var msg = "";
    var isControlPanel = req.params.isControlPanel;
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    var emailToken = req.params.token;
    var cloneActivation = req.params.cloneActivation;
    var datetest = new Date();
    var expirationDateInit = (Common.withService) ? new Date(0) : new Date();
    if (req.params.email) {
        logger.user(req.params.email);
        logger.info(`activationLink called. emailToken: ${emailToken} user: ${req.params.email}`,{ mtype: "important"});
    } else {
        logger.info("activationLink called. emailToken: " + emailToken);
    }

    let smsActivation = req.params.smsActivation;
    let activationWhere;
    if (smsActivation === true || smsActivation === "true") {
        let email = req.params.email;
        if (!email || email.length < 5) {
            status = 1;
            // invalid parameter
            msg = "Invalid email!";
            res.send({
                status: status,
                message: msg
            });
            return;
        }
        //activationWhere = ['expirationdate >= ? AND emailtoken = ? AND email = ?', expirationDateInit, emailToken, email];
        activationWhere = {
            expirationdate: {
                [Op.gte]: expirationDateInit
            },
            emailtoken: emailToken,
            email: email,
        };
    } else {
        //activationWhere = ['expirationdate >= ? AND emailtoken = ? ', expirationDateInit, emailToken];
        activationWhere = {
            expirationdate: {
                [Op.gte]: expirationDateInit
            },
            emailtoken: emailToken,
        };
    }

    let row, userObj, userDevice, oldUserDevice, maskedUser,assignedPhoneNumber;
    let deviceType, email, oldActivationKey, deviceid, pushRegID, firstName, lastName, jobTitle, phoneNumber, imsi, deviceName,maindomain,localNumber;


    async.series([
        (cb) => {
            Common.db.Activation.findAll({
                attributes: ['deviceid', 'activationkey', 'status', 'pushregid', 'email', 'firstname', 'lastname', 'jobtitle', 'devicetype', 'phone_number', 'imsi', 'devicename','resetpasscode_wipe'],
                where: activationWhere,
            }).then(function (results) {
                if (!results || results == "") {
                    status = 1;
                    // invalid parameter
                    msg = "Token not found!";
                    cb(msg);
                    /*logger.info("activationLink:" +msg);
                    res.send({
                        status : status,
                        message : msg
                    });*/
                    return;
                }
                row = results[0];
                deviceType = row.devicetype != null ? row.devicetype : '';
                email = row.email != null ? row.email : '';
                logger.user(email);
                cb();
            }).catch(err => {
                status = Common.STATUS_ERROR;
                msg = "Internal error";
                logger.info("Activation.findAll error:"+ err);
                cb(err);
            });
        },
        (cb) => {
            // check the validity of the activation row found
            if (row.status == 0) {
                // valid actication pending row

                oldActivationKey = row.activationkey != null ? row.activationkey : '';
                deviceid = row.deviceid != null ? row.deviceid : '';
                pushRegID = row.pushregid != null ? row.pushregid : '';
                firstName = row.firstname != null ? row.firstname : '';
                lastName = row.lastname != null ? row.lastname : '';
                jobTitle = row.jobtitle != null ? row.jobtitle : '';
                phoneNumber = row.phone_number != null ? row.phone_number : '';
                imsi = row.imsi != null ? row.imsi : '';
                deviceName = row.devicename != null ? row.devicename : '';
                maindomain = row.maindomain;
                if (!maindomain) {
                    maindomain = email.substr(email.indexOf('@') + 1);
                }
                logger.user(email);
                logger.device(deviceid);
                if (Common.isEnterpriseEdition()) {
                    var clientIP = req.connection.remoteAddress;
                    var appid = deviceid + "_" + oldActivationKey;
                    Common.getEnterprise().audit(appid,'Activation validated',clientIP,{
                        email: email,
                        firstName: firstName,
                        lastName: lastName,
                        title: jobTitle
                    },{
                        dcName: Common.dcName,
                        deviceType: deviceType,
                        deviceid: deviceid,
                        phoneNumber: phoneNumber
                    });
                }
                cb();
            } else if (row.status == Common.STATUS_RESET_PASSCODE_PENDING) {
                // reset passcoe
                let oldActivationKey = row.activationkey != null ? row.activationkey : '';

                async.series([
                    (cb) => {
                        if (row.resetpasscode_wipe == 1) {
                            logger.info(`Wipe user device on reset passcode. email: ${row.deviceid}`);
                            userUtils.wipeUserDevice(row.email,cb);
                        } else {
                            cb();
                        }
                    },
                    (cb) => {
                        Common.db.Activation.update({
                            status: 1,
                            resetpasscode: 1,
                        }, {
                                where: {
                                    activationkey: oldActivationKey,
                                    status: Common.STATUS_RESET_PASSCODE_PENDING
                                }
                            }).then(function () {
                                status = 0;
                                msg = "Device activated !";

                                /*let deviceType = row.devicetype != null ? row.devicetype : '';
                                let email = row.email != null ? row.email : '';
                                res.send({
                                    status : status,
                                    message : msg,
                                    "deviceType" : deviceType,
                                    email : email
                                });*/
                                cb(msg); // return error to stop the standard activation process
                            }).catch(function (err) {
                                status = Common.STATUS_ERROR;
                                msg = "Internal error";
                                logger.info("Activation.update error:", err);
                                cb(err);
                                return;
                            });
                    }
                ],(err) => {
                    cb(err);
                });
            } else if (row.status == Common.STATUS_RESET_BIOMETRIC_PENDING) {
                // reset passcoe
                let oldActivationKey = row.activationkey != null ? row.activationkey : '';
                Common.db.Activation.update({
                    status: 1,
                    biometric_token: ""
                }, {
                        where: {
                            activationkey: oldActivationKey,
                            status: Common.STATUS_RESET_BIOMETRIC_PENDING
                        }
                    }).then(function () {
                        status = 0;
                        msg = "Approved !";
                        cb(msg); // return error to stop the standard activation process
                    }).catch(function (err) {
                        status = Common.STATUS_ERROR;
                        msg = "Internal error";
                        logger.info("Activation.update error:", err);
                        cb(err);
                        return;
                    });
            } else if (row.status == Common.STATUS_RESET_OTP_PENDING) {
                // reset passcoe
                let oldActivationKey = row.activationkey != null ? row.activationkey : '';
                Common.db.Activation.update({
                    status: 1,
                    otp_token: ""
                }, {
                        where: {
                            activationkey: oldActivationKey,
                            status: Common.STATUS_RESET_OTP_PENDING
                        }
                    }).then(function () {
                        status = 0;
                        msg = "Approved !";
                        cb(msg); // return error to stop the standard activation process
                    }).catch(function (err) {
                        status = Common.STATUS_ERROR;
                        msg = "Internal error";
                        logger.info("Activation.update error:", err);
                        cb(err);
                        return;
                    });
            } else if (row.status == Common.STATUS_ADMIN_ACTIVATION_PENDING) {
                // reset passcoe
                let oldActivationKey = row.activationkey != null ? row.activationkey : '';
                Common.db.Activation.update({
                    status: Common.STATUS_ADMIN_ACTIVATION_VALID
                }, {
                        where: {
                            activationkey: oldActivationKey,
                            status: Common.STATUS_ADMIN_ACTIVATION_PENDING
                        }
                    }).then(function () {
                        status = 0;
                        msg = locale.getValue("adminDeviceActivated");
                        cb(msg); // return error to stop the standard activation process
                    }).catch(function (err) {
                        status = Common.STATUS_ERROR;
                        msg = "Internal error";
                        logger.info("Activation.update error:", err);
                        cb(err);
                        return;
                    });
            } else if (row.status == Common.STATUS_ADMIN_RESET_PENDING) {
                    // reset passcoe
                    let oldActivationKey = row.activationkey != null ? row.activationkey : '';
                    Common.db.Activation.update({
                        status: Common.STATUS_ADMIN_ACTIVATION_VALID
                    }, {
                            where: {
                                activationkey: oldActivationKey,
                                status: Common.STATUS_ADMIN_RESET_PENDING
                            }
                        }).then(function () {
                            status = 0;
                            msg = locale.getValue("adminResetActivated");
                            cb(msg); // return error to stop the standard activation process
                        }).catch(function (err) {
                            status = Common.STATUS_ERROR;
                            msg = "Internal error";
                            logger.info("Activation.update error:", err);
                            cb(err);
                            return;
                        });
            } else {
                status = 1;
                // invalid parameter
                if (!isControlPanel) {
                    msg = "Token is not valid any more. Please try again.";
                } else {
                    msg = locale.getValue("adminTokenNotValid");
                }

                cb(msg);
                return;
            }
        },
        (cb) => {
            // try to find existing device with the same phone number
            if (phoneNumber !== "" && email.length > 64) {
                maskedUser = true;
                Common.db.UserDevices.findAll({
                    attributes: ['email', 'imei', 'active', 'devicename','local_extension','sip_username'],
                    where: {
                        reg_phone_number: phoneNumber,
                        imei: deviceid
                    },
                }).then(function (results) {
                    if (!results || results == "") {
                        oldUserDevice = null;
                        cb();
                        return;
                    }
                    oldUserDevice = results[0];
                    cb();
                }).catch(function (err) {
                    status = Common.STATUS_ERROR;
                    msg = "Internal error";
                    logger.info("UserDevices.findAll error:", err);
                    cb(err);
                    return;
                });
            } else {
                maskedUser = false;
                process.nextTick(cb);
            }
        },
        // generate new email for masked users
        (cb) => {
            if (maskedUser) {
                if (oldUserDevice) {
                    // if found old device - change the email to the old device
                    email = oldUserDevice.email;
                    localNumber = oldUserDevice.local_extension;
                    if (!localNumber || localNumber == "") {
                        localNumber = oldUserDevice.sip_username;
                    }
                    logger.info(`Found old user device with the same registration number: ${oldUserDevice.email}, phoneNumber: ${phoneNumber}, localNumber: ${localNumber}`);
                    cb();
                } else {
                    // try to find new local number and change email to that number
                    findLocalNumber(1,(err,newLocalNumber) => {
                        if (err) {
                            status = Common.STATUS_ERROR;
                            msg = "Internal error";
                            logger.info("Cannot find local number to assign to masked user activatio: "+ err);
                            cb(err);
                            return;
                        }
                        email = `${newLocalNumber}@${maindomain}`;
                        localNumber = newLocalNumber;
                        logger.info(`Assign new local number: ${localNumber}, change masked email to: ${email}`);
                        cb();
                    });
                }
            } else {
                cb();
            }
        },
        (cb) => {
            //1. create user in db (if necessary)
            userUtils.createOrReturnUserAndDomain(email, logger, function (err, obj) {
                if (err) {
                    status = Common.STATUS_ERROR;
                    msg = "Internal error";
                    logger.info("userUtils.createOrReturnUserAndDomain error:", err);
                    cb(err);
                    return;
                }
                userObj = obj;
                /*var email = obj.email;
                var domain = obj.domain;
                var authType = obj.authType;
                var orgName = obj.orgName;
                var serverURL = obj.exchange_conf.serverURL;
                var passcode = obj.passcode;
                var orgEmail = obj.orgEmail;
                var orgUser = obj.exchange_conf.orgUser;
                var orgPassword = obj.exchange_conf.orgPassword;*/

                // update the user details from latest activation record
                if (firstName != null && firstName.length > 0) {
                    User.setUserDetails(email, firstName, lastName, jobTitle, function (err) {
                        cb();
                    });
                } else {
                    cb();
                }
            });
        },
        (cb) => {
            //2. update Activation in db
            Common.db.Activation.update({
                status: 1,
                email: email            }, {
                    where: {
                        activationkey: oldActivationKey
                    }
                }).then(function () {
                    status = 0;
                    msg = "Device activated !";
                    cb();
                }).catch(function (err) {
                    status = Common.STATUS_ERROR;
                    msg = "Internal error";
                    logger.info("Activation.update error:", err);
                    cb(err);
                    return;
                });
        },
        (cb) => {
            // mark old activation from the same device and email as invalid
            // cloneActivation if exist, has different deviceid (HTML5 client) so we can run it here, asynchronously with cloneActivation update

            Common.db.Activation.findAll({
                attributes: ['deviceid', 'activationkey', 'status', 'pushregid', 'email', 'firstname', 'lastname', 'jobtitle', 'devicetype'],
                where: {
                    deviceid: deviceid,
                    email: email
                },
            }).then(function (results) {

                results.forEach(function (row) {
                    var otherActivationKey = row.activationkey != null ? row.activationkey : '';
                    if (otherActivationKey != oldActivationKey) {
                        Common.db.Activation.update({
                            status: 2
                        }, {
                                where: {
                                    activationkey: otherActivationKey
                                }
                            }).then(function () {

                            }).catch(function (err) {

                            });
                    }
                });
                cb();
            }).catch(function (err) {
                logger.info("ERROR: Cannot get Activations of deviceid: " + deviceid);
            });
        },
        (cb) => {
            // load User Device
            Common.db.UserDevices.findAll({
                attributes: ['email', 'imei', 'active', 'devicename'],
                where: {
                    email: email,
                    imei: deviceid
                },
            }).complete(function (err, results) {
                if (!!err) {
                    //returnInternalError(err);
                    status = Common.STATUS_ERROR;
                    msg = "Internal error";
                    logger.info("UserDevices.findAll error:", err);
                    cb(err);
                    return;
                }
                if (!results || results == "") {
                    userDevice = null;
                    cb();
                    return;
                }
                userDevice = results[0];
                cb();
            });
        },
        (cb) => {
            // Update User Device table
            if (userDevice === null) {
                // create new user device
                var isActive = 1;
                assignedPhoneNumber = "";
                //by default when user do activate the device is active.
                Common.db.UserDevices.create({
                    imei: deviceid,
                    imsi: imsi,
                    email: email,
                    devicename: deviceName,
                    active: isActive,
                    maindomain: userObj.domain,
                    reg_phone_number: phoneNumber,
                    local_extension: localNumber,
                    assigned_phone_number: assignedPhoneNumber,
                    inserttime: new Date()
                }).then(function (results) {
                    logger.info("user_devices created: device " + deviceid + " added to user: " + email);
                    cb();
                }).catch(function (err) {
                    status = Common.STATUS_ERROR;
                    msg = "Internal error";
                    logger.info("UserDevices.create error:", err);
                    cb(err);
                    return;
                });
                // if the new device is Desktop device ensure that this user have an image ready.
                // do that in background
                if (deviceType == "Desktop" && Common.isDesktop()) {
                    Common.getDesktop().debs.createImageForUser(email,userObj.domain).then(() => {
                        // do nothing
                    }).catch (err => {
                        logger.info(`Error in createImageForUser: ${err}`);
                    });
                }
                // if (deviceType != "Desktop" && Common.isMobile() && Common.platformType == "docker") {
                //     Common.getMobile().apksDocker.createImageForUser(email,userObj.domain).then(() => {
                //         // do nothing
                //     }).catch (err => {
                //         logger.info(`Error in createImageForUser: ${err}`);
                //     });
                // }
            } else {
                // update user device object
                assignedPhoneNumber = userDevice.assigned_phone_number;
                Common.db.UserDevices.update({
                    imsi: imsi,
                    devicename: deviceName,
                    reg_phone_number: phoneNumber,
                    local_extension: localNumber,
                    inserttime: new Date()
                }, {
                        where: {
                            email: email,
                            imei: deviceid
                        }
                    }).then(function () {
                        logger.info("user_devices exist updated: device " + deviceid + " added to user: " + email);
                        // if the  device is Desktop device ensure that this user have an image ready.
                        // do that in background
                        if (deviceType == "Desktop" && Common.isDesktop()) {
                            Common.getDesktop().debs.createImageForUser(email,userObj.domain).then(() => {
                                // do nothing
                            }).catch (err => {
                                logger.info(`Error in createImageForUser: ${err}`);
                            });
                        }
                        cb();
                    }).catch(function (err) {
                        status = Common.STATUS_ERROR;
                        msg = "Internal error";
                        logger.info("UserDevices.update error:", err);
                        cb(err);
                        return;
                    });
            }
        },
        (cb) => {
            // create the user folder so we can write settings on it
            userUtils.createUserFolders(email, deviceid, deviceType,false, new Date().getTime(), process.hrtime()[1], function (err) {
                cb();
            }, false);
            // Send push notification to this device
            //
            let notifText = locale.getValue("activationNotifToDevice");
            if (notifText && notifText != "") {
                Notifications.sendNotificationByRegId(deviceType, pushRegID, notifText, " ", 'Nubo', "-2");
            }

        },
        (cb) => {
            // update telephony settings if needed
            if (Common.isEnterpriseEdition()) {
                Common.getEnterprise().telephonyAPI.updateTelephonySettingsForDevice(email,deviceid,phoneNumber,assignedPhoneNumber,localNumber,cb);
            } else {
                cb();
            }
        }
    ], (err) => {
        if (status === 0) {
            logger.info(`Activation approved. user: ${email}, device: ${deviceid}`, {
                mtype: "important"
            });
        } else {
            logger.info(`Activation denied. user: ${email}, device: ${deviceid}, status: ${status}, message: ${msg}`,{
                mtype: "important"
            });
        }
        if (!isControlPanel) {
            if (status === 0) {
                res.send({
                    status: status,
                    message: msg,
                    "deviceType": deviceType,
                    email: email
                });
            } else {
                res.send({
                    status: status,
                    message: msg
                });
            }
        } else {
            let redirectURL = Common.controlPanelURL+"/html/admin/#/Message?"+qs.stringify({
                message: msg,
                status: status
            });
            res.writeHead(302, {
                'Location': redirectURL
            });
            res.end();
        }
    });
}

function findLocalNumber(maxVip, cb) {
    let curVipLevel = maxVip;
    let foundnum = false;
    let localNumber = null;
    async.whilst(() => {
        return (!foundnum && curVipLevel>0);
    }, (cb) => {
        findLocalNumberImp(curVipLevel,(num) => {
            if (num) {
                localNumber = num;
                foundnum = true;
            } else {
                --curVipLevel;
            }
            cb();
        });
    }, err => {
        if (!foundnum) {
            cb("Number not found");
        } else {
            cb(null,localNumber);
        }
    });
}

function findLocalNumberImp(VIPType, cb) {
    let startnum = 2000000;
    let endnum = 3000000;
    if (Common.telephonyParams && Common.telephonyParams.local_number_start) {
        startnum = Common.telephonyParams.local_number_start;
        endnum = Common.telephonyParams.local_number_end;
    }

    var randnum = Math.floor(startnum + Math.random() * (endnum - startnum));
    var num = randnum+1;

    let foundnum = false;
    let localNumber = null;

    async.whilst(() => {
        return (!foundnum && num !== randnum );
    }, (cb) => {


        let str = num.toString();
        let lastchar = null;
        let inseq = false;
        let curseqlong = 0
        let maxseqlong = 0;
        let totalseqlong = 0;
        for (let i = 0; i < str.length; i++) {
            let curchar = str.charAt(i);
            if (!inseq) {
                if (curchar === lastchar) {
                    inseq = true;
                    curseqlong = 2;
                }
            } else {
                if (curchar === lastchar) {
                    curseqlong++;
                } else {
                    inseq = false;
                    totalseqlong += curseqlong;
                }
            }
            if (curseqlong > maxseqlong) {
                maxseqlong = curseqlong;
            }
            lastchar = curchar;
        }
        if (inseq) {
            totalseqlong += curseqlong;
        }
        let vip_number_1 = (maxseqlong > 3 || totalseqlong > 6);
        let vip_number_2 = (maxseqlong > 2);
        let vip_number = (vip_number_1 ? 2 : (vip_number_2 ? 1 : 0));
        /*if (vip_number_1) {
          console.log(`number: ${str}, maxseqlong: ${maxseqlong}, vip_number_1: ${vip_number_1}, vip_number_2: ${vip_number_2}, vip_number: ${vip_number}`);
        }*/
        if (vip_number === VIPType) {

            Common.db.TelphonyLocalNumbers.findOne({
                attributes: ['local_number'],
                where: {
                    local_number: str
                },
            }).complete(function (err, localNum) {
                if (err) {

                    console.log("Error", err);
                    ++num;
                    if (num === endnum) {
                        num = startnum;
                    }
                    cb();
                    return;
                }

                if (localNum) {
                    ++num;
                    if (num === endnum) {
                        num = startnum;
                    }
                    cb();
                    return;
                } else {

                    Common.db.TelphonyLocalNumbers.create({
                        local_number: str,
                        is_used: 0,
                        vip_number: vip_number
                    }).then(function (results) {
                        foundnum = true;
                        localNumber = str;
                        logger.info(`localNumber: ${str}`);
                        cb();
                    }).catch(function (err) {
                        logger.error("Error in create", err);
                        ++num;
                        if (num === endnum) {
                            num = startnum;
                        }
                        cb();
                        return;
                    });
                }


            });
        } else {
            ++num;
            if (num === endnum) {
                num = startnum;
            }
            process.nextTick(cb);
        }


    }, err => {
        if (foundnum) {
            cb(localNumber);
        } else {
            cb();
        }
    });
}
