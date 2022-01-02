"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var util = require('util');
var async = require('async');
var User = require('../user.js');

var EMPTY_GROUP = 'emptyGroupName';

var AddAppsToProfiles = require('./addAppsToProfiles.js');

/**
 * Install apps to users and groups, updating the tables in DB and installing
 * the app to the users
 *
 * @param req
 *                session, packageName, group(optional), email(optional)
 * @param res
 * @param next
 */
function installApps(req, res, next) {
    // https://login.nubosoftware.com/installApps?session=[]&groupName=[]&email=[]&packageName=[]&adDomain=[adDomain]&appStoreOnly=0
    res.contentType = 'json';
    var status = 1;
    var msg = "";
    // get the groups, profiles and packageNames
    var emails = req.params.email;
    var groups = req.params.groupName;
    var adDomain = req.params.adDomain;
    var packageNames = req.params.packageName;
    var isPrivateApp = req.params.privateApp;
    var isAppStoreOnly = req.params.appStoreOnly;
    logger.info(`installApps. emails: ${emails}, groups: ${groups}, adDomain: ${adDomain}, packageNames: ${packageNames}, isPrivateApp: ${isPrivateApp}, isAppStoreOnly: ${isAppStoreOnly}`);

    if ((!emails || emails == "") && (!groups || groups == "")) {
        status = 0;
        if (!emails || emails == "") {
            msg = "installApps: Invalid email";
        }

        if (groups == null || groups == "") {
            msg = "installApps: Invalid group: " + groups;
        }
    }
    if (emails != null && !util.isArray(emails)) {
        emails = [emails];
    }
    if (groups != null && !util.isArray(groups)) {
        groups = [groups];
    }
    if (!packageNames || packageNames == "") {
        logger.info("installApps. Invalid packageName");
        status = 0;
        msg = "Invalid parameters";
    }
    if (packageNames != null && !util.isArray(packageNames)) {
        packageNames = [packageNames];
    }
    if (adDomain == null) {
        logger.info("installApps. Invalid adDomains");
        msg = "Invalid parameters";
        adDomain = '';
    }
    if (!util.isArray(adDomain)) {
        adDomain = [adDomain];
    }

    if (!isPrivateApp == null || isPrivateApp == "") {
        isPrivateApp = AddAppsToProfiles.IS_PRIVATE_APP_TRUE;
    }
    if (isAppStoreOnly == null || isAppStoreOnly == "") {
        isAppStoreOnly = 0;
    }

    logger.info("installApps. isAppStoreOnly: "+isAppStoreOnly);

    if (emails) {
        emails.forEach(function(email) {
            if (email != null && !require('../nubo_regex.js').emailRegex.test(email)) {
                msg = "Invalid or missing params";
                status = 0;
            }
        });
    }
    if (groups) {
        groups.forEach(function(group) {
                if (status == 1 && group != null && (group.length <=0 || group.length > 100 || group.indexOf('\\\\') >= 0 || group.indexOf('./') >= 0 || group.indexOf(';') >= 0)) {
                msg = "Invalid or missing params";
                status = 0;
            }
        });
    }
    if (adDomain != '') {
        adDomain.forEach(function(domain) {
            if (!require('../nubo_regex.js').domainRegex.test(domain)) {
                msg = "Invalid or missing params";
                status = 0;
            }
        });
    }

    packageNames.forEach(function(packageName) {
            if (status == 1 && (packageName.length > 100 || packageName.indexOf('\\\\') >= 0 || packageName.indexOf('./') >= 0 || packageName.indexOf(';') >= 0)) {
            msg = "Invalid or missing params";
            status = 0;
        }
    });
    // If there was an error then send response
    if (status != 1) {
        res.send({
            status : status,
            message : msg
        });
        return;
    }
    var alredysend = false;
    var callback = function(err,callbackStatus,numUsers) {
        if (alredysend) {
            return;
        } else {
            alredysend = true;
        }
        if (err) {
            msg = err;
            status = 0;
            logger.info(msg);
        } else {
            if (callbackStatus) {
                status = callbackStatus;
            } else {
                status = 1;
            }
            msg = "Apps installed successfully";
        }
        logger.info("installApps: callback: " + msg);
        // Send response
        res.send({
            status : status,
            message : msg,
            numUsers: numUsers
        });
    };
    // Only sysAdmin can do this operation
    AddAppsToProfiles.loadAdminParamsFromSession(req, res, function(err, login) {
        if (login) {
            var domain = login.loginParams.mainDomain;
        }
        if (!setting.getDebugMode()) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }
        } else {
            domain = "nubosoftware.com";
        }

        logger.info("installApps: loaded admin");

        // for each group call addAppsToGroups
        addAppsToGroups(domain, adDomain, groups, packageNames, isAppStoreOnly, function(err,callbackStatus,numUsers) {
            if (err) {
                if (err != EMPTY_GROUP) {
                    callback(err);
                    return;
                } else {
                    logger.info('group name is empty');
                }
            }
            logger.info("installApps: added to groups");
            // for each profile call addAppsToProfilesInternal
            if (emails != null) {
                AddAppsToProfiles.addAppsToProfilesInternal(domain, emails, packageNames, isPrivateApp, isAppStoreOnly, function(err){
                    if (!numUsers) {
                        numUsers = emails.length;
                    } else {
                        numUsers +=  emails.length;
                    }
                    callback(null,callbackStatus,numUsers);
                });
            } else {
                callback(null,callbackStatus,numUsers);
            }
        });
    });
}

