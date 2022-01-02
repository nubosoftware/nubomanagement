"use strict"

const async = require('async');
const fs = require('fs');

const execFile = require('child_process').execFile;
const commonUtils = require('../commonUtils.js');
const _ = require('underscore');
var Common = require('../common.js');
var logger = Common.getLogger(__filename);

Common.loadCallback = main;

function main(err) {
    if (err) {
        Common.quit(1);
        return;
    }

    process.on('SIGINT', function() {
        logger.info("waiting for upgrade to finish...");
    });

    process.on('SIGTSTP', function() {
        logger.info("waiting for upgrade to finish...");
    });

    adjustUserStroage(function(err) {
        if (err) {
            console.log("err: " + err);
            Common.quit(1);
        }

        logger.info("done");
        Common.quit();
    });

}

function adjustUserStroage(callback) {

    async.waterfall([
        function(callback) {
            execFile(Common.globals.LS, [Common.nfshomefolder], function(err, stdout, stderr) {
                if (err) {
                    logger.error("adjustUserStroage: " + err);
                    return callback(err)
                }

                // todo bigger buffer
                var nfsStorage = stdout.split("\n");

                function filterOrgs(arg) {
                    return !(arg == "" || arg == 'html' || arg == 'new_user.tar.gz' || arg == 'new_user7.tar.gz' || arg == 'packages.list' || arg == 'apks' || arg == 'media');
                }

                var nfsStorageFiltered = nfsStorage.filter(filterOrgs);
                return callback(null, nfsStorageFiltered);
            })
        },
        function(nfsStorageFiltered, callback) {
            Common.db.Orgs.findAll({
                attributes: ['maindomain']
            }).complete(function(err, results) {
                if (!!err) {
                    logger.error("adjustUserStroage: " + err);
                    return callback(err);
                }

                var dbOrgs = [];

                if (!results || results === "") {
                    return callback(null, dbOrgs);
                }

                results.forEach(function(row) {
                    dbOrgs.push(row.maindomain)
                });

                var filtered = _.intersection(nfsStorageFiltered, dbOrgs);
                return callback(null, filtered);
            });
        },
        function(orgs, callback) {

            async.eachSeries(orgs, function(org, callback) {

                var orgStorage = commonUtils.buildPath(Common.nfshomefolder, org);

                execFile(Common.globals.LS, [orgStorage], function(err, stdout, stderr) {
                    if (err) {
                        return callback(err);
                    }

                    var orgUsersStorage = stdout.split('\n');

                    function filterUsers(arg) {
                        return !(arg == "" || arg == "vpn.ovpn");
                    }

                    var orgUsersStorageFiltered = orgUsersStorage.filter(filterUsers);

                    async.eachSeries(orgUsersStorageFiltered, function(user, callback) {

                        var userStorage = commonUtils.buildPath(orgStorage, user);

                        execFile(Common.globals.LS, [userStorage], function(err, stdout, stderr) {
                            if (err) {
                                logger.error("adjustUserStroage: " + err);
                                return callback(err);
                            }

                            var userDeviceStorage = stdout.split('\n');

                            function filterUsers(arg) {
                                return !(arg == "" || arg == 'storage');
                            }

                            var userDeviceStorageFiltered = userDeviceStorage.filter(filterUsers);

                            async.eachSeries(userDeviceStorageFiltered, function(device, callback) {
                                if (err) {
                                    logger.error("adjustUserStroage: " + err);
                                    return callback(err);
                                }

                                var userDeviceStoragePath = commonUtils.buildPath(userStorage, device);
                                adjustUserStroageHelper(userDeviceStoragePath, function(err) {
                                    if (err) {
                                        return callback(err);
                                    }

                                    logger.info("adjustUserStroage: user: " + user + " with device: " + device + " upgraded");
                                    return callback(null);
                                });
                            }, callback);
                        });
                    }, callback);
                });
            }, callback);
        }
    ], function(err) {
        if (err) {
            return callback(err);
        }

        logger.info("adjustUserStroage: done");
        return callback(null);
    });
}


