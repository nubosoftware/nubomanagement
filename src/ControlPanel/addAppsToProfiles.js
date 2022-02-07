"use strict";

/*
 * In this class install multiple apps to multi profiles and devices.
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var util = require('util');
var async = require('async');
var User = require('../user.js');
var eventLog = require('../eventLog.js');
const commonUtils = require('../commonUtils.js');
var _ = require('underscore');
const { Op, QueryTypes } = require('sequelize');


// 7 seconds timeout for lock
var LOCK_RETRY = 10;
// Try 10 times
var TIME_BETWEEN_RETRIES = 1000;
// 1 second

// Install status in device_apps
var TO_BE_INSTALLED = 0;
var TO_BE_UNINSTALLED = -1;


var IS_PRIVATE_APP_FALSE = 0;
var IS_PRIVATE_APP_TRUE = 1;

// Event log Const
var EV_CONST = eventLog.EV_CONST;
var EV_ADD_APP_TO_PROFILE = EV_CONST.EV_ADD_APP_TO_PROFILE;
var EV_REMOVE_APP_FROM_PROFILE = EV_CONST.EV_REMOVE_APP_FROM_PROFILE;
var WARN = EV_CONST.WARN;

function getPathToNfs() {
    var re = new RegExp('(.*)@(.*)');
    var m = re.exec(Common.nfsserver);
    var nfs = null;
    if (m != null && m.length >= 3) {
        nfs = m[2];
    }
    var nfspath = nfs + ":" + Common.nfshomefolder;
    return nfspath;
}

function getLocalApksPath() {
    var pathToAPKs = Common.nfshomefolder + '/apks/';
    return pathToAPKs;
}

function getPlatformApksPath() {
    var pathToAPKs = '/data/tmp';
    return pathToAPKs;
}

function loadAdminParamsFromSession(req, res, callback) {
    require('../settings.js').loadAdminParamsFromSession(req, res, callback);
}









// Lock the package for user in user_apps
function lockPackage(lock, wait, retries, callback) {
    Common.redisClient.setnx(lock, 1, function(err, reply) {
        if (err) {
            logger.info("Error in the lock " + lock + " ,err: " + err);
            callback(err);
            return;
        }
        if (reply == 1) {
            callback(null);
            // sucessfull lock
            return;
        }

        if (retries <= 0) {
            logger.info("Timeout in lock " + lock);
            callback("Error in the lock " + lock + ", Lock already exists");
        } else {
            logger.info("Wait on lock " + lock + " retries: " + retries);
            setTimeout(function() {
                lockPackage(lock, wait, retries - 1, callback);
            }, wait);
        }
    });
    // Common.redisClient.SETNX
}

function lockPackages_user_apps(email, packageNames, wait, retries, callback) {
    var lockedPackages = [];
    var errPackages = [];
    async.eachSeries(packageNames, function(packageName, callback) {
        var lock = 'lock_package_' + packageName + '_' + email;
        lockPackage(lock, wait, retries, function(err) {
            if (err) {
                errPackages.push(packageName);
            } else {
                lockedPackages.push(packageName);
            }
            callback(err);
        });
    }, function(err) {
        callback(err, lockedPackages, errPackages);
    });
}

function unlockPackage(email, packageName, wait, retries, callback) {
    var lock = 'lock_package_' + packageName + '_' + email;

    Common.redisClient.del(lock, function(err, reply) {
        if (err) {
            logger.info("Error in the removing lock " + lock + " ,err: " + err);
        }
        if (reply == 1) {
            callback(null);
            // sucessfull unlock
            return;
        } else {
            // err also arrives here
            if (retries <= 0) {
                logger.info("Timeout in unlock " + lock);
                callback("Error while unlocking " + lock);
            } else {
                logger.info("Wait on unlock " + lock + " retries: " + retries);
                setTimeout(function() {
                    unlockPackage(email, packageName, wait, retries - 1, callback);
                }, wait);
            }
        }
    });
    // Common.redisClient.DEL
}

function unlockPackages_user_apps(email, packageNames, wait, retries, callback) {
    async.eachSeries(packageNames, function(packageName, cb) {
        unlockPackage(email, packageName, wait, retries, function(err) {
            cb(null);
        });
    }, function(err) {
        callback(null);
    });
}








/**
 *
 * @param packageNames
 * @param email
 * @param isNeedToInstall
 *                true to install the app, false to uninstall
 * @param domain
 * @param isPrivateApp
 *                indicate if the app is install only to the user and not by
 *                group install. IS_PRIVATE_APP_TRUE(1) = true,
 *                IS_PRIVATE_APP_FALSE(0) = false
 * @param callback
 */
