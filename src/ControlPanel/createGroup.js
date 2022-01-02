"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var setting = require('../settings.js');
var util = require('util');
var async = require('async');
var addProfilesToGroupModule = require('./addProfilesToGroup.js');
var ThreadedLogger = require('../ThreadedLogger.js');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

function createGroup(req, res, next) {

    // https://login.nubosoftware.com/createGroup?ession=[]&groupName=[groupName]&email=[email]

    var logger = new ThreadedLogger(Common.getLogger(__filename));
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var groupName = req.params.groupName;
    if (!groupName || groupName == "") {
        logger.info("createGroup. Invalid groupName");
        status = 0;
        msg = "Invalid parameters";
    }

    var emails = req.params.email;

    if (status != 1) {
        res.send({
            status : status,
            message : msg
        });
        return;
    }

    loadAdminParamsFromSession(req, res, function(err, login) {
        var domain;
        if (!setting.getDebugMode()) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                logger.error("createGroup failed with err: " + err);
                logger.logTime("request of createGroup has been completed");
                return;
            }
            logger.user(login.loginParams.userName);
            domain = login.loginParams.mainDomain;
        } else {
            domain = "nubosoftware.com";
        }

        // checks if we get multiple profiles or just one
        if (!util.isArray(emails)) {
            emails = [emails];
        }

        var groupObj = {
            groupname : groupName,
            maindomain : domain
        };
        createGroupInternal(groupObj, emails, {logger: logger}, function(err) {
            var obj;
            if(err) {
                obj = {
                    status : "0",
                    message : err
                };
            } else {
                obj = {
                    status : "1",
                    message : "The group was created successfully"
                }
            }
            res.send(obj);
            logger.logTime("request of createGroup has been completed");
        });
    });
}

var createGroupInternal = function(groupObj, emails, opts, callback) {
    var logger = opts.logger || Common.logger;
    groupObj.addomain = groupObj.addomain || "";
    var profiles = [];
    async.series(
        [
            function(callback) {
                logger.debug("createGroupInternal groupObj:" + JSON.stringify(groupObj));
                Common.db.Groups.findOrCreate({
                    attributes : ['groupname'],
                    where: groupObj
                }).then(function(results) {
                    logger.debug("createGroupInternal group " + results[1] ? "already exist" : "created");
                    if(!results[1] && !opts.ignoreGroupExist) {
                        callback("group already exists");
                    } else {
                        callback(null);
                    }
                }).catch(function(err) {
                    logger.debug("createGroupInternal err:" + err);
                    callback("can't create group: " + err);
                });
            },
            function(callback) {
                addProfilesToGroupModule.addProfilesToGroupInternal(
                        groupObj.groupname, groupObj.maindomain, groupObj.addomain, groupObj.addomain ? true : false, emails, function(err) {
                    if(!err) {
                        callback(null);
                    } else {
                        callback(err);
                    }
                });
            }
        ], function(err) {
            if (err) {
                logger.error("createGroupInternal failed with err: " + err);
            }
            callback(err);
        }
    );
};

var CreateGroup = {
    get : createGroup,
    createGroupInternal: createGroupInternal
};

module.exports = CreateGroup;