function adjustUserStroageHelper(userStoragePath, callback) {
    var userTmpFolder = "/tmp/nuboUserTmp/";

    if (fs.existsSync(commonUtils.buildPath(userStoragePath, "misc_ce"))) {
        logger.debug("adjustUserStroageHelper: user device at: " + userStoragePath + " upgraded already");
        return callback(null);
    }

    async.waterfall([
        function(callback) {
            fs.mkdir(userTmpFolder, callback);
        },
        function(callback) {
            var tarParams = ["xzf", commonUtils.buildPath(Common.nfshomefolder, "new_user7.tar.gz"), "-C", userTmpFolder];
            execFile(Common.globals.TAR, tarParams, function(err, stdout, stderr) {
                if (err) {
                    return callback(err);
                }

                callback(null);
            });
        },
        function(callback) {
            execFile(Common.globals.LS, [userStoragePath], function(err, stdout, stderr) {
                if (err) {
                    return callback(err);
                }

                var userDeviceData = stdout.split('\n');

                function filterFolders(arg) {
                    return !(arg == "" || arg == 'Session.xml' || arg == 'autoLogin' || arg == 'system');
                }

                var userDeviceDataFiltered = userDeviceData.filter(filterFolders);

                callback(null, userDeviceDataFiltered);
            });
        },
        function(userDataFolders, callback) {
            async.eachSeries(userDataFolders, function(folder, callback) {
                var mvFolder = commonUtils.buildPath(userStoragePath, folder);

                var args = [mvFolder, commonUtils.buildPath(userTmpFolder, "user/")]
                var userAppFolder = commonUtils.buildPath(userTmpFolder, "user/", folder);

                if (fs.existsSync(userAppFolder)) {

                    async.waterfall([
                        function(callback) {
                            fs.stat(userAppFolder, function(err, stats) {
                                if (err) {
                                    return callback(err);
                                }

                                callback(null, stats.uid, stats.gid);
                            })
                        },
                        function(uid, gid, callback) {
                            execFile(Common.globals.RM, ["-rf", userAppFolder], function(err, stdout, stderr) {
                                if (err) {
                                    return callback(err);
                                }

                                return callback(null, uid, gid);
                            });
                        },
                        function(uid, gid, callback) {
                            execFile(Common.globals.MV, args, function(err, stdout, stderr) {
                                if (err) {
                                    return callback(err);
                                }

                                return callback(null, uid, gid);
                            });
                        },
                        function(uid, gid, callback) {
                            var libLink = commonUtils.buildPath(userAppFolder, "lib");

                            execFile(Common.globals.RM, [libLink], function(err, stdout, stderr) {
                                if (err) {
                                    return callback(null, uid, gid);
                                }

                                return callback(null, uid, gid);
                            });
                        },
                        function(uid, gid, callback) {
                            var premissons = uid + ":" + gid;
                            execFile(Common.globals.CHOWN, ["-R", premissons, userAppFolder], function(err, stdout, stderr) {
                                if (err) {
                                    return callback(err);
                                }

                                return callback(null);
                            });
                        }
                    ], callback)

                } else {
                    execFile(Common.globals.MV, args, function(err, stdout, stderr) {
                        if (err) {
                            return callback(err);
                        }

                        return callback(null);
                    });
                }
            }, function(err) {
                if (err) {
                    return callback(err);
                }

                callback(null);
            });
        },
        function(callback) {
            var oldSystemFiles = ["accounts.db", "accounts.db-journal", "inputmethod", "media", "package-restrictions.xml", "settings.db", "settings.db-journal"];

            async.eachSeries(oldSystemFiles, function(file, callback) {
                var dst = commonUtils.buildPath(userTmpFolder, "/system/users/");
                var src = commonUtils.buildPath(userStoragePath, "/system/", file);

                if (!fs.existsSync(src)) {
                    return callback(null);
                }

                execFile(Common.globals.CP, ["-arf", src, dst], function(err, stdout, stderr) {
                    if (err) {
                        return callback(err);
                    }

                    return callback(null);
                });

            }, callback);
        },
        function(callback) {
            execFile(Common.globals.RM, ["-rf", commonUtils.buildPath(userStoragePath, "/system")], function(err, stdout, stderr) {
                if (err) {
                    return callback(err);
                }

                return callback(null);
            });
        },
        function(callback) {
            var newFolders = ["misc", "misc_ce", "misc_de", "system", "system_ce", "system_de", "user", "user_de"];

            async.eachSeries(newFolders, function(folder, callback) {
                var src = commonUtils.buildPath(userTmpFolder, folder);
                execFile(Common.globals.MV, [src, userStoragePath], function(err, stdout, stderr) {
                    if (err) {
                        return callback(err);
                    }

                    return callback(null);
                });
            }, callback);
        },
        function(callback) {
            var sessionXML = commonUtils.buildPath(userStoragePath, "/Session.xml");

            if (!fs.existsSync(sessionXML)) {
                return callback(null);
            }
            execFile(Common.globals.RM, [sessionXML], function(err, stdout, stderr) {
                if (err) {
                    return callback(err);
                }

                return callback(null);
            });
        },
        function(callback) {
            execFile(Common.globals.RM, ["-rf", userTmpFolder], function(err, stdout, stderr) {
                return callback(err);
            })
        }
    ], function(err) {
        if (err) {
            logger.error("adjustUserStroageHelper: " + err);
            return callback(err);
        }

        callback(null);
    });
}