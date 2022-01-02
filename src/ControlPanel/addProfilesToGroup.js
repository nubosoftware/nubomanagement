"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var AddAppsToProfiles = require('./addAppsToProfiles.js');
var GetGroupDetails = require('./getGroupDetails.js');
var util = require('util');
var async = require('async');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

/**
 * Add profiles to group
 *
 * @param req
 *                session, groupName, email..
 * @param res
 * @param next
 */
function addProfilesToGroup(req, res, next) {
    // https://login.nubosoftware.com/addProfilesToGroup?session=[]&groupName=[]&email=[]&email=[]&adDomain=[]..
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var emails = req.params.email;
    if (!emails || emails == "") {
        logger.info("addProfilesToGroup. Invalid email");
        status = 0;
        msg = "Invalid parameters";
    }

    var groupName = req.params.groupName;
    if (!groupName || groupName == "") {
        logger.info("addProfilesToGroup. Invalid groupName");
        status = 0;
        msg = "Invalid parameters";
    }
    var adDomain = req.params.adDomain;
    if (adDomain == null) {
        logger.info("addProfilesToGroup. Invalid adDomain");
        status = 0;
        msg = "Invalid parameters";
    }

    if (groupName == "All" && (adDomain == "" || !adDomain)) {
        logger.info("addProfilesToGroup. Cannot modify read only group");
        status = 0;
        msg = "Cannot modify read only group";
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
            var domain = login.loginParams.mainDomain;
        } else {
            var domain = "nubosoftware.com";
        }

        // checks if we get multiple profiles or just one
        if (!util.isArray(emails)) {
            emails = [emails];
        }

        checkIfGroupIsInDB(emails, groupName, domain, adDomain, function(err, status) {

            if (err) {
                res.send({
                    status : status,
                    message : err
                });
                return;
            }

            addProfilesToGroupInternal(groupName, domain, adDomain, false, emails, function(err) {
                if (err) {
                    res.send({
                        status : 0,
                        message : err
                    });
                } else {
                    res.send({
                        status : 1,
                        message : "Added profiles to group successfully"
                    });
                }
                return;
            });
        });
    });
}

function checkIfGroupIsInDB(emails, groupName, domain, adDomain, callback) {

    Common.db.Groups.findAll({
        attributes : ['groupname'],
        where : {
            groupname : groupName,
            maindomain : domain,
            addomain : adDomain
        },
    }).complete(function(err, results) {

        if (!!err) {
            callback("Internal error: " + err, 0);
            return;

        }

        if (!results || results == "") {
            callback("no group found", 1);
            return;

        }
        callback(null, 1);
    });

}

function addProfilesToGroupInternal(groupName, domain, adDomain, isFromAD, emails, callback) {

    // get the apps of the group and install the apps to the new inserted
    // profiles.
    GetGroupDetails.getGroupApps(groupName, domain, adDomain, function(err, apps) {
        if (err) {
            callback(err);
            return;
        }

        async.eachSeries(emails, function(email, cb) {
            insertProfilesToGroupInDB(email, groupName, domain, adDomain, isFromAD, function(err) {
                if (err) {
                    cb(err);
                    return;
                }

                // we add all the group's app to the user apps in case they not
                // already exists (not private)
                async.eachSeries(apps, function(app, callback2) {
                    //logger.info(`Check app ${app.packagename} with email ${email}`);
                    let auto_install = app.auto_install;
                    let packagename = app.packagename;
                    Common.db.UserApps.findAll({
                        attributes : ['private'],
                        where : {
                            email : email,
                            maindomain : domain,
                            packagename : packagename
                        },
                    }).complete(function(err, results) {

                        if (!!err) {
                            logger.info(new Error().stack);
                            callback2(err);

                            return;

                        }
                        if (results != null && results.length > 0 && results[0].private == AddAppsToProfiles.IS_PRIVATE_APP_TRUE) {
                            logger.info('The app: ' + packagename + ' is a private app, so it will not add to: ' + email);
                            callback2(null);
                            return;

                        } else {
                            //logger.info(`Adding app ${packagename}`);
                            // The app is not private OR not exists.
                            // install the apps of the group to the user
                            let isAppStoreOnly = (auto_install != 0 ? 0 : 1);
                            AddAppsToProfiles.addAppsToProfilesInternal(domain, email, [packagename], AddAppsToProfiles.IS_PRIVATE_APP_FALSE, isAppStoreOnly , callback2);
                        }

                    });

                }, cb);
            });

        }, function(err) {
            if (err) {
                callback("Internal error: " + err);
            } else {
                callback(null);
            }
        });

    });
}

function insertProfilesToGroupInDB(email, groupName, domain, adDomain, isFromAD, callback) {

    Common.db.UserGroups.findAll({
        attributes : ['email', 'groupname', 'maindomain', 'addomain'],
        where : {
            email : email,
            groupname : groupName,
            maindomain : domain,
            addomain : adDomain
        },
    }).complete(function(err, results) {

        if (!!err) {
            logger.error("err on select from user_groups:: " + err);
            callback(err);
            return;

        }
        if (!results || results == "") {

            Common.db.UserGroups.create({
                email : email,
                groupname : groupName,
                maindomain : domain,
                addomain : adDomain,
                status : isFromAD ? '1' : '0',
                adsync : isFromAD ? '1' : ''

            }).then(function(results) {
                callback(null);

            }).catch(function(err) {
                callback(err);
            });

        } else if (isFromAD){
            Common.db.UserGroups.update({
                status : '1',
                adsync : '1'
            }, {
                where : {
                    email : email,
                    groupname : groupName,
                    maindomain : domain,
                    addomain : adDomain
                }
            }).then(function() {
                callback('profile already exists in group');
            }).catch(function(err) {
                var msg = "insertProfilesToGroupInDB::Error while updating user_group values: " + err;
                logger.error(msg);
                callback(msg);
            });

        } else {
            callback('profile already exists in group');
        }
    });

}

var AddProfilesToGroup = {
    get : addProfilesToGroup,
    addProfilesToGroupInternal : addProfilesToGroupInternal
};

module.exports = AddProfilesToGroup;
