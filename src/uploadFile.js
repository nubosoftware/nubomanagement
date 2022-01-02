"use strict";

var fs = require("fs");
var async = require("async");
var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var Login = require('./login.js');
var url = require('url');
var fs = require('fs');
var util = require('util');
var path = require('path');
var User = require('./user.js');
var sessionModule = require('./session.js');
var Session = sessionModule.Session;
var getUserPlatforms = require('./ControlPanel/addAppsToProfiles.js').getUserPlatforms;
var async = require('async');
var ThreadedLogger = require('./ThreadedLogger.js');
var nfsModule = require('./nfs.js');
var commonUtils = require('./commonUtils.js');

var UploadFile = {'uploadFileToLoginToken' : uploadFileToLoginToken};
module.exports = UploadFile;

function uploadFileToLoginToken(req, res, next) {

    var loginToken = req.params.loginToken;
    if (loginToken == undefined || loginToken.length < 5) {
        var msg = "Invalid loginToken";
        console.log( 'msg: ' + msg );
        res.send( {
            status : '0',
            message : msg
        } );
        return;
    }
    new Login( loginToken, function(err, login) {
        if (err) {
            var msg = "Invalid loginToken, err:" + err;
            res.send( {
                status : '0',
                message : msg
            } );
            return;
        }

        if (!login || login == undefined) {
            var msg = "Invalid login, login is null";
            res.send( {
                status : '0',
                message : msg
            } );
            return;
        }

        var email = login.getEmail();
        var deviceID = login.getDeviceID();
        upload( email, deviceID, req, res );

    } );
}

function upload (email, deviceID, req, res) {
    var destPath = path.resolve("/" + (req.params.destPath || "Download"));
    var existsOnSDcard = req.params.existsOnSDcard;
    var isMedia  = req.params.isMedia;
    // tmp fix until we fix client
    //var isMedia  = true;
    var dontChangeName  = req.params.dontChangeName;
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    logger.user(email);
    var folder;
    var msg;
    var nfs;

    if (isMedia) {
        destPath = "/DCIM/Camera";
    }

    // Receive body of file
    var reqBody = req.body;


    var json = JSON.parse(reqBody);
    var buf = Buffer.from(json.fileContent, 'base64');

    async.waterfall(
        [
            function (callback) {
                nfsModule(
                    {
                        nfs_idx: Common.nfsId
                    },
                    function (err, nfsobj) {
                        if (err) {
                            logger.error("Cannot create nfs obect err: " + err);
                        } else {
                            nfs = nfsobj;
                        }
                        callback(err);
                    }
                );
            },
            function (callback) {
                if (req.method !== "POST") {
                    msg = "not a post method";
                }
                callback(msg);
            },
            function (callback) {
                var saveToPath;
                if (existsOnSDcard && destPath) {
                    dontChangeName = true;
                    if (existsOnSDcard === "external://") {
                        saveToPath = 'media/' + destPath;
                        folder = commonUtils.buildPath((nfs.params.nfs_path_slow || nfs.params.nfs_path), User.getUserStorageFolder(email), saveToPath);
                    } else if (existsOnSDcard === "internal://") {
                        //TODO need to get user deviceID
                        folder = commonUtils.buildPath(nfs.params.nfs_path, User.getUserDeviceDataFolder(email, deviceID), destPath);
                    } else {
                        msg = "Upload error: wrong path";
                        logger.error(msg);
                    }
                } else {
                    saveToPath = commonUtils.buildPath('media/', destPath);
                    folder = commonUtils.buildPath((nfs.params.nfs_path_slow || nfs.params.nfs_path), User.getUserStorageFolder(email), saveToPath);
                }
                callback(msg);
            },
            function (callback) {
                Common.mkdirpCB(folder, function (err) {
                    if (err && (err.code !== 'EEXIST')) {
                        logger.error("Cannot create " + folder + " folder for upload: " + err);
                        callback(err);
                    } else {
                        changeModeOwner(folder, '775', 1023, 1023, function (err) {
                            if (err) {
                                logger.error("Error in make " + folder + " upload folder: " + JSON.stringify(err));
                            }
                            callback(err);
                        });
                    }
                });
            },
            function (callback) {
                var fileName = "tmp.jpg";

                if (isMedia) {
                    var date = new Date();
                    fileName = "IMG_" + date.getFullYear().toString()
                        + pad2(date.getMonth() + 1)
                        + pad2(date.getDate()) + "_"
                        + pad2(date.getHours())
                        + pad2(date.getMinutes())
                        + pad2(date.getSeconds()) + ".jpg";
                }

                var fullPath = commonUtils.buildPath(folder, "/", fileName);
                fs.writeFile(fullPath, buf, function (err) {
                    if (err) {
                        var msg = "Upload file error: " + err;
                        logger.error(msg);
                        callback(msg);
                    } else {
                        logger.info("The file was saved, fullPath: " + fullPath);
                        changeModeOwner(fullPath, '664', 1023, 1023, function (err) {
                            if (err) {
                                logger.error("Error in set permissions to  " + fullPath + ", err: " + err);
                            }
                            callback(err, fileName);
                        });
                    }
                });
            },
            function (fileName, callback) {
                broadcastMediaIntentOnPlatforms(email, destPath + "/" + fileName, function () { });
                callback(null);
            },
        ], function (err) {
            if (err) {
                res.send({ status: 0, message: msg });
            } else {
                res.send({ status: 1, message: msg });
            }
        }
    );


}

function pad2(n) {
    return n < 10 ? '0' + n : n
}

/**
    Sends a broadcast intnet on user's platforms to inform them on new photos/videos
    @email                  user's email
    @partialPathToFiles     Array containing the paths to all new media files  (i.e DCIM/Camera/1.jpg)
**/
function broadcastMediaIntentOnPlatforms (email, partialPathToFiles, callback) {
    var platforms = [];
    var userIdInPlatforms = [];
    var platUserObjs = [];

    async.series([
    // Generate a list of all user's platforms
    function(callback) {
        var session = require('./session.js');
        getUserPlatforms(email, null, function(err, p, u, userIds, devices) {
            platforms = p;
            userIdInPlatforms = userIds;
            callback(null);
        });
    },
    // Create array of objects {platform, userId}
    function(callback) {
        for(var i=0;i<platforms.length;i++){
            platUserObjs.push({platform:platforms[i],userId:userIdInPlatforms[i]});
        }
        callback(null);
    },
    // Send a broadcast Intent
    function(callback) {
        // Go over all user's platforms
        async.eachSeries(platUserObjs, function(platformObj, cb1) {
            // Support for multiple file uploads (not supported yet in REST)
            var platform = platformObj.platform;
            var userId = platformObj.userId;

            platform.refreshMedia(userId, partialPathToFiles, function() {
                cb1(null);
            });
        }, function(err) {
            callback(null);
        });
    }], function(err) {
        // No need to check for errors here
        callback(null);
    });
}

function changeModeOwner(file, mode, uid, gid, callback) {
    async.series(
        [
            function(callback) {
                fs.chmod(file, mode, callback);
            },
            function(callback) {
                fs.chown(file, uid, gid, callback);
            }
        ],
        callback
    );
}
