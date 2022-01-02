"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var util = require('util');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

function activateDevice(req, res, next) {
    // https://login.nubosoftware.com/activateProfiles?session=[]&email[]&email=[]..
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var email = req.params.email;
    if (!email || email == "") {
        logger.info("activateDevice. Invalid email");
        status = 0;
        msg = "Invalid parameters";
    }

    var imei = req.params.imei;
    if (!imei || imei == "") {
        logger.info("activateDevice. Invalid IMEI");
        status = 0;
        msg = "Invalid parameters";
    }

    var activate = req.params.activate;
    if (!activate || activate == "") {
        logger.info("activateDevice. Invalid activate param");
        status = 0;
        msg = "Invalid parameters";
    } else if (activate != 'Y' && activate != 'N') {
        logger.info("activateDevice. Activate should send Y / N variable");
        status = 0;
        msg = "Invalid parameters";
    }

    if (status != 1) {
        res.send({
            status : status,
            message : msg
        });
        return;
    }

    loadAdminParamsFromSession(req, res, function(err, login) {

        if (!setting.getDebugMode()) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }
        }

        checkIfDeviceIsInDB(res, email, imei, activate);

    });
}

function checkIfDeviceIsInDB(res, email, imei, activate) {

    // before activate profile, check if he's found in database
    Common.db.UserDevices.findAll({
        attributes : ['email'],
        where : {
            email : email,
            imei : imei
        },
    }).complete(function(err, results) {

        if (!!err) {
            logger.info(err);
            res.send({
                status : '0',
                message : "Internal error"
            });
            return;

        } else if (!results || results == "") {
            logger.info("No device found");
            res.send({
                status : '0',
                message : "Invalid parameters"
            });
            return;

        } else {
            activateDeviceToDB(res, email, imei, activate);
        }
    });

}

function activateDeviceToDB(res, email, imei, activate) {
    var msg = "";

    // activate the required device
    if (activate == 'Y') {

        Common.db.UserDevices.update({
            active : '1'
        }, {
            where : {
                email : email,
                imei : imei
            }
        }).then(function() {
            res.send({
                status : '1',
                message : "activated device successfully"
            });
            return;
        }).catch(function(err) {
            logger.info(err);
            res.send({
                status : '0',
                message : "Internal error"
            });
            return;
        });

        // deactivate the required device
    } else if (activate == 'N') {

        Common.db.UserDevices.update({
            active : '0'
        }, {
            where : {
                email : email,
                imei : imei
            }
        }).then(function() {
             addUserDeviceToSuspendList(email, imei);
             res.send({
                status : '0',
                message : "deactivated device successfully"
            });
            return;
        }).catch(function(err) {
            logger.info(err);
            res.send({
                status : '0',
                message : "Internal error"
            });
            return;
        });
    }

    /*
     if (activate == 'Y') {
     msg = "activated device successfully";
     } else {
     msg = "deactivated device successfully";
     }
     res.send({
     status : '1',
     message : msg
     });
     return;
     */
}

function addUserDeviceToSuspendList(email, imei) {

    // add the user device to suspend list
    Common.redisClient.smembers('usersess_' + email, function(err, replies) {
        if (err) {
            var errormsg = 'cant get sessions: ' + err;
            logger.info(errormsg);
            return;
        }
        if (!replies || replies == "") {
            var errormsg = 'sessions is null or empty: ' + err;
            logger.info(errormsg);
            return;
        }

        // get all active sessions of the user
        replies.forEach(function(row) {

            // get loginToken from session
            Common.redisClient.hget("sess_" + row, "loginToken", function(err, result) {
                if (err) {
                    var msg = "Cannot get HGET sess_" + row + " loginToken";
                    logger.info(msg);
                }

                // get deviceID from loginToken
                Common.redisClient.hget("login_" + result, "deviceID", function(err, result) {
                    if (err) {
                        var msg = "Cannot get HGET login_" + row + " deviceID";
                        logger.info(msg);
                    }

                    // if true, add the required deviceID to suspend list
                    if (result === imei) {
                        Common.redisClient.zadd('suspend_sessions', 0, row, function(err) {
                            if (err) {
                                var errormsg = 'cant add session to suspend list: ' + err;
                                logger.info(errormsg);
                            }
                        });
                    }
                });
            });
        });

    });
    // Common.redisClient.get
}

var ActivateDevice = {
    get : activateDevice
};

module.exports = ActivateDevice;
