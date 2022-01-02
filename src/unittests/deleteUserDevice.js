"use strict";

var execFile = require('child_process').execFile;
var async = require('async');
var _ = require('underscore');
var Common = require('../common.js');
var nfsModule = require('../nfs.js');
var userModule = require('../user.js');
var logger = Common.getLogger(__filename);

var nfsRoot;

console.log("Set common");

function main(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;

    var email;
    var deviceId;
    if ((process.argv.length >=3) && (process.argv.length <= 4)) {
        email = process.argv[2];
        if(process.argv.length === 4) {
            deviceId = process.argv[3];
        }
    } else {
        console.log("Usage: node unittests/deleteUserDevice.js <email> <deviceid>");
        Common.quit();
    }
    console.log("Run: node unittests/deleteUserDevice.js " + email + " " + deviceId);

    console.log("Start test");
    async.series([
            function(callback) {
                if(process.getuid() === 0) {
                    callback(null);
                } else {
                    console.log("script has been run by root");
                    callback("script has been run by root");
                }
            },
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
                            nfsRoot = nfsobj.params.nfs_path;
                            callback(null);
                        }
                    }
                );
            },
            function(callback) {
                console.log("nfsRoot: " + nfsRoot);
                checkUserDeviceExist(email, deviceId, callback);
            },
            function(callback) {
                deleteUserDevice(email, deviceId, callback);
            }
        ], function(err) {
            console.log("status: " + (err ? " error: " + err : "Done"));
            Common.quit();
        }
    );
}

function checkUserDeviceExist(email, deviceid, callback) {
    var where = {email: email};
    if(deviceid !== undefined) where.deviceid = deviceid;
    Common.db.Activation.findAll({
        attributes: ['email', 'deviceid'],
        where: where
    }).complete(function(err, results) {
        if(err) {
            callback(err);
        } else {
            if(results.length === 0) {
                callback("no user/device");
            } else {
                callback(null);
            }
        }
    });
}


function deleteUserDevice(email, deviceid, callback) {
    var devicesList;
    async.series([
            function(callback) {
                if(deviceid === undefined) {
                    getDevicesListOfUser(email, function(err, list) {
                        devicesList = list;
                        callback(err);
                    });
                } else {
                    if(typeof deviceid === "string") {
                        devicesList = [deviceid];
                    } else {
                        devicesList = deviceid;
                    }
                    callback(null);
                }
            },
            function(callback) {
                cleanupDB(email, deviceid, callback);
            },
            function(callback) {
                cleanupFiles(email, devicesList, callback);
            }
        ], function(err) {
            callback(err);
        }
    );
}

function getDevicesListOfUser(email, callback) {
    Common.db.Activation.findAll({
        attributes: ["deviceid"],
        where: {email: email}
    }).complete(function(err, results) {
        var simpleResult = _.map(results, function(row) {return row.deviceid;});
        var devicesList = _.uniq(simpleResult);
        console.log("devicesList: " + devicesList);
        callback(err, devicesList);
    });
}

function cleanupDB(email, deviceid, callback) {
    var tablesStruct = [
        ["DeviceApps", "email", "deviceid"],
        ["UserDevices", "email", "imei"],
        ["Activation", "email", "deviceid"]
    ];
    async.eachSeries(
        tablesStruct,
        function(item, callback) {
                var table = item[0];
                console.log("table: " + table);
                var where = {};
                where[item[1]] = email;
                if(deviceid !== undefined) where[item[2]] = deviceid;
                console.log("where: ", where);
                (Common.db[table]).destroy({
                    where: where
                }).then(function() {
                    callback(null);
                }).catch(function(err) {
                    callback(err);
                });
        },
        function(err) {
            console.log("cleanupDB status: " + (err ? " error: " + err : "Done"));
            callback(err)
        }
    );
}

function cleanupFiles(email, devicesList, callback) {
    async.eachSeries(
        devicesList,
        function(deviceid, callback) {
            var dir = nfsRoot + userModule.getUserDeviceDataFolder(email, deviceid);
            console.log("cleanupFiles dir: " + dir);
            execFile("rm", ["-rf", dir], function(error, stdout, stderr) {
                if (error) {
                    logger.error("cmd: rm -rf " + dir);
                    logger.error("error: " + JSON.stringify(error, null, 2));
                    logger.error("stdout: " + stdout);
                    logger.error("stderr: " + stderr);
                }
                callback(error);
            });
        },
        function(err) {
            console.log("cleanupFiles status: " + (err ? " error: " + err : "Done"));
            callback(err)
        }
    );
}


Common.loadCallback = main;
if (module) {
    module.exports = {deleteUserDevice: deleteUserDevice};
}
