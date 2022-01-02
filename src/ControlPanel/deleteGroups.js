"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var qs = require('querystring');
var util = require('util');
var async = require('async');
var setting = require('../settings.js');
var RemoveProfilesFromGroup = require('./removeProfilesFromGroup.js');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

/**
 * Delete a group and all its profiles that are in it
 *
 * @param req
 *                session, groupName
 * @param res
 *                status, message
 * @param next
 */
function deleteGroups(req, res, next) {
    // http://login.nubosoftware.com/deleteGroups?session=[]&groupName=[]&adDomain=[]
    res.contentType = 'json';
    var status = 1;
    var message = "";

    var groupName = req.params.groupName;
    if (!groupName || groupName == "") {
        logger.info("deleteGroups. Invalid groupName");
        status = 0;
        msg = "Invalid parameters";
    }
    var adDomain = req.params.adDomain;
    if (adDomain == null) {
        logger.info("deleteGroups. Invalid adDomain");
        status = 0;
        msg = "Invalid parameters";
    }

    if (status != 1) {
        res.send({
            status : status,
            message : message
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

        // checks if we get multiple groups or just one
        if (!util.isArray(groupName)) {
            groupName = [groupName];
        }
		if (!util.isArray(adDomain)) {
            adDomain = [adDomain];
        }
        logger.info(`deleteGroups. groupName: ${groupName}, adDomain: ${adDomain}`);
        // Delete all the groups (include thier users, apps and the apps from
        // the users)
        async.each(groupName, function(group, cb) {
            var groupAdDomain = adDomain[groupName.indexOf(group)];
            if (group == "All" && (groupAdDomain == "" || !groupAdDomain)) {
                cb("Cannot remove read only group");
                return;
            }
            selectProfilesFromGroup(group, domain, groupAdDomain, function(err, status) {
                logger.info('selectProfilesFromGroup: callback. err = ' + err + ' , status = ' + status + ' , group= ' + group);
                cb(err);
            });
        }, function(err) {
            var msg = err ? 'Error ' + err : 'The group was deleted successfully';
            if (err) {
                status = 0;
            } else {
                status = 1;
            }
            logger.info('selectProfilesFromGroup: status= ' + status + ' , msg= ' + msg);
            res.send({
                status : status,
                message : msg
            });
        });

    });
}

function selectProfilesFromGroup(groupName, domain, adDomain, callback) {

    //logger.info('selectProfilesFromGroup: enter');

    var status = 0;

    Common.db.UserGroups.findAll({
        attributes : ['email'],
        where : {
            groupname : groupName,
            maindomain : domain,
            addomain : adDomain
        },
    }).complete(function(err, results) {

        if (!!err) {
            logger.info(err);
            callback(err, 0);
            return;
        }

        /*if (!results || results == "") {
            deleteGroupFromDB(groupName, domain, adDomain, function(err) {
                status = 1;
                callback(err, status);
                return;
            });
            return;
        }*/

        var emails = [];
        async.each(results, function(row, cb) {
            var email = row.email;
            emails.push(email);

        }, function(err) {
            if (err) {
                callback(err, status);
                return;
            }
        });

        async.series([

        // Remove Profiles From Group
        function(callback) {
            if (emails.length == 0) {
                callback(null);
                return;
            }
            RemoveProfilesFromGroup.removeProfilesFromGroupInternal(groupName, domain, emails, adDomain, function(err) {
                if (err == 'The group: ' + groupName + ' has no apps') {
                    callback(null);
                } else {
                    callback(err);
                }
                return;
            });
        },
        // Delete the group's apps
        function(callback) {
            deleteAllGroupAppsFromDB(groupName, domain, adDomain, function(err) {
                callback(err);
                return;
            });
        },

        // Delete the group from the DB
        function(callback) {
            deleteGroupFromDB(groupName, domain, adDomain, function(err) {
                callback(err);
                return;
            });
        }], function(err) {
            if (err) {
                logger.info(new Error().Stack);
            }
            status = err ? 0 : 1;
            callback(err, status);
        });

    });

}

function deleteAllGroupAppsFromDB(groupName, domain, adDomain, callback) {
    if (groupName == null || groupName == '') {
        callback(null);
        return;
    }

    Common.db.GroupApps.destroy({
        where : {
            groupname : groupName,
            addomain : adDomain,
            maindomain : domain
        }
    }).then(function() {

        callback();

    }).catch(function(err) {
        logger.info(err);
        callback(err);
    });

}

function deleteGroupFromDB(groupName, domain, adDomain, callback) {
    if (groupName == null || groupName == '') {
        console.log('deleteGroupFromDB is null');
        callback(null);
        return;
    }

    Common.db.Groups.destroy({
        where : {
            groupname : groupName,
            maindomain : domain,
            addomain : adDomain

        }
    }).then(function() {
        //console.log('deleteGroupFromDB ok');
        callback();

    }).catch(function(err) {
        console.log('deleteGroupFromDB err : ' + err);
        logger.info('Error: deleteGroupFromDB: ' + err);
        callback(err);
    });

}

var DeleteGroups = {
    get : deleteGroups,
    selectProfilesFromGroup : selectProfilesFromGroup
};

module.exports = DeleteGroups;
