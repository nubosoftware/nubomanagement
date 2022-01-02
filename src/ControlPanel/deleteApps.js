"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var qs = require('querystring');
var util = require('util');
var setting = require('../settings.js');
var User = require('../user.js');
var AddAppsToProfiles = require('./addAppsToProfiles.js');
var DeleteAppFromProfiles = require('./deleteAppFromProfiles.js');
var RemoveProfilesFromGroup = require('./removeProfilesFromGroup.js');
var async = require('async');
var platformModule = require('../platform.js');
var Platform = platformModule.Platform;
var GetAllApps = require('./getAllApps.js');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

/**
 * Delete a specific app from profiles or group
 *
 * @param req
 *            session, packageName, groupName, email
 * @param res
 * @param next
 */
function deleteApps(req, res, next) {
    // http://login.nubosoftware.com/deleteApps?session=[]&groupName=[]&email=[]&email=[]&packageName=[packageName]&adDomain=[adDomain]

    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var emails = req.params.email;
    var groups = req.params.groupName;
    var adDomain = req.params.adDomain;

    if ((!emails || emails == "") && (!groups || groups == "") && (adDomain == null)) {
        status = 0;
        if (!emails || emails == "") {
            msg = "deleteApps: Invalid email";
        }

        if (groups == null || groups == "") {
            msg = "deleteApps: Invalid group: " + groups;
        }
        if (adDomain == null) {
            msg = "deleteApps: Invalid adDomain: " + adDomain;
        }
    }

    if (emails != null && !util.isArray(emails)) {
        emails = [emails];
    }
    if (groups != null && !util.isArray(groups)) {
        groups = [groups];
    }
    if (adDomain != null && !util.isArray(adDomain)) {
        adDomain = [adDomain];
    }

    var packageNames = req.params.packageName;
    if (!packageNames || packageNames == "") {
        status = 0;
        msg = "deleteApps: Invalid packageName";
    }
    if (packageNames != null && !util.isArray(packageNames)) {
        packageNames = [packageNames];
    }

    // If there was an error then send response
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
                    status : 0,
                    message : err
                });
                return;
            }
            var domain = login.loginParams.mainDomain;
        } else {
            var domain = "nubosoftware.com";
        }

        let sentResponse = false;


        let respTimeout = setTimeout( () => {
            if (!sentResponse) {
                sentResponse = true;
                res.send({
                    status : 1,
                    message : "long operation - delete apps in background"
                });
            }
        },5000);

        deleteAppsSeries(emails, groups, adDomain, packageNames, domain, function(err, totalNumOfUsers) {
            clearTimeout(respTimeout);
            if (err) {
                if (!sentResponse) {
                    sentResponse = true;
                    res.send({
                        status : 0,
                        message : err
                    });
                }
                logger.info("deleteApps failes",err);
                return;
            }
            logger.info("deleteApps succeed");
            if (!sentResponse) {
                sentResponse = true;
                res.send({
                    status : 1,
                    message : "Request was fulfilled",
                    totalNumOfUsers : totalNumOfUsers
                });
            }
            return;
        });


    });
}

function deleteAppsSeries(emails, groups, adDomain, packageNames, domain, callback) {
    var totalNumOfUsers = 0;
    // async.series for: deleteAppFromGroupsInternal,
    // deleteAppFromProfilesInternal
    async.series([
    function(callback) {
        logger.info('Delete App From GroupsInternal. groups= ' + groups);
        if (groups == null || groups.length < 1) {
            callback(null);
            return;
        }
        deleteAppsFromGroupsInternal(groups, adDomain, packageNames, domain, AddAppsToProfiles.IS_PRIVATE_APP_FALSE, function(err) {
            callback(err);
        });

    },
    function(callback) {
        logger.info('Delete App From ProfilesInternal. emails= ' + emails);
        if (emails == null || emails.length < 1) {
            callback(null);
            return;
        }
        DeleteAppFromProfiles.deleteAppFromProfilesInternal(emails, packageNames, domain, AddAppsToProfiles.IS_PRIVATE_APP_TRUE, function(err) {
            callback(err);
        });
    },
    function(callback) {
        logger.info('getUsersOfApp from delete Apps');

        // for now we know that we have only one package and we return the total
        // installed for this package
        GetAllApps.getAppDownloadsCount(null, packageNames[0], domain, function(err, total) {
            if (err) {
                callback(efuncrr);
                return;
            }
            totalNumOfUsers = total;
            callback(null);
        });

    }], function(err) {
        callback(err, totalNumOfUsers);
    });

}

