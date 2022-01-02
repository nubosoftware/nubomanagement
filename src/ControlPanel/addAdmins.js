"use strict";

/*
 * @author Ori sharon In this class we receive all profiles within a specific
 * company
 */

var Common = require('../common.js');
var sessionModule = require('../session.js');
var addAppModule = require('./addAppsToProfiles.js');
var Login = require('../login.js');
var util = require('util');
var async = require('async');
var Session = sessionModule.Session;
var logger = Common.getLogger(__filename);
var packageName = Common.controlPanelApp;
var appName = "Control Panel";
var StartSession = require('../StartSession.js');

function loadAdminParamsFromSession(req, res, callback) {
    require('../settings.js').loadAdminParamsFromSession(req, res, callback);
}


function getAdmin(req,res) {
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var email = req.params.email;
    if (!email || email == "" /* !validateEmail(email) */) {
        logger.info("addAdmins. Invalid email " + email);
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
        if (err) {
            res.send({
                status : '0',
                message : err
            });
            return;
        }
        var domain = login.loginParams.mainDomain;
        getAdminInDB(email, domain, function(err, details) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }
            res.send({
                status : '1',
                message : "Request was fulfilled",
                details
            });
        });

    });
}

function getAdminInDB(email, orgdomain, callback) {
    Common.db.User.findAll({
        attributes : ['email', 'username', 'firstname', 'lastname', 'isactive', 'isadmin'],
        where: {
            email: email,
            orgdomain: orgdomain,
            isadmin: 1
        },
        include: [
            {
                model: Common.db.Admin,
                where : {
                    maindomain : orgdomain,
                }
            }
        ]
    }).then(results => {
        if (results && results.length == 1) {
            callback(null,results[0]);
        } else {
            callback("Admin not found: "+email+","+orgdomain);
        }
    }).catch(err => {
        logger.error("Error in getAdminInDB",err);
        callback(err);
    });
}

// first call goes to here
function addAdmins(req, res, next) {
    // https://login.nubosoftware.com/addAdmins?session=[]&email=[]&email=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var email = req.params.email;
    if (!email || email == "" /* !validateEmail(email) */) {
        logger.info("addAdmins. Invalid email " + email);
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

    var permissions = req.params.permissions;


    loadAdminParamsFromSession(req, res, function(err, login) {

        if (!require('../settings.js').getDebugMode()) {

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
            setAdminInDB(email, domain, permissions, function(err, status) {
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
                message : "The admin was added successfully"
            });
        });
    });
}

function setAdminInDB(email, orgdomain, permissions, callback) {
    if (!permissions || permissions == "" ) {
        permissions = "{}";
    }
    async.series([

    function(callback) {
        Common.db.User.update({
            isadmin : 1
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
    }, function (callback) {
        Common.db.Admin.upsert({
            email : email,
            maindomain : orgdomain,
            permissions : permissions,
        }).then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    }, function(callback) {
        // add control panel to table
        Common.db.UserApps.findAll({
            attributes : [ 'email', 'packagename', 'maindomain' ],
            where : {
                email : email,
                packagename : packageName,
                maindomain : orgdomain
            },
        }).complete(function(err, results) {
            if (!!err) {
                callback("Internal Error, select user_apps: " + err);
                return;
            }
            if (!results || results == "") {

                Common.db.UserApps.create({
                    email : email,
                    packagename : packageName,
                    maindomain : orgdomain
                }).then(function(results) {

                    callback(null);
                    return;
                }).catch(function(err) {
                    var msg = "Error while create UserApps: " + err;
                    logger.error(msg);
                    callback(msg);
                    return;
                });

            } else {
                callback(null);
                return;
            }
        });
    }, function(callback) {
        sessionModule.getSessionsOfUser(email, function(sessions) {
            async.eachSeries(sessions, function(session, callback) {
                StartSession.endSession(session.params.sessid, function(err) {
                    if (err) {
                        logger.error("setAdminInDB: " + err);
                        callback(null);
                        return;
                    }

                    callback(null);
                });
            }, callback);
        });
    }, function(callback) {
        var time = new Date().getTime();
        var hrTime = process.hrtime()[1];

        addAppModule.installAppsForRunningUsers(time, hrTime, [email], [packageName], orgdomain, 1, 0, "apk",function(err) {
            if (err) {
                var msg = "Error while installAppsForRunningUsers: " + err;
                logger.info(msg);
                callback(msg);
                return;
            }

            msg = "Control Panel installed successfully.\n Thats it, you have admin privilege...";
            logger.info(msg);
            callback(null);
            return;
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

var AddAdmins = {
    get : addAdmins,
    setAdminInDB : setAdminInDB,
    getAdmin
};

module.exports = AddAdmins;
