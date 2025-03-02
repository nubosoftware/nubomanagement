"use strict";

var async = require('async');
var Common = require('../common.js');
var ActivationLink = require('../activationLink.js');
var logger = Common.getLogger(__filename);
var eventLog = require('./../eventLog.js');

module.exports = {
    get : ApproveUsers
};

function ActivateLinkByEmailToken(results, callback) {

    logger.info("ActivateLinkByEmailToken: "+JSON.stringify(results,null,2));
    async.eachSeries(results, function(row, callback) {

        var newreq = {
            params: {
                token: row.emailtoken
            },
            connection: {}
        };
        var newres = {
            send: function() {}
        };
        ActivationLink.func(newreq, newres, null);
        callback(null);

    }, function(err) {
        callback(err);
    });
}

function ActivateByEmailAndDeviceId(email, deviceid, domain, admin, pendingStatus, callback) {
    async.waterfall([
    function(callback) {
        Common.db.Activation.findAll({
            attributes : ['emailtoken'],
            where : {
                email : email,
                status : pendingStatus,
                deviceid : deviceid,
                maindomain : domain
            },
        }).complete(function(err, results) {
            if (!!err) {
                var msg = "approveUsers. Error on get emailtoken from email: " + email + ", err: " + err;
                logger.error(msg);
                callback(msg, null);
                return;
            }

            if (!results) {
                var msg = "approveUsers. ActivateByEmailAndDeviceId. Error on get emailtoken from email. Could not find email: " + email + ", deviceid: " + deviceid;
                logger.warn(msg);
                callback(msg, null);
                return;
            }

            callback(null, results);
        });
    },
    function(results, callback) {
        // log the event in event log
        eventLog.createEvent(eventLog.EV_CONST.EV_APPROVE_PENDING_ACTIVATION, admin, domain, "Approved pending activation by admin for user " + email + "and device " + deviceid, eventLog.EV_CONST.INFO, function(err) {
            logger.error(err);
        });

        ActivateLinkByEmailToken(results, function(err) {
            callback(err);
        });

    }], function(err) {
        callback(err);
    });
}

function RemoveByEmailAndDeviceId(email, deviceid, domain, admin, pendingStatus, callback) {

   Common.db.Activation.update({
        status : 2
    }, {
        where : {
            email : email,
            status : pendingStatus,
            deviceid : deviceid,
            maindomain : domain
        }
    }).then(function() {
        eventLog.createEvent(eventLog.EV_CONST.EV_REMOVE_PENDING_ACTIVATION, admin, domain, "Update pending activation by admin for user " + email + "and device " + deviceid, eventLog.EV_CONST.INFO, function(err) {
            logger.error(err);
        });
        logger.log('info',`Activation denied. user: ${email}, device: ${deviceid}`,{
            mtype: "important",
            user: email,
            device: deviceid
        });

        callback(null);
        return;

    }).catch(function(err) {
        logger.info("Update pending activation, error: " + err);
        callback("Update pending activation failed");
        return;
    });
}

function removeAll(domain, admin, callback) {
    Common.db.Activation.update({
        status : 2
    }, {
        where : {
            status : 0,
            maindomain : domain
        }
    }).then(function() {
        // log the event
        eventLog.createEvent(eventLog.EV_CONST.EV_REMOVE_ALL_PENDING_ACTIVATION, admin, domain, "Update ALL pending activation by admin", eventLog.EV_CONST.INFO, function(err) {
            logger.error(err);
        });

        callback(null);
        return;

    }).catch(function(err) {
         logger.info("Update ALL pending activation, error: " + err);
        callback("Update pending activation failed");
        return;
    });
}