// TODO - remove arg isNeedToInstall.
// TODO - seperate this function to two functions: 1. install app, 2.uninstall
// app

function updateUserAppsTableForUser(packageNames, email, isNeedToInstall, domain, isPrivateApp, isAppStoreOnly, callback) {
    if (!email) {
        callback('email = ' + email);
        return;
    }
    if (packageNames.length === 0) {
        callback(null);
    }
    let autoInstall = 1;
    if (isAppStoreOnly == 1 || isAppStoreOnly == '1') {
        autoInstall = 0;
    }
    async.waterfall(
        [
            function(callback) {
                Common.db.UserApps.findAll({
                    attributes : ['private', 'packagename'],
                    where : {
                        email : email,
                        maindomain : domain,
                        packagename : packageNames
                    },
                }).complete(function(err, results) {
                    if (!!err) {
                        logger.error(new Error().stack);
                        callback(err);
                    } else {
                        callback(null, results);
                    }
                });
            },
            function(results, callback) {
                var packagesToUpdate = [];
                var results_hash = [];
                results.forEach(function(result) {
                    results_hash[result.packagename] = result;
                });
                packageNames.forEach(function(packageName) {
                    // If the app is already private for the user and update done for group, don't update
                    if(results_hash[packageName] && (results_hash[packageName].private === IS_PRIVATE_APP_TRUE) && (isPrivateApp === IS_PRIVATE_APP_FALSE)) {
                        return;
                    } else {
                        packagesToUpdate.push(packageName);
                    }
                });
                callback(null, packagesToUpdate);
            },
            function(packageNames, callback) {
                async.eachSeries(
                    packageNames,
                    function(result, callback) {
                        //console.log("result: " + JSON.stringify(result));
                        processPackage(result, callback);
                    },
                    function(err) {
                        callback(err);
                    }
                );
            }
        ], function(err) {
            callback(err);
        }
    );

    var processPackage = function(packagename, callback) {
        if (isNeedToInstall) {
            addAppToUserInDB(email, packagename, domain, isPrivateApp, autoInstall, function(err) {
                if (err) {
                    logger.info("ERROR: Internal error: " + err);
                }
                callback(err);
            });
        } else {
            // Before uninstall from private user, we need to check if the
            // app is installed on another group that the user belongs to
            // AND its IS_PRIVATE_APP_TRUE.
            isAppInstalledToGroup(email, packagename, domain, function(err, isBelongsToInstalledGroup) {
                if (isBelongsToInstalledGroup && isPrivateApp === IS_PRIVATE_APP_TRUE) {
                    // change the user_app. App removed from privated, but user still belong to group with the app.
                    changeAppPrivacyToUser(email, packagename, domain, IS_PRIVATE_APP_FALSE, function(err) {
                        if (err) {
                            logger.error("ERROR: Internal error: " + err);
                        }
                        callback(err);
                    });
                } else {
                    removeAppFromUserInDB(email, packagename, domain, isPrivateApp, function(err) {
                        if (err) {
                            logger.error("ERROR: Internal error: " + err);
                        }
                        callback(err);
                    });
                }
            });
        }
    };
}

