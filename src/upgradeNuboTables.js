"use strict";

var async = require('async');
var fs = require('fs');
var SysConf = require('./sysConf.js');
var colors = require('colors/safe');

var time = new Date().getTime();
var hrTime = process.hrtime()[1];
var versionsAlreadyCommited = new Array();
const { QueryTypes } = require('sequelize');
const Common = require('./common.js');

let appCommands = {
    "3.0.0.1.1" : (cb) => {
        if (Common.isMobile()) {
            Common.getMobile().appStore.initAllRepos((err) => {
                cb(err);
            });
        } else {
            cb();
        }
    },
    "3.0.0.1.2": (cb) => {
        let dir = "/opt/nubo-appstore/nuboApps";
        require('./scripts/installNuboApps.js').installNuboApps(dir,(err) => {
            cb(err);
        });
    }
};

function upgradeTables(callback){

        console.log("starting upgrade nubo tables...");

        var dbConf;
        var db;
        var sequelize;

        async.series([
        function(callback){
            SysConf.loadSysConf(function(err, conf){
                if(err){
                    return callback(err);
                }

                dbConf = conf.dbConf;

                callback(null);
            });
        },
        function(callback) {

            var options = {
                sequelizeLogs: false,
                dbMaxConnections: dbConf.maxConnections,
                dbMaxIdleTime: dbConf.maxIdleTime
            };

            require('./DBModel.js').initSequelize(dbConf.name, dbConf.user, dbConf.password, dbConf.host, dbConf.port, options, function(err, dbObj, sequelizeObj) {
                if(err){
                    return callback("cannot connect to db");
                }

                db = dbObj;
                sequelize = sequelizeObj;

                callback(null);
            },true);
        },
        // get versions already done from DB
        function(callback) {

            db.Version.findAll({
                attributes : ['version']
            }).then(function(results) {
                // parse results and push them to array for later use
                results.forEach(function(row) {

                    // get all versions of current row
                    versionsAlreadyCommited.push(row.version);
                });
                callback(null);
                return;
            }).catch(function(err) {
                var msg = "db error: " + err;
                console.log(colors.red(msg));
                if (msg.indexOf("ER_NO_SUCH_TABLE") !=-1) {
                    callback(null)
                } else {
                    callback(err);
                }
                return
            });

        },

        // read nubo.sql file and run only the commands not exist in version table
        function(callback) {
            fs.readFile('utils/db/nubo_mysql.json', 'utf8', function(err, data) {
                if (err) {
                    console.log(colors.red("read file: " + err));
                    callback(err);
                    return;
                } else {
                    // remove \r\n from the command
                    data = data.replace(/(?:\\[rn]|[\r\n]+)+/g, "");
                    var dbCommands = JSON.parse(data);

                    // run on all commands in file, compare to what
                    // exist in version and run missing commands

                    var keys = Object.keys(dbCommands);

                    async.eachSeries(keys, function(commandVersion, callback) {
                        // console.log("Command to run:" + commandVersion);

                        if (dbCommands.hasOwnProperty(commandVersion) && versionsAlreadyCommited.indexOf(commandVersion) < 0) {
                            var currenCommand = dbCommands[commandVersion];
                            console.log("Command " + commandVersion + " needs to be run on Nubo DB:\n" + currenCommand);

                            sequelize.query(currenCommand,{ type: QueryTypes.UPDATE}).then(function() {

                                db.Version.create({
                                    version : commandVersion,
                                    time : new Date()
                                }).then(function() {
                                    console.log("Finished command!");
                                    callback(null);
                                    return;

                                }).catch(function(err) {
                                    var msg = "Failed adding version " + commandVersion + " to version table " + err;
                                    console.log(colors.red(msg));
                                    callback(null);
                                    return;
                                });
                            }).catch(function(err) {
                                var msg = "Command version " + commandVersion + " failed running on the database " + err;
                                console.log(colors.red(msg));
                                // add this anyway to version history
                                db.Version.create({
                                    version : commandVersion,
                                    time : new Date()
                                }).then(function(results) {
                                    callback(null);
                                    return;

                                }).catch(function(err) {
                                    var msg = "Failed adding version " + commandVersion + " to version table " + err;
                                    console.log(colors.red(msg));
                                    callback(null);
                                    return;
                                });
                                return;
                            });

                        } else {
                            // console.log("Command done already");
                            callback(null);
                        }
                    }, function(err) {
                        console.log("End of upgrade nubo table");
                        callback(null);
                        return;
                    });

                }
            });
        },
        function(callback) {
            // run all app commands
            var keys = Object.keys(appCommands);

            async.eachSeries(keys, function(commandVersion, callback) {
                // console.log("Command to run:" + commandVersion);

                if (appCommands.hasOwnProperty(commandVersion) && versionsAlreadyCommited.indexOf(commandVersion) < 0) {
                    var currenCommand = appCommands[commandVersion];
                    console.log("Running app command: " + commandVersion );
                    currenCommand( (err) => {
                        if (!!err) {
                            var msg = "App command version " + commandVersion + " failed running: " + err;
                            console.log(colors.red(msg));
                        }
                        db.Version.create({
                            version : commandVersion,
                            time : new Date()
                        }).then(function(results) {
                            callback(null);
                            return;
                        }).catch(function(err) {
                            var msg = "Failed adding version " + commandVersion + " to version table " + err;
                            console.log(colors.red(msg));
                            callback(null);
                            return;
                        });
                    });
                } else {
                    // console.log("Command done already");
                    callback(null);
                }
            }, function(err) {
                console.log("End of running app commands");
                callback(null);
                return;
            });
        }
    ], function(err) {
            if (err) {
                console.log(colors.red("Error: " + err));
                callback(err);
            } else {
                console.log("Done upgrade tables");
                callback(null);
            }
        });
}

module.exports  = {
    upgradeTables: upgradeTables
}