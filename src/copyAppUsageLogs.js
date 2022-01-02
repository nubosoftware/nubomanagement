"use strict";

var async = require("async");

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var syslog = require('./ControlPanel/syslog/DBProcess.js');
var moment = require('moment-timezone');
var util = require('util');
var Sequelize = require('sequelize');
const { QueryTypes } = require('sequelize');


let ignoreApps = [
    'com.nubo.launcher',
    'com.nubo.blackscreenapp',
    'com.android.settings',
    'com.android.provision',
    'android',
    'com.android.systemui'
];



function copyLogsFromNuboLogs(callback) {
    copyLogsFromNuboLogsInternal(1,callback);
}

function copyLogsFromNuboLogsInternal(days, callback) {
    var updateRowOfAppUsage = function (startDay,row, callback) {

        if (!row.Message || row.Message.length == 0) {
            callback(null);
            return;
        }

        var packageName;
        if (row.Message.slice(0, 29) === "Activity:onCreate. packName: ") {
            packageName = row.Message.slice(29);
        } else {
            packageName = "";
        }

        if (!row.User || row.User.length == 0) {
            callback(null);
            return;
        }
        if (ignoreApps.includes(packageName)) {
            callback(null);
            return;
        }

        logger.info(util.format("packageName: %s, email: %s, cnt: %d", packageName, row.User, row.cnt));
        Common.db.AppUsage.create({
            email: row.User,
            packagename: packageName,
            count: row.cnt,
            day: startDay
        }).then(function (results) {
            callback(null);
        }).catch(function (err) {
            logger.error("Insert err: " + err);
            Common.db.AppUsage.update(
                {
                    count: row.cnt
                },
                {
                    where: {
                        email: row.User,
                        packagename: packageName,
                        day: startDay
                    }
                }
            ).then(function (results) {
                logger.info("Update results: " + JSON.stringify(results.null, 2));
                callback(null);
            }).catch(function (err) {
                callback(err);
            });
        });
    }

    var dayBack = days;

    syslog.getSequelize(function (err, DBObj) {
        if (err) {
            logger.error('error while gettings sequelize from nuboLogs: ' + err);
            callback(err);
        } else {
            async.whilst(
                function () { return dayBack > 0; },
                function (callback) {
                    let startDay = moment().utc().subtract(dayBack, 'days').startOf('day').format('YYYY-MM-DD');
                    let startTime = moment().utc().subtract(dayBack, 'days').startOf('day').format('YYYY-MM-DD HH:mm:ss');
                    let endTime = moment().utc().subtract(dayBack, 'days').endOf('day').format('YYYY-MM-DD HH:mm:ss');
                    logger.info("Starting copyLogsFromNuboLogs. date: " + startDay);

                    async.waterfall(
                        [
                            function (callback) {
                                let sql = util.format("select User, Message , count(*) cnt from Logs where MessageType='start_app' and Time >= '%s' and Time <= '%s' group by User, Message",
                                    startTime, endTime);
                                DBObj.query(sql , { type: QueryTypes.SELECT}).then(function(results) {
                                    callback(null, results);
                                }).catch(function (err) {
                                    logger.info("DBObj.query err: "+err);
                                    callback(err, []);
                                });
                            },
                            function (results, callback) {
                                async.eachLimit(
                                    results, 4,
                                    function (row, callback) {
                                        updateRowOfAppUsage(startDay,row, callback)
                                    },
                                    function (err) {
                                        callback(err);
                                    }
                                );
                            }
                        ], function (err) {
                            dayBack--;
                            callback(null);
                        }
                    );

                },
                function (err, n) {
                    callback(err);
                }
            );
        }
    });




}
/*
Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;
    copyLogsFromNuboLogsInternal(5,function(err){
        logger.info("Done.");
        Common.quit();
    });
};*/

module.exports = {
    copyLogsFromNuboLogs: copyLogsFromNuboLogs,
    copyLogsFromNuboLogsInternal: copyLogsFromNuboLogsInternal
};

