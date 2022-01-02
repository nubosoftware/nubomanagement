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
var async = require('async');
var platformModule = require('../platform.js');
var Platform = platformModule.Platform;

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

/**
 * Delete a specific app from profiles
 *
 * @param req
 *                session, packageName, email
 * @param res
 * @param next
 */
function deleteAppFromProfiles(req, res, next) {
    // http://login.nubosoftware.com/deleteAppFromProfiles?session=[]&email=[]&email=[]&packageName=[packageName]

    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var emails = req.params.email;
    if (!emails || emails == "") {
        logger.info("deleteAppFromProfiles. Invalid email");
        status = 0;
        msg = "Invalid parameters";
    }

    var packageName = req.params.packageName;
    if (!packageName || packageName == "") {
        logger.info("deleteAppFromProfiles. Invalid packageName");
        status = 0;
        msg = "Invalid parameters";
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

        var packageNames = [packageName];

        deleteAppFromProfilesInternal(emails, packageNames, domain, AddAppsToProfiles.IS_PRIVATE_APP_TRUE, function(err) {

            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }

            res.send({
                status : '1',
                message : "deleted app from profiles successfully"
            });
            return;
        });
    });
}

function deleteAppFromProfilesInternal(emails, packageNames, domain, isPrivateApp, callback) {

    // checks if we get multiple profiles or just one
    if (!util.isArray(emails)) {
        emails = [emails];
    }

    // Need to create a timestamp
    var time = new Date().getTime();
    var hrTime = process.hrtime()[1];

    if (emails.length < 1) {
        callback(null);
        return;
    }

    AddAppsToProfiles.checkAppsInTable(packageNames, domain, function (err, appType) {

        if (err) {
            callback(err);
            return;
        }
        async.eachSeries(emails, function (email, cb) {

            logger.info('addRemoveAppsForRunningUser: email= ' + email);
            AddAppsToProfiles.addRemoveAppsForRunningUser(time, hrTime, email, packageNames, domain, isPrivateApp, false, 0, appType, function (err) {

                if (err) {
                    cb('Error on delete app from profile ' + err);
                    return;
                }
                cb(null);
                return;

            });
        }, function (err) {
            callback(err);
        });
    });
}

function uninstallAPKForUserOnPlatforms(platforms, packageName, userIdInPlatforms, email, domain, callback) {
	//TODO remove rules for running user @email and domain - not used
    var platDeviceIdArr = [];
    for (var i = 0; i < platforms.length; ++i) {
        platDeviceIdArr[i] = {
            platform : platforms[i],
            localid : userIdInPlatforms[i]
        };
    }
    async.each(platDeviceIdArr, function(platObj, callback) {

        var platform = platObj.platform;
        var localid = platObj.localid;
        var tasks = [{
            packageName: packageName,
            unum: localid,
            task: 0
        }];
        platform.attachApps(tasks, function(err) {
            callback(err);
        });
    }, function(err) {
        callback(err);
    });
}

var DeleteAppFromProfiles = {
    get : deleteAppFromProfiles,
    uninstallAPKForUserOnPlatforms : uninstallAPKForUserOnPlatforms,
    deleteAppFromProfilesInternal : deleteAppFromProfilesInternal
};

module.exports = DeleteAppFromProfiles;
