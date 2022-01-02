"use strict";

/* @author Ori Sharon
 *  In this class we delete the required profiles
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var qs = require('querystring');
var util = require('util');
var setting = require('../settings.js');
var async = require('async');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

// first call goes to here
function deleteProfiles(req, res, next) {
    // http://login.nubosoftware.com/deleteProfiles?session=[]&email=[]]&email=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var email = req.params.email;
    if (!email || email == "") {
        logger.info("deleteProfiles. Invalid email");
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

        var domain = "";
        if (!setting.getDebugMode()) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }
            domain = login.loginParams.mainDomain;
        } else {
            domain = "nubosoftware.com";
        }

        // checks if we get multiple profiles or just one
        if (!util.isArray(email)) {
            email = [email];
        }

        async.each(email, function(email, cb) {
            deleteProfilesFromDB(domain, res, email, function(err) {
                if (err) {
                    cb(err);
                    return;
                }
                cb(null);
            });
        }, function(err) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;

            }
            // if we didn't receive any error, then we send this response back
            res.send({
                status : '1',
                message : "The profile was deleted successfully"
            });
            return;
        });

    });
}

function deleteProfilesFromDB(domain, res, email, callback) {

    // delete the user from db
    Common.db.User.destroy({
        where : {
            email : email,
            orgdomain : domain
        }
    }).then(function() {

        deleteUserApps(res, email, function(err) {
            if (err) {
                callback(err);
                return;
            }
            callback(null);
        });

    }).catch(function(err) {
        logger.info("deleteProfiles.js --> deleteProfilesFromDB:: " + err);
        callback(err);
        return;
    });

}

function deleteUserApps(res, email, callback) {

    // delete user_apps from db
    Common.db.UserApps.destroy({
        where : {
            email : email
        }
    }).then(function() {

        deleteUserDevices(res, email, function(err) {
            if (err) {
                callback(err);
                return;
            }
            callback(null);
        });

    }).catch(function(err) {
        logger.info("deleteProfiles.js --> deleteUserApps:: " + err);
        callback(err);
        return;
    });

}

function deleteUserDevices(res, email, callback) {

    // delete user_devices from db
    Common.db.UserDevices.destroy({
        where : {
            email : email
        }
    }).then(function() {

        deleteUserFromGroups(res, email, function(err) {
            if (err) {
                callback(err);
                return;
            }
            callback(null);
        });

    }).catch(function(err) {
        logger.info("deleteProfiles.js --> deleteUserDevices:: " + err);
        callback(err);
        return;
    });

}

function deleteUserFromGroups(res, email, callback) {

    // delete user_groups from db
    Common.db.UserGroups.destroy({
        where : {
            email : email
        }
    }).then(function() {

        deleteUserFromActivation(res, email, function(err) {
            if (err) {
                callback(err);
                return;
            } else {
                deleteUserFromDeviceApps(res, email, function(err) {
                    if (err) {
                        callback(err);
                        return;
                    }
                    callback(null);
                });
            }
        });

    }).catch(function(err) {
        logger.info("deleteProfiles.js --> delete UserFromGroups: " + err);
        callback(err);
        return;
    });

}

function deleteUserFromActivation(res, email, callback) {

    // delete user_groups from db
    Common.db.Activation.destroy({
        where : {
            email : email
        }
    }).then(function() {
        Common.redisClient.smembers('usersess_'+email, function(err, replies) {
        if (err) {
            var errormsg = 'cant get sessions: ' + err;
            logger.info(errormsg);
            callback(errormsg);
            return;
        }

        if (replies && replies != "") {
            replies.forEach(function(row) {
                Common.redisClient.zadd('suspend_sessions', 0 , row ,function(err){
                    if (err) {
                        var errormsg = 'cant add session to suspend list: ' + err;
                        logger.info(errormsg);
                        callback(errormsg, 0);
                    }
                    callback(null, 1);
                });
            });
        } else {
            callback(null);
        }

    }); // Common.redisClient.get

    }).catch(function(err) {
        logger.info("deleteProfiles.js --> delete activation error: " + err);
        callback(err);
        return;
    });

}

function deleteUserFromDeviceApps(res, email, callback) {
    // delete device_apps from db
    Common.db.DeviceApps.destroy({
        where : {
            email : email
        }
    }).then(function() {
        callback(null);
    }).catch(function(err) {
        logger.info("deleteProfiles.js --> delete DeviceApps error: " + err);
        callback(err);
        return;
    });
}

var DeleteProfiles = {
    get : deleteProfiles,
    deleteProfilesFromDB
};

module.exports = DeleteProfiles;
