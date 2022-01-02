"use strict";

/*  @autor Ori Sharon
 *  in this class we get all profiles that are associated within a specific group.
 *  we send the group name and receive its details
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var async = require('async');
var setting = require('../settings.js');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

// first call goes to here
function getGroupDetails(req, res, next) {
    // https://login.nubosoftware.com/getGroupDetails?session=[]&groupName=[groupName]&adDomain=[adDomain]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var groupName = req.params.groupName;
    if (groupName == null || groupName == "") {
        logger.info("getGroupDetails. Invalid groupName");
        status = 0;
        msg = "Invalid parameters";
    }
    var adDomain = req.params.adDomain;
    if (adDomain == null) {
        logger.info("getGroupDetails. Invalid adDomain");
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
        // TODO - remove apps from groups
        getGroupDetailsFromDB(groupName, domain, adDomain, function(err, profiles, apps) {
            var status = '1';
            var message = 'The request was fulfilled';
            if (err) {
                status = '0';
                message = err;
            }
            var json = {
                status : status,
                message : message,
                groupName : groupName,
                profiles : profiles,
                apps : apps // TODO - remove apps from groups
            };
            res.send(json);
        });
    });
}

function getGroupDetailsFromDB(groupName, domain, adDomain, callback) {

    var profiles = [];
    var apps = [];
    // TODO - remove apps from groups
    async.series([
    function(callback) {

        getGroupApps(groupName, domain, adDomain, function(err, apps) {
            if (err != 'The group: ' + groupName + ' has no apps') {
                callback(err);
            } else {
                callback(null);
            }
        });
    },
    function(callback) {

        Common.db.UserGroups.findAll({
            attributes : ['email'],
            where : {
                maindomain : domain,
                addomain : adDomain,
                groupname : groupName
            },
        }).complete(function(err, results) {

            if (!!err) {
                callback('Error on get users from group: ' + err);
                return;
            }

            if (!results || results == "") {
                callback();
                return;
            }

            async.each(results, function(row, cb) {
                var email = row.email;
                // get all apps of current profile
                getProfileDetails(email, profiles, domain, function(err, results) {
                    if (err) {
                        cb('Error on get profile details ' + err);
                        return;
                    } else {
                        cb(null);
                    }
                });
            }, function(err) {
                callback(err);
            });

        });

    }],
    // This function will call after the series finished.
    function(err) {
        callback(err, profiles, apps);
        // TODO - remove apps from groups
    });
}

function getProfileDetails(email, profiles, domain, callback) {

    Common.db.User.findAll({
        attributes : ['email', 'firstname', 'lastname', 'isactive', 'imageurl'],
        where : {
            email : email,
            orgdomain : domain
        },
    }).complete(function(err, results) {

        if (!!err) {
            errormsg = 'Error on get user details: ' + err;
            callback(errormsg);
            return;
        }

        results.forEach(function(row) {
            var email = row.email != null ? row.email : '';
            var firstName = row.firstname != null ? row.firstname : '';
            var lastName = row.lastname != null ? row.lastname : '';
            var isActive = row.isactive != null ? row.isactive : 0;
            var imageUrl = row.imageurl != null ? row.imageurl : '';

            var jsonProfileApp = {
                email : email,
                firstName : firstName,
                lastName : lastName,
                isActive : isActive,
                imageUrl : imageUrl
            };

            profiles.push(jsonProfileApp);
        });
        callback(null);

    });

}

function getGroupApps(groupName, domain, adDomain, callback) {

    var apps = [];
    var msg = null;

    Common.db.GroupApps.findAll({
        attributes : ['packagename','auto_install'],
        where : {
            maindomain : domain,
            groupname : groupName,
            addomain : adDomain
        },
    }).complete(function(err, results) {

        if (!!err) {
            msg = 'Error on get apps from group: ' + err;
            logger.info(msg);
            callback(msg);
            return;

        }

        if (!results || results == "") {
            //logger.info('The group: ' + groupName + ' has no apps');
        } else {
            apps = results;
        }

        callback(msg, apps);
        return;
    });

}

var GetGroupDetails = {
    get : getGroupDetails,
    getGroupApps : getGroupApps
};

module.exports = GetGroupDetails;
