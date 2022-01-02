"use strict";

/**
 *  addGAppsToAllUsers.js
 *
 */
var fs = require('fs');
var async = require('async');
var _ = require('underscore');
var Common = require('../common.js');
var User = require('../user.js');
var logger = Common.getLogger(__filename);
var addAppsToProfilesModule = require('../ControlPanel/addAppsToProfiles.js');
var nfsModule = require('../nfs.js');
var commonUtils = require('../commonUtils.js');

Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;

    logger.info(`argv: ${process.argv}`);
    if (process.argv.length !=3 ) {
        logger.info(`Usage: node deletePackageInStorage.js <package_name>`);
        Common.quit();
        return;
    }

    var packageName = process.argv[2];
    logger.info(`packageName: ${packageName}`);
    //Common.quit();
    //return;
    var packagesObj;
    var emailDeviceids;
    var nfsdir;
    async.waterfall(
        [
            function(callback) {
                nfsModule(
                    {
                        nfs_idx: Common.nfsId
                    },
                    function(err, nfsobj) {
                        if (err) {
                            logger.error("Cannot create nfs obect err: " + err);
                            callback(err);
                        } else {
                            nfsdir = nfsobj.params.nfs_path;
                            callback(null);
                        }
                    }
                );
            },
            function(callback) {
                createUsersDevices(function(err, obj) {
                    emailDeviceids = obj;
                    callback(err);
                });
            },
            function( callback) {
                var time = new Date().getTime();
                var hrTime = process.hrtime()[1];
                async.parallel(
                    [
                        function(callback) {
                            deleteDirectories(emailDeviceids, packageName, nfsdir, function(err) {
                                    if(err)
                                        logger.error("deleteDirectories failed with err: " + err);
                                    callback(null);
                                }
                            );
                        }
                    ], callback
                );
            }
        ], function(err) {
            if(err) {
                logger.error("Script finished with fail, err: " + err);
            } else {
                logger.info("Finish")
            }
            setTimeout(function() {
                Common.quit();
            }, 3000);
        }
    );
};



function getAllUserDevices(email, callback) {
    // Loop over all user's devices
    var deviceMap = {};

    Common.db.Activation.findAll({
        attributes : ["deviceid"],
        where : {
            email : email,
            status : '1'
        },
        group: ["deviceid"]
    }).complete(function(err, results) {
        if (!!err) {
            logger.error("Error while getting deviceid " + err);
            callback("Error while getting deviceid " + err);
            return;
        }
        var deviceIds = [];
        results.forEach(function(row) {
            deviceIds.push(row.deviceid);
        });
        callback(null, deviceIds);
    });
}

function createUsersDevices(callback) {
    var res;
    async.waterfall(
        [
            function(callback) {
                var userObjs = [];
                Common.db.User.findAll({
                    attributes : ["email", "orgdomain"],
                }).complete(function(err, results) {
                    results.forEach(function(row) {
                        userObjs.push({
                            email: row.email,
                            domain: row.orgdomain
                        });
                    });
                    /*userObjs = [
                        {
                            email: "alexander@nubosoftware.com",
                            domain: "nubosoftware.com"
                        }
                    ];*/
                    callback(null, userObjs);
                });
            },
            function(userObjs, callback) {
                var emailDeviceids = [];
                //console.log("userObjs: ", userObjs);
                async.eachSeries(
                    userObjs,
                    function(userObj, callback) {
                        getAllUserDevices(userObj.email, function(err, deviceIds) {
                            if(err) {
                                callback(err);
                            } else {
                                deviceIds.forEach(function(deviceId) {
                                    emailDeviceids.push({
                                        email: userObj.email,
                                        domain: userObj.domain,
                                        deviceId: deviceId
                                    });
                                });
                                callback(null, emailDeviceids);
                            }
                        });
                    },
                    function(err) {
                        //console.log("emailDeviceids: ", emailDeviceids);
                        res = emailDeviceids;
                        callback(err, emailDeviceids);
                    }
                );
            }
        ], function(err) {
            callback(err, res);
        }
    );
}

function createDir(dir, uid, dirperm, callback) {
    async.series(
        [
            function(callback) {
                fs.mkdir(dir, callback);
            },
            function(callback) {
                fs.chown(dir, uid, uid, callback);
            },
            function(callback) {
                fs.chmod(dir, dirperm, callback);
            }
        ], callback
    );
}

function deleteDirectories(taskObjs, packageName, nfsdir, callback) {
    var totalTasks = taskObjs.length;
    var doneTasks = 0;

    async.waterfall(
        [
            function(callback) {
                async.eachSeries(
                    taskObjs,
                    function(task, callback) {
                        var devicedir =  commonUtils.buildPath(nfsdir ,User.getUserDeviceDataFolder(task.email, task.deviceId));
                        let dirs = [
                            commonUtils.buildPath(devicedir,"user",packageName),
                            commonUtils.buildPath(devicedir,"user_de",packageName),
                            commonUtils.buildPath(devicedir,"misc/profiles/cur",packageName),
                        ];
                        async.forEach(dirs,function(dir, callback) {
                            fs.stat(dir, function(err,stats) {
                                if (err) {
                                    callback(null);
                                    return;
                                }
                                if (stats.isDirectory()) {
                                    //logger.info(`Found ${dir}`);
                                    fs.rmdir(dir,{ recursive: true, force: false },function(err) {
                                        if (err) {
                                            logger.info(`Error delete ${dir}: ${err}`);
                                        } else {
                                            logger.info(`Deleted: ${dir}`);
                                        }
                                        callback(null);
                                    });
                                } else {
                                    callback(null);
                                }
                            });
                        },function(err) {
                            callback(null);
                        });
                        //logger.info(`deleteDirectories: ${dirs}`);

                    },
                    callback
                );
            }
        ], function(err) {
            callback(err);
        }
    );
}





