"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var util = require('util');
var User = require('../user.js');
var AddAppsToProfiles = require('./addAppsToProfiles.js');
var GetAllApps = require('./getAllApps.js');
var async = require('async');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

/**
 * Get the profiles and the groups that have the app.
 *
 * @param req
 *                packageName
 * @param res
 *                status, message, emails, groups, groupusers
 * @param next
 */
function getProfilesFromApp(req, res, next) {

    // https://login.nubosoftware.com/getProfilesFromApp?session=[]&packageName

    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var packageName = req.params.packageName;
    if (!packageName || packageName == "") {
        logger.info("getProfilesFromApp. Invalid packageName");
        status = 0;
        msg = "Invalid parameters";
    }

    if (status != 1) {
        res.send({
            status : status,
            message : msg,
            emails : [],
            groups : [],
            groupusers : []
        });
        return;
    }

    loadAdminParamsFromSession(req, res, function(err, login) {

        if (!setting.getDebugMode()) {
            if (err) {
                res.send({
                    status : '0',
                    message : err,
                    emails : [],
                    groups : [],
                    groupusers : []
                });
                return;
            }
            var domain = login.loginParams.mainDomain;
        } else {
            var domain = "nubosoftware.com";
        }

        let extendedData = false;
        if (req.nubodata.adminLogin) {
            extendedData = true;
        }

        getProfilesAndGroupsOfApp(packageName, domain, extendedData, function(err, emails, groups, groupusers, totalNumOfUsers,appDetails) {
            if (err) {
                res.send({
                    status : 0,
                    message : err
                });
                return;
            }

            res.send({
                status : 1,
                message : err,
                emails : emails,
                groups : groups,
                groupusers : groupusers,
                totalNumOfUsers : totalNumOfUsers,
                appDetails: appDetails
            });
        });
    });
}

function getProfilesAndGroupsOfApp(packageName, domain, extendedData, callback) {

    var emailsArr = [];
    var groupsArr = [];
    var groupusersArr = [];
    var totalNumOfUsers = 0;
    let appDetails;

    async.series([
    // get the emails of the private users.
    function(callback) {
        var isPrivate = AddAppsToProfiles.IS_PRIVATE_APP_TRUE;
        getUsersOfPrivateApp(packageName, domain, isPrivate, extendedData, function(err, emails) {
            if (err) {
                callback(err);
                return;
            }
            emailsArr = emails;
            callback(null);
        });

    },

    // get the emails of the users that belogns to groups and have the app
    // installed.
    function(callback) {
        var isPrivate = AddAppsToProfiles.IS_PRIVATE_APP_FALSE;
        getUsersOfPrivateApp(packageName, domain, isPrivate, extendedData, function(err, groupsEmails) {
            if (err) {
                callback(err);
                return;
            }
            groupusersArr = groupsEmails;
            callback(null);
        });

    },

    function(callback) {
        GetAllApps.getAppDownloadsCount(null, packageName, domain, function(err, total) {
            if (err) {
                callback(err);
                return;
            }
            totalNumOfUsers = total;
            callback(null);
        });

    },

    // get the groups
    function(callback) {
        getGroupsOfApp(packageName, domain, function(err, groups) {
            if (err) {
                callback(err);
                return;
            }
            groupsArr = groups;
            callback(null);
        });
    },
    // GET the app details
    function(callback) {
        if (!extendedData) {
            callback(null);
            return;
        }
        getAppDetails(packageName, domain, function(err, details) {
            if (err) {
                callback(err);
                return;
            }
            appDetails = details;
            callback(null);
        });
    }
], function(err) {
        //logger.info('emails= ' + emailsArr + 'groups= ' + groupsArr + 'groupusersArr= ' + groupusersArr);
        callback(err, emailsArr, groupsArr, groupusersArr, totalNumOfUsers,appDetails);
    });
}


function getAppDetails (packageName, domain, callback) {
    Common.db.Apps.findOne({
        where : {
            packagename : packageName,
            maindomain : domain
        }
    }).then(appDetails => {
        let imageUrl = appDetails.imageurl;
        if (!imageUrl || imageUrl == "") {
            if (Common.appstore && Common.appstore.enable === true) {
                if (Common.appstore.extURL) {
                    imageUrl = Common.appstore.extURL;
                } else {
                    imageUrl = Common.appstore.url;
                }
            } else {
                imageUrl = "";
            }
            imageUrl += `/${domain}/repo/icons/${packageName}.${appDetails.versioncode}.png`;
            appDetails.imageurl = imageUrl;
        }
        callback(null,appDetails);
    }).catch(err => {
        callback(err);
    });
}

function getUsersOfPrivateApp(packageName, domain, isPrivate, extendedData, callback) {

    var emails = [];

    Common.db.UserApps.findAll({
        //attributes : ['email','user.firstname','user.lastname'],
        include: [{
            model: Common.db.User,
            required: true
        }],
        where : {
            packagename : packageName,
            maindomain : domain,
            private : isPrivate
        },
        limit: 5000
    }).complete(function(err, results) {

        //logger.info("getUsersOfPrivateApp. results: "+results+", err: "+err);
        if (!!err) {
            callback(err);
            return;
        }

        if (!results || results == "") {
            //logger.info('There are no users with the app: ' + packageName);
            callback(null, emails);
            return;
        }

        results.forEach(function(row) {
            //logger.info("Row: "+JSON.stringify(row, null, 2));
            if (extendedData) {
                emails.push({
                    email: row.email,
                    firstname: row.user.firstname,
                    lastname: row.user.lastname
                });
            } else {
                emails.push(row.email);
            }
        });
        callback(null, emails);
    });

}

function getGroupsOfApp(packageName, domain, callback) {

    var groups = [];

    Common.db.GroupApps.findAll({
        attributes : ['groupname','addomain'],
        where : {
            packagename : packageName,
            maindomain : domain
        },
    }).complete(function(err, results) {

        if (!!err) {
            callback(err);
            return;
        }

        if (!results || results == "") {
            //logger.info('There are no groups with the app: ' + packageName);
            callback(null, groups);
            return;
        }

        results.forEach(function(row) {
            var groupName = row.groupname != null ? row.groupname : '';
            var groupAdDomain = row.addomain != null ? row.addomain : '';
            var jsonGroup = {
               groupName : groupName,
               adDomain : groupAdDomain
            };
            groups.push(jsonGroup);
        });

        logger.info('groups= ' + groups);
        callback(null, groups);
    });
}

var GetProfilesFromApp = {
    get : getProfilesFromApp
};

module.exports = GetProfilesFromApp;
