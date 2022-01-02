"use strict";

/*
 * @author Ori Sharon In this class activate / deactive required profiles
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var async = require('async');
var util = require('util');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

function activateProfiles(req, res, next) {
    // https://login.nubosoftware.com/activateProfiles?session=[]&email[]&email=[]..
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var email = req.params.email;
    if (!email || email == "") {
        logger.info("activateProfiles. Invalid email");
        status = 0;
        msg = "";
    }

    var activate = req.params.activate;
    if (!activate || activate == "") {
        logger.info("activateProfiles. Invalid activate param");
        status = 0;
        msg = "Invalid parameters";
    } else if (activate != 'Y' && activate != 'N') {
        logger.info("activateProfiles. Activate should send Y / N variable");
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

    if (!util.isArray(email)) {
        email = [email];
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

            var domain = login.loginParams.mainDomain;
        } else {
            var domain = "nubosoftware.com";
        }

        async.each(email, function(email, callback) {
            checkIfProfileIsInDB(res, email, activate, domain, function(err, status) {
                if (err) {
                    callback(err);
                } else {
                    callback(null);
                }
            });
        }, function(err) {

            // if one of the profiles is missing in database, then return an
            // error
            if (err) {
                var jsonErr = JSON.stringify({
                    status : "0",
                    message : "err: " + err,
                });
                res.end(jsonErr);
                return;
            } else {
                if (activate == 'Y') {
                    msg = "activate profiles succeeded";
                } else {
                    msg = "deactivate profiles succeeded";
                }

                var json = JSON.stringify({
                    status : "1",
                    message : msg,
                });
                res.end(json);
                return;
            }
        });
    });
}

function checkIfProfileIsInDB(res, email, activate, domain, callback) {
    var errormsg = "";

    // before activate profile, check if he's found in database
    Common.db.User.findAll({
        attributes : ['email'],
        where : {
            email : email,
            orgdomain : domain
        },
    }).complete(function(err, obj) {

        if (!!err) {
            errormsg = 'Error on get profile: ' + err;
            callback(errormsg, 0);
            return;

        } else if (!obj || obj == "") {
            errormsg = "cannot find profiles";
            callback(errormsg, 0);
            return;

        } else {
            activateProfilesToDB(res, email, domain, activate, function(err, status) {
                if (err) {
                    callback(err);
                    return;
                }
                callback(null);
                return;
            });
        }
    });

}

function activateProfilesToDB(res, email, domain, activate, callback) {

    // activate specific profile
    if (activate == 'Y') {

        Common.db.User.update({
            isactive : 1
        }, {
            where : {
                email : email
            }
        }).then(function() {
            callback(null, 1);

        }).catch(function(err) {
            var errormsg = 'Error on activate profile: ' + err;
            callback(errormsg, 0);
            return;
        });

        // deactivate specific profile
    } else if (activate == 'N') {
        // disable user and set his subscription_id to EWS to -1
        Common.db.User.update({
            isactive : 0,
            subscriptionid : '-1',
            subscriptionupdatedate : new Date()
        }, {
            where : {
                email : email
            }
        }).then(function() {
            // add all the sessions of the user to suspend list
            Common.redisClient.smembers('usersess_' + email, function(err, replies) {
                if (err) {
                    var errormsg = 'cant get sessions: ' + err;
                    logger.info(errormsg);
                    callback(errormsg);
                    return;
                }

                if (replies && replies != "") {
                    replies.forEach(function(row) {
                        Common.redisClient.zadd('suspend_sessions', 0, row, function(err) {
                            if (err) {
                                var errormsg = 'cant add session to suspend list: ' + err;
                                logger.info(errormsg);
                                callback(errormsg, 0);
                            }
                            callback(null, 1);
                        });
                    });
                } else {
                    callback(null, 1);
                }

            });
            // Common.redisClient.get

        }).catch(function(err) {
            var errormsg = 'Error on deactivate profile: ' + err;
            callback(errormsg, 0);
            return;
        });

    }

}

var ActivateProfiles = {
    get : activateProfiles
};

module.exports = ActivateProfiles;