function isAppInstalledToGroup(email, packageName, domain, callback) {
    var isBelongsToInstalledGroup = false;
    async.waterfall(
        [
            function(callback) {
                Common.db.UserGroups.findAll({
                    attributes : ['groupname'],
                    where : {
                        maindomain : domain,
                        email : email
                    }
                }).complete(function(err, results) {
                    var groups = [];
                    if (!!err) {
                        logger.error('Internal error: ' + err);
                        callback(err);
                    } else {
                        groups = _.map(results, function(item) {return item.groupname;});
                        callback(null, groups);
                    }
                });
            },
            function(groups, callback) {
                Common.db.GroupApps.findAll({
                    attributes : ['groupname'],
                    where : {
                        packagename : packageName,
                        maindomain : domain,
                        groupname: groups
                    },
                }).complete(function(err, results) {
                    if(err) {
                        logger.error('Internal error: ' + err);
                        callback(err);
                    } else {
                        if(results.length > 0) {
                            isBelongsToInstalledGroup = true;
                        }
                        callback(null);
                    }
                });
            }
        ], function(err) {
            if(err) {
                logger.error("addAppsToProfiles.js::isAppInstalledToGroup finished with err: " + err);
            }
            callback(err, isBelongsToInstalledGroup);
        }
    );
}

