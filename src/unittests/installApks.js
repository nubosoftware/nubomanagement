"use strict";

var async = require('async');
var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var nfsModule = require('../nfs.js');
const UserUtils = require('../userUtils');

var exec = require('child_process').exec;
var path = require('path');
var fs = require('fs');
var yargs = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0 [-s ][[-d domain] -d domain]|[-h]')
    .describe('d', 'set domain, allow multiple instances')
    .describe('s', 'skip installation, only db query, don\'t request root permissions')
    .describe('v', 'Show debug messages')
    .describe('h', 'Show usage');
var myArgs = yargs.argv;



Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;

    if (!Common.isMobile()) {
        console.log('Mobile module not found.');
        Common.quit();
    }

    var domains = [ "nubosoftware.com" ];
    var files = myArgs._;
    if (myArgs.h !== undefined || myArgs._.length === 0) {
        yargs.showHelp();
        Common.quit();
    }
    if (myArgs.v) {
        logger.level = 'debug';
    }
    if (myArgs.d) {
        if(typeof myArgs.d === "string") domains = [ myArgs.d ];
        else domains = myArgs.d;
    }
    logger.info("domain: ", domains);

    async.waterfall(
        [
            function(callback) {
                parceFiles(files, callback);
            },
            function(packageObjArr, callback) {
                if(myArgs.s) {
                    callback(null, packageObjArr);
                } else {
                    installApks(packageObjArr, function(err, obj) {
                        callback(null, packageObjArr);
                    });
                }
            },
            function(packageObjArr, callback) {
                attachAppsToDomains(packageObjArr, domains, callback);
            },
            function(tasks, callback) {
                var errFlag = false;
                logger.info("Created " + tasks.length + " tasks for " + files.length + " files");
                tasks.forEach(function(task) {
                    if(task.status !== "OK") errFlag = true;
                });
                if (errFlag || (files.length*domains.length !== tasks.length)) {
                    logger.error("Problem happened");
                } else {
                    logger.info("Done");
                }
                callback(null);
            }
        ], function(err) {
            Common.quit();
        }
    );
}

var parceFiles = function(files, callback) {
    var resArr = [];
    const apkModule = Common.getMobile().apkModule;
    apkModule.parceFiles(files, function(err, packObjArr) {
        var obj;
        if (!err) {
            packObjArr.forEach(function(packObj) {
                var resObj = {
                    packageName: packObj["manifest"]["package"]["name"],
                    versionCode: packObj["manifest"]["package"]["versionCode"],
                    versionName: packObj["manifest"]["package"]["versionName"],
                    appName: packObj["manifest"]["application-label"],
                    fullPathFile: packObj.fullPathFile,
                    file: packObj.file,
                    parceStatus: "OK",
                    status: "OK"
                };
                resArr.push(resObj);
            });
        }
        callback(null, resArr);
    });
};

/*
 * install list of apks to nubo system
 * Parameters:
 *  packageObjArr - array of objects, that decsibe apks
 *  callback(err, results) - function, run on finish of installation
 *   err - status
 *   results - array of objects, updated packageObjArr
 */
var installApks = function(packageObjArr, callback) {
    async.eachSeries(
        packageObjArr,
        function(packageObj, callback) {
            if(packageObj.status === "OK") {
                installApk(packageObj, function(err, obj) {
                    callback(null);
                });
            } else {
                callback(null);
            }
        },
        function(err) {
            logger.debug("installApksList Result: ", JSON.stringify(packageObjArr));
            callback(null, packageObjArr);
        }
    );
}

var re1 = new RegExp('package: name=\'(.*)\' versionCode=\'(.*)\' versionName=\'(.*)\'');
var re2 = new RegExp('application-label:\'(.*)\'');

