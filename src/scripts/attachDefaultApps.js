"use strict";

var async = require('async');
var _ = require('underscore');
var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var createGroupModule = require('../ControlPanel/createGroup.js');
var Sequelize = require('sequelize');

console.log("Set common");

Common.loadCallback = function(err, firstTime) {
    var allOrgs, allUsersObjs;
    if(!firstTime) return;
    var domain;

    console.log("Start test");
    async.series([
            function(callback) {
                logger.info("Get all domains");
                Common.db.Orgs.findAll({
                    attributes : ['maindomain'],
                }).complete(function(err, results) {
                    if (!!err) {
                        console.log("err: ", err);
                    }
                    allOrgs = _.map(results, function(item) {return item.dataValues.maindomain;});
                    callback(err);
                });
            },
            function(callback) {
                logger.info("Get all users");
                Common.db.User.findAll({
                    distinct : 'orgdomain',
                    attributes : ['email', 'orgdomain'],
                }).complete(function(err, results) {
                    if (!!err) {
                        console.log("err: ", err);
                    }
                    allUsersObjs = _.map(results, function(item) {return item.dataValues;});
                    callback(err);
                });
            },
            function(callback) {
                var allUsersDomains = _.map(allUsersObjs, function(item) {return item.orgdomain;});
                var allUsersDomainsUnic = _.uniq(allUsersDomains);
                allOrgs = _.union(allOrgs,allUsersDomainsUnic);
                console.log("all domains: ", allOrgs);
                callback(null);
            },
            function(callback) {
                logger.info("Create group All for all domains and add domain\'s user to his group \'All\'");
                async.eachLimit(
                    allOrgs, 2,
                    function(org, callback) {
                        var orgUsersObjs = _.filter(allUsersObjs, function(item) {return item.orgdomain === org;});
                        var orgUsers = _.map(orgUsersObjs, function(item) {return item.email;});
                        console.log("org: " + org + " users: ", orgUsers);
                        var groupObj = {
                            groupname : 'All',
                            maindomain : org,
                        }
                        createGroupModule.createGroupInternal(groupObj, orgUsers, {ignoreGroupExist: true}, function(err) {
                            if(err) {
                                console.log("createGroupInternal of org " + org + " return err: ", err);
                            }
                            callback(null);
                        });
                    },
                    function(err) {
                        callback(err);
                    }
                );
            },
            function(callback) {
                logger.info("Add apps to group All of all domains");
                async.eachLimit(
                    allOrgs, 2,
                    function(org, callback) {
                        const UserUtils = require('../userUtils');
                        require("../ControlPanel/installApps.js").addAppsToGroups(org, [""], ["All"], UserUtils.getDefaultApps(), 0 ,function(err) {
                            if(err) {
                                logger.error("addAppsToGroups cannot install apps to group All for new domain " + org + " err: " + err);
                            }
                            callback(null);
                        });
                    },
                    function(err) {
                        callback(err);
                    }
                );
            }
        ], function(err) {
            if(err) {
                logger.error("script failed with err: " + err);
                process.exit(1);
            } else {
                logger.info("Done");
                process.exit(0);
            }
        }
    );
}