function changeAppPrivacyToUser(email, packageName, domain, isPrivateApp, callback) {
    ///////////ERROR: HANDLE CASE OF INSERT

    Common.db.UserApps.findAll({
        attributes : ['email', 'packagename', 'maindomain'],
        where : {
            email : email,
            packagename : packageName,
            maindomain : domain
        },
    }).complete(function(err, results) {

        if (!!err) {
            callback(err);
            return;
        }

        if (!results || results == "") {

            Common.db.UserApps.create({
                email : email,
                packagename : packageName,
                maindomain : domain,
                private : isPrivateApp
            }).then(function() {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });

        } else {

            Common.db.UserApps.update({
                private : isPrivateApp
            }, {
                where : {
                    email : email,
                    packagename : packageName,
                    maindomain : domain
                }
            }).then(function() {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        }

    });

}

function addAppToUserInDB(email, packageName, domain, isPrivateApp, autoInstall, callback) {

    // select UserApp
    Common.db.UserApps.findAll({
        attributes : ['email', 'packagename', 'maindomain'],
        where : {
            email : email,
            packagename : packageName,
            maindomain : domain
        },
    }).complete(function(err, results) {

        if (!!err) {
            callback(err);
            return;
        }

        if (!results || results == "") {
            // insert new userApp

            Common.db.UserApps.create({
                email : email,
                packagename : packageName,
                maindomain : domain,
                private : isPrivateApp,
                auto_install: autoInstall

            }).then(function(results) {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });

        } else {
            // update existing userApp
            Common.db.UserApps.update({
                email : email,
                packagename : packageName,
                maindomain : domain,
                private : isPrivateApp,
                auto_install: autoInstall
            }, {
                where : {
                    email : email,
                    packagename : packageName,
                    maindomain : domain
                }
            }).then(function() {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        }

    });

}

function removeAppFromUserInDB(email, packageName, domain, isPrivateApp, callback) {

    Common.db.UserApps.destroy({
        where : {
            email : email,
            maindomain : domain,
            packagename : packageName
        }
    }).then(function() {

        callback(null);
    }).catch(function(err) {
        callback(err);
    });

}

function insertToDeviceApps(email, deviceId, packageName, maindomain, installed, time, hrTime, callback) {

    Common.db.DeviceApps.upsert({
        email : email,
        deviceid : deviceId,
        packagename : packageName,
        maindomain : maindomain,
        installed : installed,
        time : time,
        hrtime : hrTime
    }).then(function() {
        callback(null);
    }).catch(function(err) {
        callback(err);
    });
}

function getAllUserDevices(email, appType, callback) {
    // Loop over all user's devices
    var deviceMap = {};

    let deviceTypes;
    if (appType == "deb") {
        deviceTypes = 'Desktop';
    } else {
        deviceTypes = ['Web','Android','iPhone','iPad'];
    }
    Common.db.Activation.findAll({
        attributes : ['deviceid'],
        where : {
            email : email,
            devicetype: deviceTypes,
            [Op.or]: [
                {
                    status: 1
                },
                {
                    status: 0,
                    expirationdate: {[Op.gte]: new Date()}
                }
            ]
        }
    }).complete(function(err, results) {

        if (!!err) {
            logger.error("Error while getting deviceid " + err);
            callback("Error while getting deviceid " + err);
            return;
        }
        var deviceIds = [];
        for (var i = 0; i < results.length; ++i) {
            var deviceId = results[i].deviceid;
            if (!deviceMap[deviceId]) {
                deviceMap[deviceId] = deviceId;
                deviceIds.push(deviceId);
            }
        }
        callback(null, deviceIds);

    });

}







// Returns an error message if the table is more updated
function shouldUpdateTable(curTime, curTimeHr, timeInTable, hrtimeInTable) {
    if (timeInTable > curTime) {
        return 'Found newer timestamp in device_apps1 timeInTable=' + timeInTable + ' curTimeHr=' + curTime;
    }
    if ((timeInTable == curTime) && (hrtimeInTable > curTimeHr)) {
        return 'Found newer timestamp in device_apps2 timeInTable=' + timeInTable + ' curTimeHr=' + curTime + ' hrtimeInTable=' + hrtimeInTable + ' curTimeHr=' + curTimeHr;
    }

    return null;
}

function createLogEvents(email, domain, packageNames, isNeedToInstall, callback) {
    // TODO: In some cases the mgmt does the installing by itself. Need to
    // decide which calling user to put here
    var callerEmail = email;
    var eventtype = EV_REMOVE_APP_FROM_PROFILE;
    if (isNeedToInstall) {
        eventtype = EV_ADD_APP_TO_PROFILE;
    }

    async.eachSeries(packageNames, function(packageName, cb) {
        var extra_info = 'app:' + packageName + ' email:' + email;
        // Create event in Eventlog
        eventLog.createEvent(eventtype, callerEmail, domain, extra_info, WARN, function(err) {
            if (err) logger.error(err);
            cb(null);
        });
    }, function(err) {
        callback(null);
    });
}




function addRemoveAppsForRunningUser(time, hrTime, email, packageNames, domain, isPrivateApp, isNeedToInstall, isAppStoreOnly, appType, callback) {
    var deviceIds = [];
    var installed;
    if (isNeedToInstall) {
        installed = TO_BE_INSTALLED;
    } else {
        installed = TO_BE_UNINSTALLED;
    }

    async.series([


    // Lock packages for user in user_apps
    function(callback) {
        //logger.info("addRemoveAppsForRunningUser: lockPackages_user_apps");
        lockPackages_user_apps(email, packageNames, TIME_BETWEEN_RETRIES, LOCK_RETRY, function(err, l, e) {
            packageNames = l;
            callback(err);
        });
    },
    // Update user_apps table with new app
    function(callback) {
        //logger.info("addRemoveAppsForRunningUser: updateUserAppsTableForUser");
        updateUserAppsTableForUser(packageNames, email, isNeedToInstall, domain, isPrivateApp, isAppStoreOnly, function(err) {
            callback(err);
        });
    },
    // Create events in Eventlog
    function(callback) {
        createLogEvents(email, domain, packageNames, isNeedToInstall, callback);
    },
    // Get all user devices
    function(callback) {
        if (isAppStoreOnly == 1 || isAppStoreOnly == '1') {
            callback();
            return;
        }
        //logger.info("addRemoveAppsForRunningUser: getAllUserDevices");
        getAllUserDevices(email, appType, function(err, devices) {
            deviceIds = devices;
            callback(err);
        });
    },
    function(callback) {
        if (isAppStoreOnly == 1 || isAppStoreOnly == '1') {
            callback();
            return;
        }
        if (appType == "deb" && Common.isDesktop()) {
            Common.getDesktop().debs.addRemoveAppsForDevices(deviceIds,time,hrTime,email,packageNames,domain,isNeedToInstall)
                .then(() => {
                    callback();
                }).catch(err => {
                    callback(err);
                });
        } else if (Common.isMobile()) {
            if (Common.platformType == "docker") {
                Common.getMobile().apksDocker.addRemoveAppsForDevices(deviceIds,email,packageNames,domain,isNeedToInstall)
                    .then(() => {
                        callback();
                    }).catch(err => {
                        callback(err);
                    });
            } else {
                Common.getMobile().appMgmt.addRemoveAPKsForDevices(deviceIds,time,hrTime,email,packageNames,domain,isNeedToInstall,callback);
            }
        } else {
            logger.info(`Cannot install packages: ${packageNames.join(",")}, Not found module for app type: ${appType}`);
            callback();
            return;
        }
    }], function(err) {
        if (err) {
            logger.info("ERROR: " + err);
        }
        //logger.info("addRemoveAppsForRunningUser: unlockPackages_user_apps");
        unlockPackages_user_apps(email, packageNames, TIME_BETWEEN_RETRIES, LOCK_RETRY, function(err1) {
            //unlock_DevicePackages_On_device_apps(locksLocked, locksTimeouts, TIME_BETWEEN_RETRIES, LOCK_RETRY, function(err2) {
                if (err || err1 ) {
                    callback(err + err1 );
                    return;
                }
                callback(null);
            //});
        });
    });
}

function installAppsForRunningUsers(time, hrTime, emails, packageNames, domain, isPrivateApp, isAppStoreOnly, appType, callback) {
    async.eachSeries(emails, function(email, cb) {
        addRemoveAppsForRunningUser(time, hrTime, email, packageNames, domain, isPrivateApp, true, isAppStoreOnly, appType, function(err) {
            if (err) {
                logger.info('installAppsForRunningUsers: ' + err);
            }
            cb(null);
            // Continue doing this for the rest of the users
        });
    }, function(err) {
        callback(err);
    });
}


var checkUsersInTable = function(emails, callback) {
    if(emails) {
        Common.db.User.findAll({
            attributes : ['email'],
            where : {
                email : emails
            },
        }).complete(function(err, results) {
            var missedEmails = [];
            if (!!err) {
                callback(err);
                return;
            }

            if (results.length === emails.length) {
                callback(null);
            } else {
                var resEmails = _.map(results, function(item) {return item.email;});
                missedEmails = _.difference(emails, resEmails);
		logger.error('User ' + JSON.stringify(missedEmails) + ' not found');
                callback(null);
            }
        });
    } else {
        callback(null);
    }
};

function checkAppsInTable(packageNames, domain, callback) {
    //logger.info('checkUsersInTable: packageNames= ' + packageNames);
    if(packageNames) {
        Common.db.Apps.findAll({
            attributes : ['packagename','apptype'],
            where : {
                packagename : packageNames,
                maindomain: domain
            },
        }).complete(function(err, results) {
            var missedPackageNames = [];
            if (!!err) {
                logger.info('Internal error: ' + err);
                callback(err);
                return;
            }
            let foundAppType = null;
            for (const item of results) {
                if (!foundAppType) {
                    foundAppType = item.apptype;
                } else if (foundAppType != item.apptype) {
                    callback(new Error("All app types need to be in the same type"));
                    return;
                }
            }

            if (results.length === packageNames.length) {
                callback(null,foundAppType);
            } else {
                var resPackageNames = _.map(results, function(item) {return item.packagename;});
                missedPackageNames = _.difference(packageNames, resPackageNames);
                callback('App ' + JSON.stringify(missedPackageNames) + ' not found', missedPackageNames,resPackageNames);
            }
        });
    } else {
        callback(null);
    }
}

function addAppsToProfiles(req, res, next) {

    // https://login.nubosoftware.com/addAppsToProfiles?session=[]&email=[]&packageName=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var emails = req.params.email;
    if (!emails || emails == "") {
        status = 0;
        msg = "Invalid email";
    }

    var packageNames = req.params.packageName;
    if (!packageNames || packageNames == "") {
        status = 0;
        msg = "Invalid packageName";
    }

    // If there was an error then send response
    if (status != 1) {
        res.send({
            status : status,
            message : msg
        });
        return;
    }

    // Only sysAdmin can do this operation
    loadAdminParamsFromSession(req, res, function(err, login) {

        var domain = login.loginParams.mainDomain;
        if (!require('../settings.js').getDebugMode()) {
            if (err) {
                res.send({
                    status : 0,
                    message : err
                });
                return;
            }
        } else {
            domain = "nubosoftware.com";
        }

        addAppsToProfilesInternal(domain, emails, packageNames, IS_PRIVATE_APP_TRUE, 0, function(err) {

            var status = 1;
            var msg = "Inserted app to profile Successfully";
            if (err) {
                status = 0;
                msg = err;
            }
            res.send({
                status : status,
                message : msg
            });
        });
    });
}

function addAppsToProfilesInternal(domain, emails, packageNames, isPrivateApp, isAppStoreOnly, callback) {

    if (!util.isArray(packageNames)) {
        packageNames = [packageNames];
    }

    if (!util.isArray(emails)) {
        emails = [emails];
    }

    if (isPrivateApp == null || isPrivateApp == '') {
        isPrivateApp = IS_PRIVATE_APP_FALSE;
    }

    // domain is not really needed since a specific email can't be assigned to
    // different domains
    // Verify that the users are in the users table
    checkUsersInTable(emails, function(err) {
        if (err) {
            callback(err);
            return;
        }
        //logger.info("addAppsToProfilesInternal: checkUsersInTable");
        // Verify that the apps are in the apps table (currently there is NO
        // removal from this table)
        checkAppsInTable(packageNames, domain, function(err,appType) {
            if (err) {
                logger.info(`checkAppsInTable error: ${err}`);
                callback();
                return;
            }
            // Need to create a timestamp
            var time = new Date().getTime();
            var hrTime = process.hrtime()[1];
            // Install APKs for users
            installAppsForRunningUsers(time, hrTime, emails, packageNames, domain, isPrivateApp, isAppStoreOnly, appType, callback);
        });
    });
}

// in params:
// email - user's email
// userIdInPlatforms - empty array
//
// out:
// platforms - array of Platforms
// uniquePlatforms - array of Platforms
// userIdInPlatforms - array of localid in each platform (same length as platforms)
var getUserPlatforms = function(email, devices, callback) {
    var platforms = [];
    var uniquePlatforms = [];
    var userIdInPlatforms = [];
    var foundPlatIds = [];
    var deviceIds = [];
    var j = 0;
    sessionModule.getSessionsOfUser(email, function(sessArray) {
        var i = 0;
        async.eachSeries(sessArray, function(session, callback) {
            if (devices) {
                // check if session device exists in devices. if not do not add that session
                if ( !devices.includes(session.params.deviceid) ) {
                    callback(null);
                    return;
                }
            }
            var Platform = require('../platform.js').Platform;
            new Platform(session.params.platid, '', function(err, obj) {
                if (err) {
                    console.log("Error: " + err);
                } else {
                    platforms.push(obj);
                    // Save user id for later
                    userIdInPlatforms[i] = session.params.localid;
                    i++;
                    if (!foundPlatIds[session.params.platid]) {
                        foundPlatIds[session.params.platid] = true;
                        uniquePlatforms[j] = obj;
                        j++;
                    }
                }
                callback(null);
            }); // new Session
        }, function(err) {
            if (err) {
                logger.info(err);
            }
            for (var k = 0; k < sessArray.length; ++k) {
                deviceIds[k] = sessArray[k].params.deviceid;
            }
            callback(null, platforms, uniquePlatforms, userIdInPlatforms, deviceIds); // Exit function without error
        });
    });
};

var AddAppsToProfiles = {
    get : addAppsToProfiles,
    lockPackages_user_apps : lockPackages_user_apps,
    unlockPackages_user_apps : unlockPackages_user_apps,
    addRemoveAppsForRunningUser : addRemoveAppsForRunningUser,
    insertToDeviceApps : insertToDeviceApps,
    installAppsForRunningUsers : installAppsForRunningUsers,
    TO_BE_INSTALLED : TO_BE_INSTALLED,
    IS_PRIVATE_APP_FALSE : IS_PRIVATE_APP_FALSE,
    IS_PRIVATE_APP_TRUE : IS_PRIVATE_APP_TRUE,
    loadAdminParamsFromSession : loadAdminParamsFromSession,
    checkAppsInTable : checkAppsInTable,
    addAppsToProfilesInternal : addAppsToProfilesInternal,
    getUserPlatforms : getUserPlatforms
};

module.exports = AddAppsToProfiles;