function activateAll(domain, admin, callback) {

    Common.db.Activation.findAll({
        attributes : ['emailtoken'],
        where : {
            maindomain : domain,
            status : 0
        },
    }).complete(function(err, results) {
        if (!!err) {
            var msg = "approveUsers. Error on get email from domain: " + domain + ", err: " + err;
            logger.error(msg);
            callback(msg);
            return;
        }

        if (!results) {
            var msg = "approveUsers. results is empty for domain: " + domain;
            logger.warn(msg);
            callback(msg);
            return;
        }

        // log the event in event log
        eventLog.createEvent(eventLog.EV_CONST.EV_APPROVE_ALL_PENDING_ACTIVATION, admin, domain, "Approved ALL pending activation by admin", eventLog.EV_CONST.INFO, function(err) {
            logger.error(err);
        });

        ActivateLinkByEmailToken(results, function(err) {
            callback(err);
        });
    });

}

function resetBiometricFunc(email, deviceID, mainDomain, approve, callback) {

    let obj = {
        status : Common.STATUS_OK,
        emailtoken: ""
    };
    if (approve == 'Y') {
        obj.biometric_token = "";
    }
    Common.db.Activation.update(obj, {
        where : {
            deviceid : deviceID,
            email: email,
            status: Common.STATUS_RESET_BIOMETRIC_PENDING
        }
    }).then(function() {
        callback(null);
        logger.info("ApproveUsers resetBiometricFunc: " + email+" @ "+deviceID);
        return;
    }).catch(function(err) {
        logger.error("ApproveUsers resetBiometricFunc: " + err);
        callback(err);
        return;
    });
}

function resetOTPFunc(email, deviceID, mainDomain, approve, callback) {

    let obj = {
        status : Common.STATUS_OK,
        emailtoken: ""
    };
    if (approve == 'Y') {
        obj.otp_token = "";
    }
    Common.db.Activation.update(obj, {
        where : {
            deviceid : deviceID,
            email: email,
            status: Common.STATUS_RESET_OTP_PENDING
        }
    }).then(function() {
        callback(null);
        logger.info("ApproveUsers resetOTPFunc: " + email+" @ "+deviceID);
        return;
    }).catch(function(err) {
        logger.error("ApproveUsers resetOTPFunc: " + err);
        callback(err);
        return;
    });
}

function resetPasscodeUser(email, deviceID, mainDomain, approve, callback) {

    let resetpasscode;
    if (approve == 'Y') {
        resetpasscode = 1;
    } else {
        resetpasscode = 0;
    }
    Common.db.Activation.update({
        status : Common.STATUS_OK,
        emailtoken: "",
        resetpasscode: resetpasscode
    }, {
        where : {
            deviceid : deviceID,
            email: email,
            status: Common.STATUS_RESET_PASSCODE_PENDING
        }
    }).then(function() {
        callback(null);
        logger.info("ApproveUsers resetPasscodeUser: " + email+" @ "+deviceID);
        return;
    }).catch(function(err) {
        logger.error("ApproveUsers resetPasscodeUser: " + err);
        callback(err);
        return;
    });
}

function unlockUser(email, deviceID, mainDomain, callback) {
    Common.db.UserDevices.update({
        loginattempts : '0'
    }, {
        where : {
            email : email,
            imei : deviceID,
            maindomain: mainDomain
        }
    }).then(function() {
        callback(null);
        //logger.info("ApproveUsers unlockPassword");
        return;
    }).catch(function(err) {
        logger.error("ApproveUsers unlockPassword: " + err);
        callback(err);
        return;
    });
}