var installApk = function(packageObj, callback) {
    const uploadApkModule = Common.getMobile().appMgmt;
    var nfs;
    async.series(
        [
            function(callback) {
                if (global.process.env.USER === "root") {
                    callback(null);
                } else {
                    callback("only root can do it");
                }
            },
            function(callback) {
                nfsModule(
                    {
                        nfs_idx: Common.nfsId
                    },
                    function(err, nfsobj) {
                        if (err) {
                            logger.warn("Cannot create nfs obect err: " + err);
                            nfs = {
                                params: {
                                    nfs_ip: "192.168.122.1",
                                    nfs_path: Common.nfshomefolder
                                }
                            };
                            callback(null);     // TODO: return err
                        } else {
                            nfs = nfsobj;
                            callback(null);
                        }
                    }
                );
            },
            function(callback) {
                var src = packageObj.fullPathFile;
                var dst = nfs.params.nfs_path + "/apks/" + packageObj.packageName + ".apk";
                if (path.resolve(src) === path.resolve(dst)) {
                    return callback(null);
                }
                var reader = fs.createReadStream(src);
                var writer = fs.createWriteStream(dst);
                var isFinished = false;
                reader.pipe(writer);
                writer.on('finish', function() {
                    logger.debug("Finished writing to "+dst);
                    if (!isFinished) {
                        isFinished = true;
                        callback(null);
                    }
                });
                writer.on('error', function(err) {
                    logger.error("Error writing to " + dst + ": " + err);
                    if (!isFinished) {
                        isFinished = true;
                        callback("Error writing to " + dst);
                    }
                });
                reader.on('error', function(err) {
                    logger.error("Error reading from " + src + ": " + err);
                    if (!isFinished) {
                        isFinished = true;
                        callback("Error reading from " + src);
                    }
                });
            },
            function(callback) {
                uploadApkModule.backgroundUploadAPKInternal(packageObj.fullPathFile, packageObj.packageName, true, function(err) {
                    if (err) logger.error("backgroundUploadAPKInternal return err: ", err);
                    callback(err);
                });
            },
            function(callback) {
                Common.getMobile().saveUIDs.pushToHistoryTableList(packageObj.packageName, function(err) {
                    callback(err);
                });
            },
            function(callback) {
                var extra_info = 'APK:' + packageObj.fullPathFile;
                var eventLog = require('../eventLog.js');
                var EV_CONST = eventLog.EV_CONST;

                // Create event in Eventlog
                eventLog.createEvent(EV_CONST.EV_UPLOAD_APK, "installApk@management", "nubosoftware.com", extra_info, EV_CONST.WARN, function(err) {
                    if(err) logger.error("createEvent failed with err: " + err);
                });
                callback(null);
            }
        ], function(err) {
            if (err) {
                logger.error("Installation file: " + packageObj.file + " failed with error: " + err);
                packageObj.status = "FAIL";
            } else {
                packageObj.status = "OK";
            }
            callback(err, packageObj);
        }
    );
}

var attachAppsToDomains = function(packageObjArr, domains, callback) {
    const uploadApkModule = Common.getMobile().appMgmt;
    var tasks = [];
    async.series(
        [
            function(callback) {
                domains.forEach(function(domain) {
                    packageObjArr.forEach(function(packageObj) {
                        if (packageObj.status === "OK") {
                            var task = {
                                packageName: packageObj.packageName,
                                versionCode: packageObj.versionCode,
                                versionName: packageObj.versionName,
                                maindomain: domain,
                                appName: packageObj.appName,
                                appDescription: packageObj.appName,
                            }
                            tasks.push(task);
                        }
                    });
                });
                callback(null);
            },
            function(callback) {
                async.eachSeries(
                    tasks,
                    function(task, callback) {
                        logger.debug("updateAppProgress task: ", task);
                        UserUtils.updateAppProgress("apk",
                            task.packageName, "", task.versionName, task.versionCode,
                            task.maindomain, task.appName, task.appDescription,
                            '0', 0, '',
                            function(err) {
                                if (err) {
                                    logger.error("updateAppProgress return err: ", err);
                                    task.status = "FAIL";
                                } else {
                                    task.status = "OK";
                                }
                                callback(null);
                            }
                        );
                    },
                    function(err) {
                        callback(null);
                    }
                );
            }
        ], function(err) {
            logger.debug("attachAppToDomain Result: " + JSON.stringify(tasks));
            callback(null, tasks);
        }
    );
}