function addAppsToGroups(domain, adDomains, groups, packageNames, isAppStoreOnly, addAppsToGroupsCallback) {

    // domain is not really needed since a specific email can't be assigned to
    // different domains
    // Verify that the users are in the users table
    checkGroupInTable(groups, adDomains, function(err) {
        if (err) {
            addAppsToGroupsCallback(err);
            return;
        }
        // Verify that the apps are in the apps table
        AddAppsToProfiles.checkAppsInTable(packageNames, domain, function(err,missedPackageNames,resPackageNames) {
            if (err) {
                packageNames = resPackageNames;
                logger.info("checkAppsInTable. Need to remove the following missedPackageNames: "+missedPackageNames+", resPackageNames: "+packageNames);
            }

            var emails = new Array();
            // for each group update group_apps DB
            async.eachSeries(groups, function(groupName, cb) {
                var groupAdDomain = adDomains[groups.indexOf(groupName)];
                updateUserAppsTableForGroup(packageNames, groupName, domain, groupAdDomain, isAppStoreOnly, function(err) {
                    if (err) {
                        logger.info("updateUserAppsTableForGroup error: ",err);
                        cb(err);
                        return;
                    }

                    // get the users of the group

                    Common.db.UserGroups.findAll({
                        attributes : ['email'],
                        where : {
                            groupname : groupName,
                            maindomain : domain
                        },
                    }).complete(function(err, results) {

                        if (!!err) {
                            cb(err);
                            return;
                        }

                        if (!results || results == "") {
                            cb(null);
                            return;
                        }


                        results.forEach(function(row, err) {
                            emails.push(row.email != null ? row.email : '');
                        });
                        cb(null);
                        // install the app to all the users in the group
                    });

                });
            }, function(err) {
                var waitForInstall  = true;
                if  (emails.length > 10 ) {
                    waitForInstall = false;
                }
                AddAppsToProfiles.addAppsToProfilesInternal(domain, emails, packageNames, AddAppsToProfiles.IS_PRIVATE_APP_FALSE, isAppStoreOnly ,function(err){
                    if (waitForInstall) {
                        logger.info("addAppsToProfilesInternal. Call callback\n\n err: "+err);
                        addAppsToGroupsCallback(err,1,emails.length);
                    }
                });
                if (!waitForInstall) {
                    logger.info("addAppsToGroups. Call callback\n\n err: "+err);
                    addAppsToGroupsCallback(err,2,emails.length);

                }
            });
        });
    });
}

function checkGroupInTable(groups, adDomains, callback) {
    if (groups == null || groups.length < 1) {
        callback(EMPTY_GROUP);
        return;
    }
    async.eachSeries(groups, function(groupname, callback) {
        if (groupname == null || groupname == '') {
            callback(EMPTY_GROUP);
            return;
        }
        var groupAdDomain = adDomains[groups.indexOf(groupname)];
        Common.db.Groups.findAll({
            attributes : ['groupname'],
            where : {
                groupname : groupname,
                addomain : groupAdDomain
            },
        }).complete(function(err, results) {

            if (!!err) {
                logger.info('Internal error: ' + err);
                callback(err);
                return;
            }

            if (!results || results == "") {
                callback('Group ' + groupname + ' not found');
                return;
            }

            callback(null);
        });

    }, function(err) {
        callback(err);
    });
}

function updateUserAppsTableForGroup(packageNames, groupname, domain, adDomain, isAppStoreOnly, callback) {
    let autoInstall = 1;
    if (isAppStoreOnly == 1 || isAppStoreOnly == '1') {
        autoInstall = 0;
    }
    // Go over all packages
    async.eachSeries(
        packageNames,
        function(packageName, callback) {
            // select groupApp
            Common.db.GroupApps.upsert({
                groupname : groupname,
                packagename : packageName,
                maindomain : domain,
                addomain : adDomain,
                auto_install: autoInstall
            }).then(function(results) {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        },
        function(err) {
            callback(err);
        }
    );
}

var installAppsMod = {
    addAppsToGroups : addAppsToGroups,
    get : installApps
};

module.exports = installAppsMod;
