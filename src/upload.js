"use strict";

var fs = require("fs");
var async = require("async");
var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var Login = require('./login.js');
var url = require('url');
var formidable = require('formidable');
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

var Upload = {'uploadToSession': uploadToSession,
        'uploadToLoginToken' : uploadToLoginToken,
        'uploadDummyFile' : uploadDummyFile,
        uploadFromNuboAdmin
};

module.exports = Upload;

function uploadToLoginToken(req, res, next) {
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
            console.log( 'loginToken err: ' + err );
            var msg = "Invalid loginToken, err:" + err;
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

function uploadDummyFile(req, res) {
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
        } else {
            var logger = new ThreadedLogger(Common.getLogger(__filename));
            var msg = "";
            async.waterfall( [
                    function(callback) {
                        req.headers['content-type'] = req.headers['content-type'] || "octet-stream";
                        const ip = req.socket.remoteAddress;
                        const port = req.socket.remotePort;
                        logger.info(`uploadDummyFile: ${ip}:${port}`);
                        var form = new formidable.IncomingForm();
                        form.on( 'fileBegin', function(name, file) {
                            logger.info( "uploadDummyFile. fileBegin" );
                            file.path = "/dev/null";
                        });

                        let lastBytesReceived = 0;

                        form.on('progress', (bytesReceived, bytesExpected) => {
                            if (bytesReceived - lastBytesReceived > 100000 || bytesReceived == bytesExpected) {
                                logger.info(`uploadDummyFile: ${bytesReceived}/${bytesExpected} bytes`);
                                lastBytesReceived = bytesReceived;
                            }
                        });



                        form.parse( req, function(err, fields, files) {
                            logger.logTime( "uploadDummyFile . upload ended" );
                            if (err) {
                                msg = "Upload error: " + err;
                                logger.error( msg );
                                callback( msg );
                                return;
                            }
                            if (files != null) {
                                callback( null );
                            } else { // files == null
                                msg = "No files defined";
                                callback( msg );
                            }
                        } );
                    },
            ], function(err) {
                if (err) {
                    res.send( {
                        status : 0,
                        message : msg
                    } );
                } else {
                    res.send( {
                        status : 1,
                        message : msg
                    } );
                }
            } );
        }
    } );
}


function uploadFromNuboAdmin (req, res, next) {
    let adminLogin = req.nubodata.adminLogin;
	if (adminLogin == undefined || adminLogin.getAdminConsoleLogin() != 1) {
	  var msg = "Invalid credentials";
	  res.send({status: '0' , message: msg});
	  return;
	}
	logger.info("Upload from nubo admin "+ adminLogin.getEmail());
	let email = adminLogin.getEmail();
    let deviceID = "nubo_admin";
	upload(email, deviceID, req, res);

}

function uploadToSession (req, res, next) {
    var session = req.params.session;
	if (session == undefined || session.length < 4 ) {
	  var msg = "Invalid session";
	  res.send({status: '0' , message: msg});
	  return;
	}
	logger.info("Upload from session "+ session);

	new Session(session,function(err,obj) {
	     if (err || !obj) {
		   var msg = "Session does not exist. err:"+err;
		   logger.info(msg);
		   res.send({status: '0' , message: "Cannot find session"});
		   return;
		 }
		 var email = obj.params.email;
         var deviceID = obj.params.deviceid;
		 upload(email, deviceID, req, res);
	});
}


