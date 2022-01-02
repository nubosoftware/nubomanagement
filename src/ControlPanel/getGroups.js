"use strict";

/*  @autor Ori Sharon
 *  in this class we get all profiles that are associated within a specific group.
 *  we send the group name and receive its details
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var async = require('async');
var ThreadedLogger = require('../ThreadedLogger.js');
var setting = require('../settings.js');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

// first call goes to here
function getGroups(req, res, next) {
    // https://login.nubosoftware.com/getGroups?session=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";
    var logger = new ThreadedLogger(Common.getLogger(__filename));

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
                logger.error(req.url + " failed with err: " + err);
                res.send({
                    status : '0',
                    message : err
                });
                logger.logTime("Request getGroups finished");
                return;
            }
            var domain = login.loginParams.mainDomain;
            logger.user(login.getEmail());
        } else {
            var domain = "nubosoftware.com";
        }

        getGroupsInternal(domain, function(err, groups) {
            var resObj;
            if(err) {
                logger.error(req.url + " failed with err: " + err);
                resObj = {
                    status : '0',
                    message : err
                };
            } else {
                resObj = {
                    status : '1',
                    message : "The request was fulfilled",
                    groups : groups
                };
            }
            res.send(resObj);
            logger.logTime("Request getGroups finished");
        });

    });

}

function getGroupsInternal(domain, callback) {

    var groups = [];

    async.waterfall(
        [
            function(callback) {
                Common.db.Groups.findAll({
                    attributes : ['groupname','addomain'],
                    where : {
                        maindomain : domain
                    },
                }).complete(function(err, results) {
                    if (!!err) {
                        return callback("db.Groups.findAll err: " + err);
                    } else {
                        callback(null, results);
                    }
                });
            },
            function(results, callback) {
                results.forEach(function(row) {
                    var group = row.groupname != null ? row.groupname : '';
                    var adDomain = row.addomain != null ? row.addomain : '';
                    var groupObj = {
                            groupName : group,
                            adDomain : adDomain,
                            profiles : [],
                            apps : [] // TODO - remove apps from groups
                    };
                    groups.push(groupObj);
                });
                callback(null)
            }
        ], function(err) {
            if(err) {
                callback(err);
            } else {
                callback(null, groups);
            }
        }
    );
}

var GetGroups = {
    get : getGroups,
    getGroupsInternal: getGroupsInternal
};

module.exports = GetGroups;
