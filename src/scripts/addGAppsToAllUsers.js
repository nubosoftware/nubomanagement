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

Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;

    if (process.argv.length>=3) {
    }

    var packageNames = [
        "com.google.android.feedback",
        "com.google.android.gsf.login",
        "com.google.android.onetimeinitializer",
        "com.google.android.setupwizard",
        "com.google.android.backuptransport",
        "com.google.android.gsf",
//        "com.google.android.syncadapters.contacts",
        "com.android.vending",
        "com.google.android.gms",
        "com.google.android.partnersetup"
    ];
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
                setpackagesObj(packageNames, function(err, obj) {
                    packagesObj = obj;
                    callback(err);
                });
            },
            function(callback) {
                createUsersDevices(function(err, obj) {
                    emailDeviceids = obj;
                    callback(err);
                });
            },
            function(callback) {
                createTasks(emailDeviceids, packageNames, callback);
            },
            function(taskObjs, callback) {
                var time = new Date().getTime();
                var hrTime = process.hrtime()[1];
                async.parallel(
                    [
                        function(callback) {
                            createDirectories(taskObjs, packagesObj, nfsdir, function(err) {
                                    if(err)
                                        logger.error("createDirectories failed with err: " + err);
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

function setpackagesObj(packageNames, callback) {
    var res = {};
    async.series(
        [
            function(callback) {
                Common.db.PackagesList.findAll({
                    attributes: ["uid", "packagename"],
                    where: {
                        packagename: packageNames
                    }
                }).complete(function(err, results) {
                    if(!err) {
                        results.forEach(function(row) {
                            res[row.packagename] = row.uid
                        });
                        if(results.length !== packageNames.length) err = "Cannot get uid for all packages"
                    }
                    callback(err);
                });
            }
        ], function(err) {
            callback(err, res);
        }
    );
}

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

function createDirectories(taskObjs, packagesObj, nfsdir, callback) {
    var totalTasks = taskObjs.length;
    var doneTasks = 0;
    var showProgress = setInterval(function() {
        console.log("Done dir " + doneTasks + "/" + totalTasks + " (" + (100*doneTasks/totalTasks).toFixed(1) + "%)");
    }, 1000);

    console.log("packagesObj: ", packagesObj);

    async.waterfall(
        [
            function(callback) {
                async.eachSeries(
                    taskObjs,
                    function(task, callback) {
                        var dir = nfsdir + User.getUserDeviceDataFolder(task.email, task.deviceId) + task.packageName;
                        var uid = 100000 + packagesObj[task.packageName];
                        var dirperm = "751"
                        createDir(dir, uid, dirperm,
                            function(err) {
                                if(err) {
                                    if(err.code !== "EEXIST")
                                        logger.error("createDir failed with err: " + err);
                                }
                                doneTasks++;
                                callback(null);
                            }
                        );
                    },
                    callback
                );
            }
        ], function(err) {
            clearInterval(showProgress);
            callback(err);
        }
    );
}

function createTasks(emailDeviceids, packageNames, callback) {
    var taskObjs = [];
    async.waterfall(
        [
            function(callback) {
                emailDeviceids.forEach(function(eddObj) {
                    packageNames.forEach(function(packageName) {
                        taskObjs.push({
                            email: eddObj.email,
                            domain: eddObj.domain,
                            deviceId: eddObj.deviceId,
                            packageName: packageName
                        });
                    });
                });
                callback(null);
            }
        ], function(err) {
            callback(err, taskObjs);
        }
    );
}

function setInstallationInDB(taskObjs, time, hrTime, callback) {
    var totalTasks = taskObjs.length;
    var doneTasks = 0;
    var showProgress = setInterval(function() {
        console.log("Done db " + doneTasks + "/" + totalTasks + " (" + (100*doneTasks/totalTasks).toFixed(1) + "%)");
    }, 1000);

    async.waterfall(
        [
            function(callback) {
                async.eachSeries(
                    taskObjs,
                    function(task, callback) {
                        addAppsToProfilesModule.insertToDeviceApps(
                            task.email, task.deviceId, task.packageName, task.domain, 0/*TO_BE_INSTALLED*/, time, hrTime,
                            function(err) {
                                if(err) logger.error("addAppsToProfilesModule.installAppsForRunningUsers failed with err: " + err);
                                doneTasks++;
                                callback(null);
                            }
                        );
                    },
                    callback
                );
            }
        ], function(err) {
            clearInterval(showProgress);
            callback(err);
        }
    );
}