function ApproveUsers(req, res, domain, admin) {
    // https://???.nubosoftware.com/approveUsers?session=[]&email=[]&deviceId=[]&approve=Y/N&all=Y/N
    var email = req.params.email;
    var deviceId = req.params.deviceId;
    var all = req.params.all;
    var approve = req.params.approve;
    var approveType = req.params.approveType;
    logger.info("ApproveUsers: "+JSON.stringify(req.params,null,2));

    var isNeedToUnlock = false;
    var resetPasscode = false;
    var adminAccess = false;
    var adminReset = false;
    var resetBiometric = false;
    var resetOTP = false;


    if (approveType && (approveType == 'unlock passcode' || approveType == 'unlock admin')) {
        isNeedToUnlock = true;
    } else if (approveType && approveType == 'reset passcode') {
        resetPasscode = true;
    } else if (approveType && approveType == 'admin') {
        adminAccess = true;
    } else if (approveType && approveType == 'admin reset') {
        adminReset = true;
    } else if (approveType && approveType == 'reset biometric') {
        resetBiometric = true;
    } else if (approveType && approveType == 'reset otp') {
        resetOTP = true;
    }

    if (!all || !approve) {
        var msg = "approveUsers. ERROR  Invalid parameters";
        logger.info(msg);
        res.send({
            status : "0",
            message : msg
        });
        return;
    }

    async.series([
    function(callback) {
        if (isNeedToUnlock) {
            unlockUser(email, deviceId, domain, function(err) {
                if (!err) {
                    logger.log('info',`Approve ${approveType}. user: ${email}, device: ${deviceId}`,{
                        mtype: "important",
                        user: email,
                        device: deviceId
                    });
                }
                callback(err);
            });
        } else if (resetPasscode) {

            resetPasscodeUser(email, deviceId, domain, approve, function(err) {
                if (!err) {
                    logger.log('info',`Approve ${approveType}. user: ${email}, device: ${deviceId}`,{
                        mtype: "important",
                        user: email,
                        device: deviceId
                    });
                }
                callback(err);
            });
        } else if (resetBiometric) {
            resetBiometricFunc(email, deviceId, domain, approve, function(err) {
                if (!err) {
                    logger.log('info',`Approve ${approveType}. user: ${email}, device: ${deviceId}`,{
                        mtype: "important",
                        user: email,
                        device: deviceId
                    });
                }
                callback(err);
            });
        } else if (resetOTP) {
            resetOTPFunc(email, deviceId, domain, approve, function(err) {
                if (!err) {
                    logger.log('info',`Approve ${approveType}. user: ${email}, device: ${deviceId}`,{
                        mtype: "important",
                        user: email,
                        device: deviceId
                    });
                }
                callback(err);
            });
        } else {
            if (approve == 'Y' && all === 'Y') {
                activateAll(domain, admin, function(err) {
                    callback(err);
                });

            } else if (approve == 'N' && all === 'Y') {
                removeAll(domain, admin, function(err) {
                    callback(err);
                });
            } else {
                if (!email) {
                    var msg = "ERROR - approveUsers: Invalid email";
                    logger.info(msg);
                    callback(msg);
                    return;
                }

                if (!deviceId) {
                    var msg = "approveUsers. ERROR  Invalid deviceId";
                    logger.info(msg);
                    callback(msg);
                    return;
                }

                let pendingStatus;
                if (adminAccess) {
                    pendingStatus = Common.STATUS_ADMIN_ACTIVATION_PENDING;
                } else if (adminReset) {
                    pendingStatus = Common.STATUS_ADMIN_RESET_PENDING;
                } else {
                    pendingStatus = 0;
                }

                if (approve == 'Y' && all == 'N') {
                    ActivateByEmailAndDeviceId(email, deviceId, domain, admin, pendingStatus, function(err) {
                        callback(err);
                    });
                } else if (approve == 'N' && all == 'N') {
                    RemoveByEmailAndDeviceId(email, deviceId, domain, admin, pendingStatus, function(err) {
                        callback(err);
                    });
                } else {
                    var msg = "Invalid approve request missing parameter";
                    logger.error(msg + ' remove Y or N');
                    callback(msg);
                }
            }
        }
    }], function(err) {
        if (err) {
            res.send({
                status : "0",
                message : err
            });
        } else {
            res.send({
                status : "1",
                message : "all users have been approved or removed successfully"
            });
        }
    });
}
