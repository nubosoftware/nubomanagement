"use strict";

/*
 * @author Ori sharon In this class we receive all profiles within a specific
 * company
 */

var Common = require('../common.js');
var sessionModule = require('../session.js');
var setting = require('../settings.js');
var addAppModule = require('./addAppsToProfiles.js');
var deleteAppFromProfile = require('./deleteAppFromProfiles.js');
var StartSession = require('../StartSession.js');
var Login = require('../login.js');
var util = require('util');
var async = require('async');
var Session = sessionModule.Session;
var logger = Common.getLogger(__filename);
var packageName = [Common.controlPanelApp];

var time = new Date().getTime();
var hrTime = process.hrtime()[1];

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

// first call goes to here
function removeAdmins(req, res, next) {
    // https://login.nubosoftware.com/removeAdmins?session=[]&email=[]&email=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var email = req.params.email;
    if (!email || email == "" /* !validateEmail(email) */) {
        logger.info("removeAdmins. Invalid email " + email);
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
            removeAdminInDB(res, email, domain, function(err, status) {
                if (err) {
                    callback(err);
                } else {
                    callback(null);
                }
            });
        }, function(err) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }
            res.send({
                status : '1',
                message : "The admin was removed successfully"
            });
        });
    });
}

function removeAdminInDB(res, email, orgdomain, callback) {
    async.series([

    function(callback) {
        // update user in users table
        Common.db.User.update({
            isadmin : 0
        }, {
            where : {
                email : email,
                orgdomain : orgdomain
            }
        }).then(function () {
            callback(null);
            return;

        }).catch(function(err) {
            var msg = "Error while updating user values: " + err;
            logger.error(msg);
            callback(msg);
            return;
        });
    }, function(callback) {
        Common.db.Admin.destroy({
            where : {
                email : email,
                maindomain : orgdomain,
            }
        }).then(function() {
            callback(null);
        }).catch(function(err) {
            var msg = "Internal error: " + err;
            logger.info(msg);
            callback(err);
        });
    }, function(callback) {
        sessionModule.getSessionsOfUser(email, function(sessions) {
            async.eachSeries(sessions, function(session, callback) {
                StartSession.endSession(session.params.sessid, function(err) {
                    if (err) {
                        logger.warn("removeAdminInDB: " + err);
                        callback(null);
                        return;
                    }

                    callback(null);
                });
            }, callback);
        });
    }, function(callback) {
        deleteAppFromProfile.deleteAppFromProfilesInternal(email, packageName, orgdomain, addAppModule.IS_PRIVATE_APP_TRUE, function(err) {
            if (err) {
                callback(err);
                return;
            }
            callback(null);
        });
    } ], function(err) {
        if (err) {
            logger.info("Error - - - - " + err );
            callback(err, 0);
            return;
        }
        logger.info("Done...");
        callback(null, 1);
        return;
    });
}

var RemoveAdmins = {
    get : removeAdmins
};

module.exports = RemoveAdmins;
