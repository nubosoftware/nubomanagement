"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var GetGroupDetails = require('./getGroupDetails.js');
var AddAppsToProfiles = require('./addAppsToProfiles.js');
var DeleteAppFromProfiles = require('./deleteAppFromProfiles.js');
var util = require('util');
var async = require('async');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

function removeProfilesFromGroup(req, res, next) {
    // https://login.nubosoftware.com/removeProfilesFromGroup?session=[]&groupName=[]&email=[]&adDomain=[adDomain]..
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var emails = req.params.email;
    if (!emails || emails == "") {
        logger.info("removeProfilesFromGroup. Invalid email");
        status = 0;
        msg = "Invalid parameters";
    }

    var groupName = req.params.groupName;
    if (!groupName || groupName == "") {
        logger.info("removeProfilesFromGroup. Invalid groupName");
        status = 0;
        msg = "Invalid parameters";
    }

    var adDomain = req.params.adDomain;
    if (adDomain == null) {
        logger.info("removeProfilesFromGroup. Invalid adDomain");
        status = 0;
        msg = "Invalid parameters";
    }

    if (groupName == "All" && (adDomain == "" || !adDomain)) {
        logger.info("removeProfilesFromGroup. Cannot modify read only group");
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

        checkIfGroupIsInDB(emails, groupName, domain, function(err, status) {
            if (err) {
                res.send({
                    status : status,
                    message : err
                });
                return;
            }
            removeProfilesFromGroupInternal(groupName, domain, emails, adDomain, function(err) {
                if (err) {
                    res.send({
                        status : 0,
                        message : err
                    });
                } else {
                    res.send({
                        status : 1,
                        message : "The profiles were removed from the group successfully"
                    });
                }
                return;
            });
        });
    });
}

function checkIfGroupIsInDB(emails, groupName, domain, callback) {

    Common.db.Groups.findAll({
        attributes : ['groupname'],
        where : {
            groupname : groupName,
            maindomain : domain
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

function removeProfilesFromGroupInternal(groupName, domain, emails, adDomain, callback) {

    // get The group's apps
    GetGroupDetails.getGroupApps(groupName, domain, adDomain, function(err, apps) {

        if (err) {
            if (err != 'The group: ' + groupName + ' has no apps') {
                callback(err);
                return;
            }
        }
        if (groupName == "") {
            logger.info('Error: removeProfilesFromGroupInternal: group name is empty.');
        }

        async.each(emails, function(email, cb) {

            deleteProfilesFromGroupInDB(email, groupName, domain, adDomain, function(err, login) {
                if (err) {
                    cb('Error on delete profile from group ' + err);
                    return;
                }
                // remove the non private apps of the group from the user.
                async.eachSeries(apps, function(app, callback) {
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
                            callback(err);
                            return;

                        }

                        if (results != null && results.length > 0 && (results[0].private != null ? results[0].private : '') == AddAppsToProfiles.IS_PRIVATE_APP_TRUE) {
                            logger.info('The app: ' + packagename + ' is a private app, so it will not removed from: ' + email);
                            callback(null);
                            return;
                        }

                        // check if the application is not belong to
                        // other groups as well that the user belongs
                        // to.
                        isAppBelongsToOtherGroupsOfTheUser(email, groupName, domain, adDomain, packagename, function(err, isAppBelongsToOtherGroups) {

                            if (err) {
                                callback(err);
                                return;
                            }

                            if (!isAppBelongsToOtherGroups) {
                                // uninstall the apps of the group from the user
                                logger.info('isAppBelongs::Delete AppFromProfilesInternal: email= ' + email + ' , packagename= ' + packagename);
                                DeleteAppFromProfiles.deleteAppFromProfilesInternal(email, [packagename], domain, AddAppsToProfiles.IS_PRIVATE_APP_FALSE, function(err) {
                                    callback(err);
                                    return;
                                });
                            } else {
                                callback(null);
                            }
                        });

                    });

                }, cb);
            });

        }, function(err) {
            //logger.info('getGroupApps: finally.');
            callback(err);
            return;
        });
    });
}

function isAppBelongsToOtherGroupsOfTheUser(email, groupName, domain, adDomain ,packagename, callback) {
    var isAppBelongsToOtherGroups = false;

    Common.db.GroupApps.findAll({
        attributes : ['groupname'],
        where : {
            maindomain : domain,
            packagename : packagename,
            addomain : adDomain
        },
    }).complete(function(err, results) {

        if (!!err) {
            callback(err);
            return;
        }

        if (results.length > 1) {

            async.eachSeries(results, function(row, cb) {

                var currentGroup = row.groupname != null ? row.groupname : '';
                if (currentGroup != groupName && !isAppBelongsToOtherGroups) {

                    // for each group check if the user is a member of the group
                    Common.db.UserGroups.findAll({
                        attributes : ['email'],
                        where : {
                            email : email,
                            groupname : currentGroup,
                            addomain : adDomain
                        },
                    }).complete(function(err, results) {

                        if (!!err) {
                            cb(err);
                            return;

                        }

                        if (!results || results == "") {
                            // the user is not belongs to the current group
                            cb(null);
                            return;

                        }

                        // The user belongs to the current group
                        isAppBelongsToOtherGroups = true;
                        cb(null);
                        return;
                    });
                } else {
                    cb(null);
                }

            }, function(err) {
                callback(err, isAppBelongsToOtherGroups);
            });
        } else {
            callback(null, isAppBelongsToOtherGroups);
        }

    });

}

function deleteProfilesFromGroupInDB(email, groupName, domain, adDomain, callback) {

    // delete the user from db
    Common.db.UserGroups.destroy({
        where : {
            email : email,
            groupname : groupName,
            maindomain : domain,
            addomain : adDomain
        }
    }).then(function() {

        callback(null);
        return;

    }).catch(function(err) {
        callback(err);
        return;
    });

}

var RemoveProfilesFromGroup = {
    get : removeProfilesFromGroup,
    removeProfilesFromGroupInternal : removeProfilesFromGroupInternal,
    isAppBelongsToOtherGroupsOfTheUser : isAppBelongsToOtherGroupsOfTheUser
};

module.exports = RemoveProfilesFromGroup;