function deleteAppsFromGroupsInternal(groups, adDomain, packageNames, domain, isPrivateApp, callback) {
    // checks if we get multiple groups or just one
    if (!util.isArray(groups)) {
        groups = [groups];
    }
    // Delete app for each group
    async.each(groups, function(groupName, cb) {
        var groupAdDomain = adDomain[groups.indexOf(groupName)];
        groupName = groupName.replace('_' + groupAdDomain, '');
        logger.info('deleteAppsFromSingleGroup: groupName= ' + groupName + ',adDomain= ' + groupAdDomain);
        deleteAppsFromSingleGroup(packageNames, groupName, domain, groupAdDomain, function(err) {
            if (err) {
                cb('Error on delete app from group ' + err);
                return;
            }
            cb(null);
            return;
        });

    }, function(err) {
        callback(err);
    });
}

function deleteAppsFromSingleGroup(packageNames, groupName, domain, adDomain, callback) {

    if (groupName == "") {
        logger.info('Error: deleteAppsFromSingleGroup: group name is empty.');
        callback('Empty groupName = ' + groupName);
        return;
    }

    // get the emails of the group
    getGroupEmails(groupName, domain, adDomain, function(err, emails) {

        if (err) {
            callback(err);
            return;
        }
        deleteAppsFromGroupSeries(groupName, domain, adDomain, emails, packageNames, function(err) {
            if (err) {
                callback(err);
                return;
            }

            // Delete the app from the group in the DB
            deleteAppsOfGroupFromDB(packageNames, groupName, domain, function(err) {
                callback(err);
            });
        });
    });
}

function getGroupEmails(groupName, domain, adDomain, callback) {

    var emails = [];
    Common.db.UserGroups.findAll({
        attributes : ['email'],
        where : {
            maindomain : domain,
            addomain : adDomain,
            groupname : groupName
        },
    }).complete(function(err, results) {

        if (!!err) {
            callback('Error on get users from group: ' + err, emails);
            return;
        }

        if (!results || results == "") {
            callback(null, emails);
            return;

        }

        results.forEach(function(row) {
            if (row.email != null ? row.email : '') {
                emails.push(row.email);
            }
        });
        callback(null, emails);

    });

}

function deleteAppsOfGroupFromDB(packageNames, groupName, domain, callback) {
    if (packageNames == null || groupName == null || groupName == '') {
        callback('some field are empty. groupName= ' + groupName + ' ,packageNames= ' + packageNames);
        return;
    }
    // remove the non private apps of the group from the user.
    async.eachSeries(packageNames, function(packageName, callback2) {

        Common.db.GroupApps.destroy({
            where : {
                groupname : groupName,
                maindomain : domain,
                packagename : packageName
            }
        }).then(function() {

            callback2(null);
        }).catch(function(err) {
            logger.info('Error deleteApps: DELETE from group_apps' + err);
            callback2(err);
        });

    }, callback);
}

function deleteAppsFromGroupSeries(groupName, domain, adDomain, emails, packageNames, callback) {

    async.each(emails, function(email, cb) {

        // remove the non private apps of the group from the
        // user.
        async.eachSeries(packageNames, function(packageName, callback) {

            Common.db.UserApps.findAll({
                attributes : ['private'],
                where : {
                    email : email,
                    maindomain : domain,
                    packagename : packageName
                },
            }).complete(function(err, results) {

                if (!!err) {
                    logger.info(new Error().stack);
                    callback(err);
                    return;
                }

                if (results != null && results.length > 0 && (results[0].private != null ? results[0].private : '') == AddAppsToProfiles.IS_PRIVATE_APP_TRUE) {
                    logger.info('The app: ' + packageName + ' is a private app, so it will not removed from: ' + email);
                    callback(null);
                    return;
                }

                // check if the application is not belong to other groups as
                // well that the user belongs to.
                RemoveProfilesFromGroup.isAppBelongsToOtherGroupsOfTheUser(email, groupName, domain, adDomain, packageName, function(err, isAppBelongsToOtherGroups) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    if (!isAppBelongsToOtherGroups) {
                        // uninstall the apps of the group from the user
                        logger.info('deleteAppFromGroupSeries::isAppBelongs: email= ' + email + ' , packagename= ' + packageName);
                        DeleteAppFromProfiles.deleteAppFromProfilesInternal(email, packageNames, domain, AddAppsToProfiles.IS_PRIVATE_APP_FALSE, function(err) {

                            callback(err);
                        });
                        return;
                    }
                    callback(null);
                });

            });

        }, cb);

    }, function(err) {
        callback(err);
        return;
    });
}

var DeleteApps = {
    get : deleteApps,
    deleteAppsFromGroupsInternal : deleteAppsFromGroupsInternal
};

module.exports = DeleteApps;
