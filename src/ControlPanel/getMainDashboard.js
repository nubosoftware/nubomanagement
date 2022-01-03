"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var async = require('async');
const { Op, QueryTypes } = require('sequelize');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}





/*
 * getRules req@param session req@res status, message, {rules}
 */
function getMainDashboard(req, res, next) {
    // https://login.nubosoftware.com/getMainDashboard?session=[]

    res.contentType = 'json';
    var msg = "";

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

        getMainDashboardFromDB(domain, false, false, function(err, obj) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
            }
            obj["status"] = "1";
            obj["message"] = "sent dashboard details",
            res.end(JSON.stringify(obj));
            return;
        });

    });

}

/*
 * The 'getRulesFromDB' function shall receive res and domain; return all organization rule
 */
function getMainDashboardFromDB(domain, isNewCP, siteAdmin, callback) {

    var onlineUsers;
    var totalUsers;
    var onlineDevices;
    var totalDevices;
    var androidDevices;
    var totalUsedSpaceMB;
    var totalSpaceMB
    var iPhoneDevices;
    var deviceNames;
    var runningPlatforms;
    var errorPlatforms;
    var sessionsPerPlatform = [];
    var platformDomain = 'common';
    var platforms = [];

    //this call (async) is to perform this in a synchronic way
    async.series([
        // get total users
        function(callback) {
            Common.db.User.findAndCountAll({
                where : {
                    orgdomain : domain,
                },
            }).then(function(result) {
                totalUsers = result.count;
                callback(null);
                return;
            });
        },
        // get online users
        function(callback) {
            var query = 'SELECT count(DISTINCT(email)) AS count FROM user_devices';

            var queryWhereClause = " WHERE platform IS NOT NULL AND maindomain= :domain";
            var queryParams = {domain:domain};

            Common.sequelize.query(query + queryWhereClause, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

                onlineUsers = results[0].count;
                callback(null);
                return;

            }).catch(function(err) {
                callback(err);
                return;
            });
        },
        // get total online devices
        function(callback) {
            Common.db.UserDevices.findAndCountAll({
                where : {
                    maindomain : domain,
                    platform : {
                        [Op.ne]: null
                    }
                },
            }).then(function(result) {
                onlineDevices = result.count;
                callback(null);
                return;
            });
        },
        // get total devices
        function(callback) {
            Common.db.UserDevices.findAndCountAll({
                where : {
                    maindomain : domain,
                },
            }).then(function(result) {
                totalDevices = result.count;
                callback(null);
                return;
            });
        },
        // get android devices
        function(callback) {
            var query = 'SELECT count(DISTINCT(imei)) AS count FROM user_devices ';

            var queryWhereClause = " WHERE devicename NOT like \'iPhone%\' AND devicename NOT like \'Web%\' AND maindomain= :domain";
            var queryParams = {domain:domain};;

            Common.sequelize.query(query + queryWhereClause, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

                androidDevices = results[0].count;
                callback(null);
                return;

            }).catch(function(err) {
                callback(err);
                return;
            });
        },
        // get iphone devices
        function(callback) {
            var query = 'SELECT count(DISTINCT(imei)) AS count FROM user_devices ';

            var queryWhereClause = " WHERE devicename like \'iPhone%\' AND maindomain= :domain";
            var queryParams = {domain:domain};

            Common.sequelize.query(query + queryWhereClause, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

                iPhoneDevices = results[0].count;
                callback(null);
                return;

            }).catch(function(err) {
                callback(err);
                return;
            });
        },
        // get all device types
        function(callback) {
            var query = 'SELECT count(DISTINCT(imei)) AS count , devicename FROM user_devices ';

            var queryWhereClause = " WHERE maindomain= :domain group by devicename order by count desc limit 10";
            var queryParams = {domain:domain};

            Common.sequelize.query(query + queryWhereClause, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

                deviceNames = results;
                callback(null);
                return;

            }).catch(function(err) {
                callback(err);
                return;
            });
        },
        // get total storage
        function(callback) {
            var query = 'SELECT count(*) AS usersCount, sum(storageLast) as usedSpace, storageLimit FROM users';

            var queryWhereClause = " WHERE orgdomain= :domain group by storageLimit order by storageLimit ";
            var queryParams = {domain:domain};

            Common.sequelize.query(query + queryWhereClause, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

                if (results && results.length > 0) {
                    var totalUsers = results[0].usersCount;
                    var spaceUsedPerUserAvg = results[0].usedSpace;

                    if (totalUsers > 0) {
                        totalSpaceMB = parseInt((results[0].storageLimit * totalUsers) / 1000);// get value in MB
                        totalUsedSpaceMB = parseInt(((spaceUsedPerUserAvg / totalUsers)) / 1000); // get value in MB
                    }
                }

                callback(null);
                return;

            }).catch(function(err) {
                callback(err);
                return;
            });
        },
        // check if domain has dedicated platform
        function(callback) {
            Common.db.Orgs.findAll({
                attributes: ['maindomain'],
                where: {
                    maindomain: domain,
                    dedicatedplatform: 1
                }
            }).then(results => {
                if (results && results.length == 1) {
                    platformDomain = domain;
                }
                callback();
            }).catch(err => {
                callback(err);
            });
        },
        // get running platforms
        function(callback) {
            if (!siteAdmin) {
                runningPlatforms = 0;
                callback(null);
                return;
            }
            Common.redisClient.zcard('platforms_'+platformDomain, function(err, obj) {
                if (err) {
                    callback(err);
                    return;
                }
                runningPlatforms = obj;
                callback(null);
                return;
            });
        },
        // get error platforms
        function(callback) {
            if (!siteAdmin) {
                errorPlatforms = 0;
                callback(null);
                return;
            }
            Common.redisClient.zcard('platforms_errs_'+platformDomain, function(err, obj) {
                if (err) {
                    callback(err);
                    return;
                }
                errorPlatforms = obj;
                callback(null);
                return;
            });
        },
        function(callback) {
            if (!siteAdmin) {
                callback(null);
                return;
            }
            Common.redisClient.zrange('platforms_'+platformDomain, 0,-1,'WITHSCORES',function(err,replies) {
                if (err) {
                    callback(err);
                    return;
                }
                for (var i=0; i<replies.length; i+=2) {
                    sessionsPerPlatform.push({
                        platformID: replies[i],
                        sessions: replies[i+1]
                    });
                }
                callback(null);
                return;
            });
        },
        function(callback) {
            if (!siteAdmin) {
                platforms = [];
                callback(null);
                return;
            }
            require('../platform.js').listAllPlatforms(platformDomain,function(err,list){
                if (err) {
                    callback(err);
                    return;
                }
                platforms = list;
                callback();
            });
        },

    ], function(err, results) {
            if (err) {
                callback(err, null);
                return;
            }

            var maxCapacity = 0;
            if (siteAdmin) {
                maxCapacity = Common.platformParams.maxCapacity;
            }
            var usersPerPlatform = Common.platformParams.usersPerPlatform;

            // response back all details once finish
            var json = {
                totalUsers : totalUsers,
                onlineUsers : onlineUsers,
                onlineDevices : onlineDevices,
                totalDevices : totalDevices,
                androidDevices : androidDevices,
                iPhoneDevices : iPhoneDevices,
                deviceNames,
                totalUsedSpaceMB : totalUsedSpaceMB,
                totalSpaceMB : totalSpaceMB,
                availablePlatforms : maxCapacity/usersPerPlatform,
                runningPlatforms : runningPlatforms
            };
            if (isNewCP && siteAdmin) {
                json.errorPlatforms = errorPlatforms;
                json.sessionsPerPlatform = sessionsPerPlatform;
                json.platforms = platforms;
            }
            callback(null, json);
            return;
        });
}

var GetMainDashboard = {
    get : getMainDashboard,
    getMainDashboardFromDB : getMainDashboardFromDB
};

module.exports = GetMainDashboard;