function upload (email, deviceID, req, res) {
    var destPath = path.resolve("/" + (req.params.destPath || "Download"));
    var existsOnSDcard = req.params.existsOnSDcard;
    var isMedia  = req.params.isMedia;
    var dontChangeName  = req.params.dontChangeName;
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    logger.user(email);
    var folder;
    var msg;
    var nfs;
    let uploadFileName;
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
                        } else {
                            nfs = nfsobj;
                        }
                        callback(err);
                    }
                );
            },
            function(callback) {
                if(req.method !== "POST") {
                    msg = "not a post method";
                }
                callback(msg);
            },
            function(callback) {
                var saveToPath;
                let dockerPlatform = (Common.platformType == "docker");
                logger.info(`Upload. existsOnSDcard: ${existsOnSDcard}, destPath: ${destPath}`);
                if (existsOnSDcard && destPath) {
                    dontChangeName = true;
                    if (existsOnSDcard === "external://") {
                        // if (dockerPlatform) {
                        //     saveToPath = '0/'+ destPath;
                        // } else {
                        saveToPath = 'media/'+ destPath;
                        // }

                        folder = commonUtils.buildPath(Common.nfshomefolder, User.getUserStorageFolder(email), saveToPath);
                    } else if (existsOnSDcard === "internal://") {
                        //TODO need to get user deviceID
                        folder = commonUtils.buildPath(nfs.params.nfs_path, User.getUserDeviceDataFolder(email, deviceID), destPath);
                    } else {
                        msg = "Upload error: wrong path";
                        logger.error(msg);
                    }
                } else {
                    // if (dockerPlatform) {
                    //     saveToPath = '0/'+ destPath;
                    //     ///Android/data/com.nubo.camera.test/files/Pictures
                    // } else {
                    saveToPath = 'media/'+ destPath;
                    // }
                    folder = commonUtils.buildPath(Common.nfshomefolder, User.getUserStorageFolder(email), saveToPath);
                    logger.info(`Upload folder: ${folder}`);
                }
                callback(msg);
            },
            function(callback) {
                Common.mkdirpCB(folder, function (err) {
                    if (err && (err.code !== 'EEXIST')) {
                        logger.error("Cannot create " + folder + " folder for upload: " + err);
                        callback(err);
                    } else {
                        changeModeOwner(folder, '775', 1023, 1023, function (err) {
                            if(err) {
                                logger.error("Error in make " + folder + " upload folder: " + JSON.stringify(err));
                            }
                            callback(err);
                        });
                    }
                });
            },
            function(callback) {
                console.log("files: "+JSON.stringify(req.files,null,2));
                let files = req.files;
                if (files!=null) {
                    // Is true if any of the files uploads went wrong
                    var errorOccured = false;
                    // For use in broadcast intent
                    var partialPathToFiles = [];
                    var fkeys = Object.keys(files);
                    async.eachSeries(
                        fkeys,
                        function(fkey, cb) {
                            var fpath = files[fkey].path;
                            var fname = files[fkey].name;
                            uploadFileName = fname;
                            logger.info("fpath="+fpath+", fname: "+fname);
                            async.series(
                                 [
                                function(callback) {
                                    changeModeOwner( fpath, '664', 1023, 1023, function(err) {
                                        if (err) {
                                            msg = "Cannot change credentials of " + fpath + " file";
                                        }
                                        callback( msg );
                                    } );
                                }, function(callback) {
                                    var newfile = commonUtils.buildPath(folder, path.sep, fname);
                                    commonUtils.moveFile( fpath, newfile, function(err) {
                                        if (err) {
                                            msg = "Cannot move uploaded " + fpath + " file";
                                            console.error(err);
                                        }
                                        logger.info("File " + newfile + " ready for usage");
                                        var partialPath = commonUtils.buildPath(destPath, fname);
                                        logger.info("partialPath " + partialPath + " added");
                                        partialPathToFiles.push(partialPath);
                                        callback( msg );
                                    } );
                                }
                        ], function(err) {
                                    if(err) {
                                        logger.error("Error while processing uploaded file " + fpath + " err: " + err);
                                    }
                                    cb(err);
                                }
                            );
                        },
                        function(err) { // end of eachSeries
                            if (err) {
                                msg = "Something went wrong";
                            } else {
                                logger.logTime("files ready");
                                msg = "File uploaded";
                            }
                            // Send intent even if some of the files were not uploaded correctly
                            if (isMedia) {
                                broadcastMediaIntentOnPlatforms(email, partialPathToFiles, function(){});
                            }
                            callback(err);
                        }
                    );
                } else { // files == null
                    msg = "No files defined";
                    callback(msg);
                }
            },
        ], function(err) {
            if(err) {
                logger.info("Upload error: "+msg);
                res.send({status: 0 , message: msg});
            } else {
                if (deviceID != "nubo_admin") {
                    res.send({status: 1 , message: msg});
                } else {
                    res.send({status: 1 , message: msg, uploadFileName});
                }
            }
        }
    );
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
