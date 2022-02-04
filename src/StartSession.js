"use strict";

require('date-utils');
var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var Login = require('./login.js');
var async = require('async');
var platformModule = require('./platform.js');
var Platform = platformModule.Platform;
var sessionModule = require('./session.js');
var Session = sessionModule.Session;
var TimeLog = require('./timeLog.js').TimeLog;
var ThreadedLogger = require('./ThreadedLogger.js');
var User = require('./user.js');
var gatewayModule = require('./Gateway.js');
var deleteAppModule = require('./ControlPanel/deleteAppFromProfiles.js');
var addAppModule = require('./ControlPanel/addAppsToProfiles.js');
var uninstallFunc = deleteAppModule.uninstallAPKForUserOnPlatforms;
var nfsModule = require('./nfs.js');
var Lock = require('./lock.js');
var _ = require('underscore');
var CommonUtils = require("./commonUtils.js");
var path = require('path');
const { l } = require('accesslog/lib/tokens');


var StartSession = {
    func: startSession,
    startSessionImp : startSessionImp,
    endSession: endSession,
    logoutUser: logoutUser,
    startSessionByDevice: startSessionByDevice,
    declineCall,
    closeOtherSessions,
    closeSessionOfUserDevice
};

module.exports = StartSession;

function sendEmailToAdmin(subj, text, callback) {
    if (!Common.adminEmail) {
        callback(null);
        return;
    }
    var mailOptions = {
        from: Common.emailSender.senderEmail, // sender address
        fromname: Common.emailSender.senderName,
        to: Common.adminEmail, // list of receivers
        toname: Common.adminName,
        subject: subj, // Subject line
        text: text
    };
    mailOptions.html = mailOptions.text.replace(/\n/g, "<br />");
    Common.mailer.send(mailOptions, function(success, message) {
        if (!success) {
            var msg = "sendgrid error: " + message;
            logger.info(msg);
            callback(msg);
        } else {
            callback(null);
            //logger.info("Message sent to "+email);
        }
    }); //Common.mailer.send
}

function startSession(req, res, next) {
    var startSessionParams = {
        clientIP: req.headers["x-client-ip"],
        loginToken: req.params.loginToken,
        timeZone: req.params.timeZone,
        platid: req.params.platid
    }
    if (req.body && req.body.width) {
        startSessionParams.deviceParams = req.body;
        logger.info(`startSession. reading deviceParams from request`);
    }
    res.contentType = 'json';
    startSessionImp(startSessionParams).then( respParams => {
        response2Client(respParams.session, respParams.resObj, res, respParams.isLocalIP, respParams.logger, respParams.loginToken);
    }).catch(respParams => {
        response2Client(respParams.session, respParams.resObj, res, respParams.isLocalIP, respParams.logger, respParams.loginToken);
    });

}

function startSessionByDevice(email,imei,userDeviceData,cb) {
    let userData;
    let activationData;
    let login;
    logger.info(`startSessionByDevice. email: ${email}, imei: ${imei}`);
    async.series([
        function(cb) {
            // load user data
            require('./userUtils.js').createOrReturnUserAndDomain(email, logger, function(err, user, userObj, orgObj) {
                if (err) {
                    logger.info("startSessionByDevice. User load error: ",err);
                    cb(err);
                    return;
                }
                userData = user;
                userData.org = orgObj;
                cb()
            });
        },
        function(cb) {
            // read activation data
            Common.db.Activation.findAll({
                attributes: ['activationkey', 'status', 'email', 'deviceid', 'firstlogin', 'resetpasscode', 'firstname', 'lastname', 'jobtitle', 'devicetype', 'secondAuthRegistred','expirationdate'],
                where: {
                    email: email,
                    deviceid: imei,
                    status: 1
                },
            }).then(function(results) {
                if (!results || results == "") {
                    var errMsg = "startSessionByDevice. activationKey not found!";
                    logger.error(errMsg);
                    cb(errMsg);
                    return;
                }
                activationData = results[0];
                cb(null);
            }).catch(err => {
                logger.error("startSessionByDevice getActivationInfo: " + err);
                cb(err);
            });
        },
        function(cb) {
            // create Login object
            new Login(null, function (err, newLogin) {
                if (err) {
                    logger.error('startSessionByDevice. Create login error ', err);
                    cb(err);
                    return;
                }

                login = newLogin;
                login.setAuthenticationRequired(false);
                login.setPasscodeActivationRequired(false);
                login.setValidPassword(true);
                login.loginParams.clientauthtype = Common.CLIENT_AUTH_TYPE_NONE;
                login.setValidLogin(true);
                cb(null);
            });
        },
        function(cb) {
            // add parameters to login
            login.setDeviceName(userDeviceData.devicename);
            login.setDeviceID(userDeviceData.imei);
            login.setEmail(userData.email);
            login.setUserName(userData.username);
            login.setImUserName(userData.username);
            login.setActivationKey(activationData.activationkey);
            login.setIsAdmin(userData.isAdmin);
            login.setMainDomain(userData.domain);
            login.setDeviceType(activationData.devicetype ? activationData.devicetype : '');
            login.setLang(userData.lang);
            login.setCountryLang(userData.countrylang);
            login.setLocalevar(userData.localevar);
            login.setEncrypted(userData.encrypted);
            login.setDcname(userData.dcname ? userData.dcname : Common.dcName);
            login.setDcurl(userData.dcurl ? userData.dcurl : Common.dcURL);
            login.setOwaUrl(userData.org.owaurl);
            login.setOwaUrlPostAuth(userData.org.owaurlpostauth);
            login.setRefererUrl(userData.org.refererurl);
            login.loginParams.passcodeexpirationdays = userData.passcodeexpirationdays;
            login.loginParams.passcodeupdate = userData.passcodeupdate;
            login.loginParams.exchangeencoding = userData.org.exchangeencoding;
            login.setSecondFactorAuth(Common.secondFactorAuthType.NONE);
            login.loginParams.secondAuthRegistred = activationData.secondAuthRegistred;

            login.save(function (err, login) {
                if (err) {
                    logger.error('startSessionByDevice. Save login error ', err);
                    cb(err);
                    return;
                }
                cb(null);
            });
        },
        function(cb) {
            var startSessionParams = {
                clientIP: "0.0.0.0",
                loginToken: login.getLoginToken()
            }
            startSessionImp(startSessionParams).then( respParams => {
                logger.info("startSessionByDevice. Started: "+JSON.stringify(respParams));
                cb(null);
            }).catch(respParams => {
                logger.info("startSessionByDevice. Error: "+JSON.stringify(respParams));
                cb(respParams.err);
            });
        }
    ], function(err, results) {
        cb(err);
    });
}

function startSessionImp(startSessionParams) {

    // https://login.nubosoftware.com/startsession?loginToken=[loginToken]?timeZone=[timeZome]
    var logger = new ThreadedLogger(Common.getLogger(__filename));

    var msg = "";
    var status = 100; //unknown

    //read and validate params
    var clientIP = startSessionParams.clientIP;
    var isLocalIP = (clientIP && clientIP.indexOf(Common.internal_network) == 0) ? true : false;
    var loginToken = startSessionParams.loginToken;
    var timeZone = startSessionParams.timeZone || Common.defaultTimeZone;
    var platid = startSessionParams.platid;
    var fastConnection = startSessionParams.fastConnection ? startSessionParams.fastConnection : null;
    var loginData;
    var webClient;
    var resObj;

    var promise = new Promise((resolve,reject) => {
        let promiseCB = {
            resolve: resolve,
            reject: reject
        }
        async.waterfall([
            function(callback) {
                new Login(loginToken, function(err, login) {
                    if (err) {
                        resObj = {
                            status: 0,
                            message: 'Internal error. Please contact administrator.'
                        };

                        logger.error("startSession. Login error: " + err);
                        console.error(err);
                        return callback(err);
                    }

                    if (!login || (!fastConnection && !login.isValidLogin())) {
                        var msg = "login isn\'t valid for user " + (login ? login.getUserName() : "");
                        resObj = {
                            status: 2,
                            message: msg,
                            loginToken: 'notValid'
                        };
                        logger.error("startSession. Login error 2: " + msg);
                        callback(msg);
                        return;
                    }
                    logger.user(login.getEmail());
                    logger.device(login.getDeviceID());
                    logger.info("Start session", {
                        mtype: "important"
                    });
                    loginData = login;
                    if (login.getDeviceID())
                        webClient = login.getDeviceID().includes("web");
                    else
                        webClient = false;
                    callback(null);
                });
            },
            function(callback) {
                if (Common.restrictWebClientAccess && webClient) {
                    if (CommonUtils.webclientAllowedToaccess(clientIP)) {
                        return callback(null);
                    } else {
                        resObj = {
                            status: 0,
                            message: 'Internal error. Please contact administrator.'

                        };
                        var m = "web client accesses from unallowed network, shouldn't get here!!!!!!!!";
                        logger.error("startSession: " + m);
                        return callback(m);
                    }
                }

                callback(null);
            },
            function(callback) {
                User.getUserDataCenter(loginData.getEmail(), logger, function(err, dcname, dcurl) {
                    if (err) {
                        resObj = {
                            status: 0,
                            message: 'Internal error. Please contact administrator.'
                        };
                        logger.error("startSession. getUserDataCenter error 3: " + err);
                        callback(err);
                        return;
                    }
                    if (dcname && dcname != loginData.getDcname()) {
                        var msg = "user logged in at diffrent data center and need to be redirected";
                        resObj = {
                            status: 2,
                            message: msg,
                            loginToken: 'notValid'
                        };
                        logger.error("startSession. getUserDataCenter error 4: " + msg);
                        callback(msg);
                        return;
                    }

                    callback(null);
                });
            },
            function(callback) {
                if (startSessionParams.deviceParams) {
                    // write new value for session_cache_params
                    let session_cache_params = JSON.stringify(startSessionParams.deviceParams);
                    Common.db.UserDevices.update({
                        session_cache_params: session_cache_params
                    }, {
                        where: {
                            email: loginData.getEmail(),
                            imei: loginData.getDeviceID()
                        }
                    }).then(function() {
                        callback(null);
                    }).catch(function(err) {
                        var errMsg = 'start session. Update session_cache_params: ' + err;
                        logger.error(errMsg);
                        callback();
                    });
                } else {
                    // try to read old value for session_cache_params
                    Common.db.UserDevices.findOne({
                        attributes: ['session_cache_params'],
                        where: {
                            imei: loginData.getDeviceID(),
                            email: loginData.getEmail()
                        }
                    }).then(function (result) {
                        if (result && result.session_cache_params) {
                            startSessionParams.deviceParams = JSON.parse(result.session_cache_params);
                            if (!startSessionParams.timeZone && startSessionParams.deviceParams.timeZone) {
                                timeZone = startSessionParams.deviceParams.timeZone;
                            }
                            //logger.info("start session. Read session_cache_params: "+result.session_cache_params);
                        }
                        callback();
                    }).catch(function (err) {
                        logger.info("Error reading UserDevice: " + err);
                        callback();
                    });
                }
            },
            function(callback) {
                nfsModule({
                        UserName: loginData.getEmail(),
                        logger: logger,
                        nfs_idx: Common.nfsId
                    },
                    function(err, nfs) {
                        if (err) {
                            resObj = {
                                status: 0,
                                message: 'Internal error. Please contact administrator.'
                            };

                            logger.error("startSession. nfs error 5:  " + err+", nfs_idx: "+Common.nfsId);
                            callback(err);
                            return;
                        }
                        
                        callback(null);
                    });
            },
            function(callback) {
                startOrJoinSession(startSessionParams, loginData, 1, platid, timeZone, logger, function(err, session) {
                    if (err) {
                        resObj = {
                            status: (err.startSessionStatus ? err.startSessionStatus : 0),
                            message: (err.startSessionMessage ? err.startSessionMessage :  'Internal error. Please contact administrator.'),
                        };
                        if (err.startSessionErrorCode) {
                            resObj.startSessionErrorCode = err.startSessionErrorCode;
                        }
                        logger.error(`startSession: starting user session failed. err: ${JSON.stringify(err)}`,{
                            mtype: "important"
                        });
                    } else {
                        logger.info("startSession: user session started succefully",{
                            mtype: "important"
                        });
                    }
                    callback(null, session);
                });
            }
        ], function(err, session) {

            let retParams = {
                err: err,
                session: session,
                resObj: resObj,
                isLocalIP: isLocalIP,
                logger: logger,
                loginToken: loginToken
            };
            if (err) {
                promiseCB.reject(retParams);
            } else {
                promiseCB.resolve(retParams);
            }
        });
    });
    return promise;
}

function copyFile(src, dst, callback) {
    var reader = Common.fs.createReadStream(src);
    var writer = Common.fs.createWriteStream(dst);
    var isFinished = false;
    reader.pipe(writer);
    writer.on('finish', function() {
        logger.info("Finished writing to " + dst);
        if (!isFinished)
            callback(null);
    });
    writer.on('error', function(err) {
        logger.info("Error writing to " + dst + ": " + err);
        if (!isFinished) {
            isFinished = true;
            callback("Error writing to " + dst);
        }
    });
    reader.on('error', function(err) {
        logger.info("Error reading from " + src + ": " + err);
        if (!isFinished) {
            isFinished = true;
            callback("Error reading from " + src);
        }
    });
}

function setPerUserEnvironments(session, login, timeZone, callback) {
    var email = session.params.email;
    var localid = session.params.localid;
    var errormsg = "";

    var lang = login.loginParams.lang;
    var countrylang = login.loginParams.countrylang;
    var localevar = login.loginParams.localevar;

    var lineLanguage = 'setprop persist.sys.language.u' + localid + ' \"' + lang + '\"';
    var lineCountryLang = 'setprop persist.sys.country.u' + localid + ' \"' + countrylang + '\"';
    var lineLocalevar = 'setprop persist.sys.localevar.u' + localid + ' \"' + localevar + '\"';

    var cmd = lineLanguage + ';\\\n' + lineCountryLang + ';\\\n' + lineLocalevar + ';\\\n';
    if (timeZone !== null && timeZone !== "") {
        cmd = cmd + 'setprop persist.sys.timezone.u' + localid + ' \"' + timeZone + '\";\\\n';
    } else {
        session.logger.error("ERROR: missing timeZone param.");
    }
    session.logger.info("cmd:\n" + cmd);
    session.platform.exec(cmd, function(err, code, signal, sshout) {
        if (err) {
            var msg = "Error in adb shell: " + err;
            session.logger.info(msg);
        }
        callback(null);
    }); // ssh.exec
}

// Check whether the user has apps that need to be uninstalled and uninstall them
function uninstallUserApps(session, login, callback) {
    var email = session.params.email;
    var localid = session.params.localid;
    var platform = session.platform;
    var deviceID = session.params.deviceid;
    var domain = login.loginParams.mainDomain;
    var status;
    var msg;
    // Go over all new packages
    Common.db.DeviceApps.findAll({
        attributes: ['packagename'],
        where: {
            email: email,
            deviceid: deviceID,
            installed: -1
        },
    }).then(function(results) {
        if (!results || results == "") {
            status = 2;
            // invalid parameter
            msg = "No need to uninstall packages for user.";
            logger.info(msg);
            callback(null);
            return;
        }

        var packageName;
        async.eachSeries(results, function(row, callback) {
            packageName = row.packagename != null ? row.packagename : '';
            logger.info('Uninstalling package ' + packageName + ' for user ' + localid);
            var platforms = [platform];
            var userIdInPlatforms = [localid];
            var deviceIds = [deviceID];
            deleteAppModule.uninstallAppForUserOnPlatforms(email, platforms, deviceIds, packageName, userIdInPlatforms, domain, callback);
        }, function(err) {
            if (err) {
                logger.info(err);
            }
            callback(err);
        });
    }).catch(err => {
        status = 3;
        // internal error
        msg = "Internal error: " + err;
        logger.info(msg);
        callback(null);
    });
}

/* disableBrowserApp
 * Disables com.android.browser package for browser clients
 * @param session    session Object
 * @param callback
 */
function disableBrowserApp(session, callback) {
    var localid = session.params.localid;
    var platform = session.platform;
    var cmd = 'pm disable --user ' + localid + ' com.android.browser';
    platform.exec(cmd, function(err, code, signal, sshout) {
        callback(err);
    }); // ssh.exec
}

// This function should been called after session and platform locked
// session can been null, platform can been null
function endSessionLocked(session, platform, callback) {
    var addToErrorsPlatforms = false;
    if (session) {
        var sessLogger = session.logger;        
        var UNum = (platform && session.params.localid) ? session.params.localid : 0;
        async.series([
            // mark delete flag
            function(callback) {
                if (UNum != 0) {
                    async.series([
                        function(callback) {
                            session.params.deleteFlag = 1;
                            var now = new Date();
                            session.params.endTime = now.toFormat("YYYY-MM-DD HH24:MI:SS");
                            var endTS = now.getTime();
                            var msec = endTS - session.params.startTS;
                            var hh = Math.floor(msec / 1000 / 60 / 60);
                            msec -= hh * 1000 * 60 * 60;
                            var mm = Math.floor(msec / 1000 / 60);
                            msec -= mm * 1000 * 60;
                            var ss = Math.floor(msec / 1000);
                            msec -= ss * 1000;
                            session.params.totalSessionTime = (hh > 0 ? hh + ' hours, ' : '') + (mm ? mm + ' minutes, ' : '') + (ss ? ss + ' seconds' : '');
                            session.save(callback);
                        },
                        function(callback) {
                            if (platform.params['connection_error']) {
                                logger.info("Skip detachUser as platform has a connection erorr");
                                callback(null);
                                return;
                            }
                            session.platform.detachUser(session, function(err, res) {
                                if(err) {
                                    sessLogger.error("StartSession::endSessionLocked: failed to detach user from platform, err: " + err);
                                    addToErrorsPlatforms = res && res.addToErrorsPlatforms || false;
                                }
                                callback(null);
                            });
                        },
                        // remove nubo GL server
                        function(callback) {
                            if (!Common.isEnterpriseEdition() || !Common.glManagers || !session.params.nuboglManager) {
                                callback(null);
                                return;
                            }
                            Common.getEnterprise().nuboGL.stopGLServer(session.params.nuboglManager , session.params.platid,session.params.localid)
                                .then( () => {
                                    logger.info("Stopped GL Server");
                                    callback(null);
                                } ).catch(err => {
                                    logger.error("Error on stop GL Server",err);
                                    callback(null);
                                });
                        },
                        //remove user rules from iptables
                        function(callback) {
                            if (!Common.isMobile() || platform.params['connection_error']) {
                                callback(null);
                                return;
                            }
                            
                            Common.getMobile().firewall.removeRulesFromTable(session.params.localid, session.params.platid, function(err, tasks) {
                                if (err) {
                                    sessLogger.error("StartSession::endSessionLocked: failed to create iptables task to remove rules from platform, err: " + err);
                                    callback(null);
                                } else if (tasks) {
                                    platform.applyFirewall(tasks, function(err) {
                                        if (err) logger.error("applyFirewall failed with err: " + err);
                                        callback(null);
                                    });
                                } else {
                                    callback(null);
                                }
                            });
                        },
                        // delete platfrom reference
                        function(callback) {
                            session.deletePlatformReference(function(err) {
                                if (err) {
                                    sessLogger.error("StartSession::endSessionLocked: failed to delete session platform reference, err: " + err);
                                }
                                callback(null);
                            });
                        },
                        // decrese platform sessions
                        function(callback) {
                            platform.increaseReference(-1, callback);
                        },
                        //workaround for onlinestatus bug
                        function(callback) {
                            Common.db.Activation.update({
                                onlinestatus: 0
                            }, {
                                where: {
                                    activationkey: session.params.activation
                                }
                            }).then(function() {
                                callback(null);
                            }).catch(function(err) {
                                logger.error(`error while update onlinestatus: ${err}`);
                                console.error(err);
                                var msg = "error while update onlinestatus:: " + err;
                                callback(msg);
                                return;
                            });
                        },
                        function(callback) {
                            if (!Common.isMobile()) {
                                callback(null);
                                return;
                            }
                            Common.getMobile().mediaStream.removeUserStreams(session.params.sessid, function(err) {
                                callback(null);
                            });
                        },
                        //decrease gateway's session score
                        function(callback) {
                            if (!session.params.gatewayIndex) {
                                logger.info(`Session does not have gateway associated`);
                                callback(null);
                                return;
                            }
                            var lock = new Lock({
                                key: 'lock_gateway_' + session.params.gatewayIndex,
                                logger: logger,
                                numberOfRetries: 30,
                                waitInterval: 500,
                                lockTimeout: 1000 * 60 // 1 minute
                            });

                            lock.cs(function(callback) {
                                gatewayModule.updateGWSessionScore(session.params.gatewayIndex, -1, session.params.sessid, sessLogger, function(err) {
                                    if (err) {
                                        callback("failed decresing gateway reference");
                                        return;
                                    }
                                    callback(null);
                                });
                            }, callback);
                        },
                        // function(callback) {
                        //     if (Common.isEnterpriseEdition()) {
                        //         Common.getEnterprise().settings.postEndSessionProcedure(session,sessLogger,callback);
                        //     } else {
                        //         callback(null);
                        //     }
                        // }
                    ], function(err, results) {
                        callback(err);
                    });
                } else {
                    callback("no UNum");
                }
            }
        ], function(err, results) {
            // no matter if error happened remove session from db
            if (err) {
                sessLogger.error("endSessionLocked: " + err);
            }
            session.del(function(serr) {
                if (addToErrorsPlatforms) {
                    platform.addToErrorPlatforms(function(err) {
                        if (err) sessLogger.info("ERROR: Cannot move platform to platforms_errs, err: " + err);
                    },false,true);
                }
                if (serr) {
                    sessLogger.logTime("Error during remove session from redis, err: " + serr);
                    callback(serr);
                } else {
                    sessLogger.logTime("removed session from db.");
                    callback(err);
                }
            });
        });
    } else {
        if (platform) {
            /*platform.addToErrorPlatforms(function(err) {
             if (err) {
             logger.info("ERROR: Cannot move platform to platforms_errs, err: " + err);
             }
             });*/
        }
        logger.info("Session is not defined");
        callback("Session is not defined");
    }
}

var detachUserFromPlatform = function(session, callback) {
    if (Common.platformType === "kvm") {
        detachUserFromPlatformByManagement(session, callback);
    } else {
        session.platform.detachUser(session, callback);
    }
};

var detachUserFromPlatformByManagement = function(session, callback) {
    var UNum = session.params.localid;
    var sessLogger = session.logger;
    var platform = session.platform;
    async.series([
        // Logout. pm remove-user close all user's applications
        function(callback) {
            var cmd = 'pm remove-user ' + session.params.localid;
            //console.log("cmd: " + cmd);
            sessLogger.info(cmd);
            platform.exec(cmd, function(err, code, signal, sshout) {
                sessLogger.logTime("pm remove-user");
                callback(null); // Try to continue even if pm failed
            }); // platform.exec
        }, // function(callback)
        // force close all user's applications if it still exist
        function(callback) {
            var cmd = "kill `ps | grep ^u" + UNum + "_ | awk '{print $2}'`";
            sessLogger.info("cmd: " + cmd);
            platform.exec(cmd, function(err, code, signal, sshout) {
                if (err) {
                    var msg = "Error in adb shell: " + err;
                    callback(msg);
                    return;
                }
                sessLogger.logTime("kill all processes, " + sshout);
                callback(null);
            }); // platform.exec
        }, // function(callback)
        // unmount folders
        function(callback) {
            mount.fullUmount(session, null, function(err) {
                if (err) {
                    sessLogger.info("ERROR: cannot umount user's directories, err:" + err);
                    callback(err);
                } else {
                    callback(null);
                }
            });
        }, // function(callback)
        // rm files of logouted user (after umount of all user's data)
        function(callback) {
            var cmd = "rm -rf /data/system/users/" + UNum +
                " ; rm /data/system/users/" + UNum + ".xml" +
                " ; rm -rf /data/user/" + UNum +
                " ; rm -rf /data/media/" + UNum +
                " ; rm -rf /data/misc/keystore/user_" + UNum + "/*";
            sessLogger.info("cmd: " + cmd);
            platform.exec(cmd, function(err, code, signal, sshout) {
                if (err) {
                    var msg = "Error in adb shell: " + err;
                    callback(msg);
                    return;
                }
                sessLogger.logTime("rm folder");
                callback(null);
            }); // platform.exec
        }
    ], function(err) {
        callback(err);
    });
};


/*function syncFiles(session, syncStorage, callback) {
    var sessLogger = session.logger;
    if (!session) {
        callback(null);
        return;
    }

    async.series([
        //sync data folder
        function(callback) {
            if (session.nfs && (session.params.email !== "demo@nubosoftware.com")) {
                session.nfs.syncAll(User.getUserDeviceDataFolderObj(session.params.email, session.params.deviceid), function(err) {
                    callback(err);
                });
            } else {
                callback(null);
            }
        },
        //sync storage folder
        function(callback) {
            if (syncStorage && session.nfs && (session.params.email !== "demo@nubosoftware.com")) {
                session.nfs.syncAll(User.getUserStorageFolderObj(session.params.email), function(err) {
                    callback(err);
                });
            } else {
                callback(null);
            }
        }
    ], function(err, results) {
        if (err)
            sessLogger.error("syncFiles: Sync files failed");

        callback(err);
    });
}*/

function updateUserInDbOnLogout(session, callback) {
    async.waterfall([
        function(callback) {
            require('./userUtils.js').getUserDataSize(session.params.email, callback);
        },
        function(size, callback) {
            var delta = {
                storageLast: size
            };
            Common.db.User.update(
                delta, {
                    where: {
                        email: session.params.email
                    }
                }
            ).then(function() {
                callback(null);
            }).catch(function(err) {
                var msg = "Error while setUserDetails: " + err;
                session.logger.error("StartSession.js updateUserInDbOnLogout: ", msg);
                callback(msg);
                // return error
                return;
            });
        }
    ], function(err, results) {
        if (callback) callback(err);
    });
}

function endSession(sessionID, callback, closeSessionMsg) {
    var session = null;
    var platform = null;
    var nfs = null;
    var deviceid = null;
    var email = null;
    var sessid = null;
    var lastConnectedDevice = false;
    var realDeviceID;

    var sessLogger = new ThreadedLogger(Common.getLogger(__filename));
    var timeLog = sessLogger.timelogger;

    if (sessionID == null || sessionID.length < 1) {
        callback("Invalid session id");
        return;
    }


    async.series([
        // load session
        function(callback) {
            new Session(sessionID, function(err, obj) {
                if (err || !obj) {
                    var msg = "session does not exist. err:" + err;
                    callback(msg);
                    return;
                }
                //logger.info('Session found: '+JSON.stringify(obj,null,2));
                var tempSession = obj;
                deviceid = tempSession.params.deviceid;
                email = tempSession.params.email;
                sessid = tempSession.params.sessid;
                sessLogger.user(email);
                sessLogger.device(deviceid);
                sessLogger.info(`Closing session. user: ${email}, sessid: ${sessid}`,{ mtype:"important"});
                if (sessid != sessionID) {
                    var msg = "loaded invalid session id: " + sessid;
                    callback(msg);
                    return;
                }
                callback(null);
            });
        },
        function(callback) {

            var sessLock = new Lock({
                key: "lock_" + email + "_" + deviceid,
                logger: sessLogger,
                numberOfRetries: 1,
                waitInterval: 500,
                lockTimeout: 1000 * 60 * 30
            });

            sessLock.cs(
                function(callback) {
                    async.series([
                        // validate folders for user
                        /*function(callback) {
                            validateUserFolders(email, deviceid, function(err) {
                                if (err) {
                                    sessLogger.warn("endSession: error in pre validateUserFolders err: " + err);
                                }
                                callback(null);
                            });
                        },*/
                        // re-load session after lock has been created
                        function(callback) {
                            new Session(sessionID, function(err, obj) {
                                if (err || !obj) {
                                    var msg = "session does not exist. err: " + err;
                                    callback(msg);
                                    return;
                                }
                                session = obj;
                                session.logger = sessLogger;
                                callback(null);
                            });
                        },
                        // remove audio configuration
                        function(callback) {
                            if (Common.isMobile()) {
                                Common.getMobile().audioStreamManager.closeAudioSession(session).then(() => {
                                    logger.info("Audio removed sucessfully!");
                                    callback();
                                }).catch(function (err) {
                                    logger.error("Error in Audio:\n", err);
                                    callback();
                                });
                            } else {
                                callback(null);
                            }
                        },
                        function(callback) {
                            nfsModule({
                                    UserName: session.params.email,
                                    logger: sessLogger,
                                },
                                function(err, nfsobj) {
                                    if (err) {
                                        callback("cannot create nfs obect err: " + err);
                                        return;
                                    }

                                    nfs = nfsobj;
                                    session.nfs = nfsobj;
                                    callback(null);
                                }
                            );
                        },
                        // load platform
                        function(callback) {
                            new Platform(session.params.platid, null, function(err, obj) {
                                if (err || !obj) {
                                    var msg = "endSession: platform does not exist. err:" + err;
                                    callback(msg);
                                    return;
                                }
                                platform = obj;
                                session.setPlatform(platform);

                                callback(null);
                            });
                        },
                        //get real device ID (to support when withService set)
                        function(callback) {
                            Common.redisClient.hget("login_" + session.params.loginToken, "deviceID", function(err, replay) {
                                if (err) {
                                    callback(err);
                                    return;
                                }

                                realDeviceID = replay;
                                callback(null);
                            });
                        },
                        // remove login token from redis
                        function(callback) {
                            Common.redisClient.del('login_' + session.params.loginToken, function(err) {
                                callback(err);
                            });
                        },
                        function(callback) {
                            sessLogger.logTime("Closing session on platform");
                            var platLock = new Lock({
                                key: "lock_platform_" + platform.params.platid,
                                logger: sessLogger,
                                numOfRetries: 60, // wait for 30 seconds max
                                waitInterval: 500,
                                lockTimeout: 1000 * 60 * 10 // 10 minutes max lock
                            });

                            platLock.cs(
                                function(callback) {
                                    endSessionLocked(session, platform, function(err) {
                                        if (err) {
                                            sessLogger.error("error in endSessionLocked err: " + err);
                                            callback(null);
                                            return;
                                        }
                                        callback(null);
                                    });
                                }, callback);
                        },
                        // remove platform/gateway assosiation to user device
                        function(callback) {
                            User.updateUserConnectedDevice(email, realDeviceID, null, null, sessLogger, function(err) {
                                if (err) {
                                    callback("failed removing platform/gateway assosiation of user device")
                                    return;
                                }
                                callback(null);
                            });
                        },
                        // delete all platform notification from physical device
                        function(callback) {
                            require("./platformUserNotification.js").removeAllSessionNotifications(session,closeSessionMsg,sessLogger,callback);

                        },
                        // remove data center details in case it is last connected device
                        function(callback) {
                            if (!Common.dcName || !Common.dcURL) {
                                callback(null);
                                return;
                            }
                            User.getUserConnectedDevices(email, sessLogger, function(err, devices) {
                                if (err) {
                                    callback("failed getting all online devices");
                                    return;
                                }

                                // if this is the last device connected
                                if (devices.length == 0) {
                                    lastConnectedDevice = true;
                                }

                                callback(null);
                            });
                        },
                        // sync user data
                        function(callback) {
                            if (session.params.tempUserDataFlag != "1") {
                                callback(null);
                            } else {
                                require('./userUtils.js').deleteUserFolders(session.params.email, session.nfs, function(err) {
                                    callback(null);
                                });
                            }
                        },
                        function(callback) {
                            if (!Common.dcName || !Common.dcURL) {
                                callback(null);
                                return;
                            }

                            if (!lastConnectedDevice) {
                                callback(null);
                                return;
                            }

                            User.updateUserDataCenter(email, null, null, sessLogger, function(err) {
                                if (err) {
                                    callback("failed removeing user logged in data center");
                                    return;
                                }
                                callback(null);
                            });
                        }
                    ], callback); //async.series
                },
                callback
            ); // sessLock.cs
        },
        /*function(callback) {
            if (session.params.tempUserDataFlag != "1") {
                validateUserFolders(email, deviceid, deviceType, function(err) {
                    if (err) {
                        sessLogger.warn("endSession: error in post validateUserFolders err: " + err);
                    }
                    callback(null);
                });
            } else {
                callback(null);
            }
        },*/
        function(callback) {
            Common.redisClient.publish("platformChannel", "refresh");
            updateUserInDbOnLogout(session);
            callback(null);
        }
    ], function(err) {
        if (err) {
            var errMsg = "endSession: " + err;
            sessLogger.error(errMsg,{ mtype:"important"});
        } else {
            sessLogger.logTime("Session closed");
            sessLogger.info(`Session closed`,{ mtype:"important"});
        }

        if (session != null) {
            if (Common.isEnterpriseEdition()) {
                var appid = session.params.deviceid + "_" + session.params.activation;
                Common.getEnterprise().audit(appid,'End Session',null,{
                    email: session.params.email
                },{
                    dcName: Common.dcName,
                    session: session.params,
                    log: Common.specialBuffers[sessLogger.logid]
                });
            }            

            if (errMsg) {
                var subj = (Common.dcName != "" ? Common.dcName + " - " : "") + "Session deleted unsuccessfully";
                var text = 'Session delete error: ' + errMsg + '\nSession details: ' + JSON.stringify(session.params, null, 2);
                sendEmailToAdmin(subj, text, function(err) {
                    Common.specialBuffers[sessLogger.logid] = null;
                });
            } else {
                Common.specialBuffers[sessLogger.logid] = null;
            }
        } else {
            Common.specialBuffers[sessLogger.logid] = null;
        }

        callback(errMsg);
    });
}

function validateUserFolders(email, deviceID, deviceType, keys, callback) {
    if (typeof(keys) === 'function') {
        callback = keys;
        keys = undefined;
    }
    var userUtils = require('./userUtils.js');
    userUtils.validateUserFolders(email, deviceID, deviceType, keys, callback);
}

function validateUserFoldersExist(session, keys, time, hrTime, callback) {
    var login = session.login;
    //logger.info("validateUserFoldersExist. login: "+JSON.stringify(login,null,2));
    var email = login.getEmail();
    var deviceID = login.getDeviceID();
    var deviceType = login.loginParams.deviceType;
    var demo = login.loginParams.demoActivation && login.loginParams.demoActivation != "false";
    var tempUserDataFlag = (login.loginParams.tempUserDataFlag == "1");
    if (tempUserDataFlag) {
        session.params.tempUserDataFlag = login.loginParams.tempUserDataFlag;
    }
    if (login.loginParams.hideNuboAppPackageName && login.loginParams.hideNuboAppPackageName != "") {
        session.params.hideNuboAppPackageName = login.loginParams.hideNuboAppPackageName;
    }
    var key = demo ? null : keys
    if (demo || tempUserDataFlag) {
        require('./userUtils.js').createUserFolders(email, deviceID, deviceType, true, time, hrTime,
            function(err) {
                validateUserFolders(email, deviceID, deviceType, key, callback);
            }, demo, tempUserDataFlag, session.params.sessTrack, session.params.hideNuboAppPackageName
        );
    } else {
        validateUserFolders(email, deviceID, deviceType, key, function(err) {
            if (err || demo) {
                require('./userUtils.js').createUserFolders(email, deviceID, deviceType, true, time, hrTime,
                    function(err) {
                        validateUserFolders(email, deviceID, deviceType, key, callback);
                    }, demo
                );
            } else
                callback(null);
        });
    }

}

var attachUser = function(session, timeZone, callback) {
    if (Common.platformType === "kvm") {
        attachUserByManagement(session, timeZone, callback);
    } else {
        session.platform.attachUser(session, timeZone, callback);
    }
};

var attachUserByManagement = function(session, timeZone, callback) {
    var login = session.login;
    var email = login.getEmail;
    var deviceID = login.loginParams.deviceID;
    var platform = session.platform;
    var addToErrorsPlatforms = false;
    var pmUserCreated = false;
    var platformErrorFlag = false;
    var logger = session.logger;
    var timeLog = logger.timelogger;
    var localid = 0;

    /*
     * create android user, chech his number, empty directories
     * Arguments:
     *  callback(err, localid)
     *  err - error message, if exist
     *  localid - number of created user
     */
    function createUserAndroid(callback) {
        var localid;
        async.series([
            // create user
            function(callback) {
                var cmd = 'pm create-user ' + email + deviceID;
                //console.log("cmd: "+cmd);
                platform.exec(cmd, function(err, code, signal, sshout) {
                    if (err) {
                        addToErrorsPlatforms = true;
                        var msg = "Error in adb shell: " + err;
                        platformErrorFlag = true;
                        callback(msg);
                        return;
                    }
                    var re = new RegExp('Success: created user id ([0-9]+)');
                    var m = re.exec(sshout);
                    if (m) {
                        localid = m[1];
                        session.params.localid = localid;
                        pmUserCreated = true;
                        timeLog.logTime("pm create-user");
                        callback(null);
                    } else {
                        addToErrorsPlatforms = true;
                        callback("Error with PM - cannot get localid");
                    }
                }); // ssh.exec
            }, //function(callback)
            // Remove directory that was created by Android for new user and mount our directory instead
            function(callback) {
                var cmd = 'rm -rf /data/user/' + localid +
                    ' ; sync' + ' ; mkdir /data/user/' + localid +
                    ' ; mkdir /data/system/users/' + localid +
                    ' ; sync' + ' ; chown system:system /data/user/';
                //console.log("cmd: "+cmd);
                platform.exec(cmd, function(err, code, signal, sshout) {
                    if (err) {
                        var msg = "Error in adb shell: " + err;
                        callback(msg);
                        return;
                    }
                    timeLog.logTime("rm, mkdir etc..");
                    callback(null);
                }); // ssh.exec
            }, //function(callback)
        ], function(err) {
            if (err) {
                logger.error("Error: cannot initializate android user err:" + err);
            }

            callback(err, localid);
        });
    }

    var refreshPackages = function(session, callback) {
        var localid = session.params.localid;
        var platform = session.platform;
        var deviceType = session.login.loginParams.deviceType;
        var cmd = 'pm refresh ' + localid;
        if (deviceType === 'Web') {
            cmd = cmd + "; pm disable --user " + localid + " com.android.browser";
        }
        session.logger.info('cmd: ' + cmd);
        platform.exec(cmd, function(err, code, signal, sshout) {
            callback(err);
        }); // ssh.exec
    };

    /**
     * Run am create-user on the platform
     */
    var amCreateUser = function(platform, session, callback) {
        var cmd = 'am create-user ' + localid;
        platform.exec(cmd, function(err, code, signal, sshout) {
            if (err) {
                var msg = "Error in adb shell: " + err;
                platformErrorFlag = true;
                callback(msg);
                return;
            }
            callback(null);
        });
        // ssh.exec
    };

    /**
     * Delete previous users certificates from platform
     */
    function deleteUserCerts(platform, callback) {
        var cmd = 'rm /data/misc/keystore/user_' + localid + '/*';
        logger.info(' Deleting using cmd=' + cmd);
        platform.exec(cmd, function(err, code, signal, sshout) {
            if (err) {
                var msg = "Error in adb shell: " + err;
                platformErrorFlag = true;
                callback(msg);
                return;
            }
            callback(null);
        });
        // ssh.exec
    }

    /*
     * Start code
     */
    async.series([
        // create user
        function(callback) {
            createUserAndroid(function(err, res) {
                if (!err) localid = res;
                callback(err);
            });
        },
        function(callback) {
            deleteUserCerts(platform, function(err) {
                timeLog.logTime("deleteUserCerts");
                callback(err);
            });
        },
        // mount all nfs folders
        function(callback) {
            mount.fullMount(session, null, function(err) {
                if (err) session.logger.error("Cannot mount user's directories");
                timeLog.logTime("fullMount");
                callback(err);
            });
        },
        function(callback) {
            refreshPackages(session, function(err) {
                timeLog.logTime("refreshPackages");
                callback(err);
            });
        },
        function(callback) {
            setPerUserEnvironments(session, login, timeZone, callback);
        },
        function(callback) {
            amCreateUser(platform, session, function(err) {
                timeLog.logTime("amCreateUser");
                callback(err);
            });
        },
    ], function(err1) {
        if (err1) {
            var flags = {
                addToErrorsPlatforms: addToErrorsPlatforms,
                platformErrorFlag: platformErrorFlag
            };
            if (pmUserCreated) {
                endSessionLocked(session, platform, function(err2) {
                    if (err2) logger.error("Error happened while handling error, err: " + err2);
                    callback(err1, flags);
                });
            } else {
                callback(err1, flags);
            }
        } else {
            callback(null, localid);
        }
    });
};



function startOrJoinSession(startSessionParams, login, retryCnt, dedicatedPlatID, timeZone, sessLogger, callback) {

    var UserName = login.getUserName();
    var email = login.getEmail();
    var deviceID = login.getDeviceID();
    var domain = login.getMainDomain();
    var timeLog = sessLogger.timelogger;
    var oldSession = false;
    var clientIP = startSessionParams.clientIP;

    var userDeviceLock = new Lock({
        key: 'lock_' + email + '_' + deviceID,
        logger: sessLogger,
        numOfRetries: 200,
        waitInterval: 500,
        lockTimeout: 1000 * 60 * 5 // 5 minutes
    });

    var geoipInfo = null;

    var session = null;
    // Need to create a timestamp
    var time = new Date().getTime();
    var hrTime = process.hrtime()[1];

    userDeviceLock.cs(
        function(callback) {
            buildUserSession(login, dedicatedPlatID, timeZone, time, hrTime, sessLogger, startSessionParams.deviceParams, callback);
        },
        function(err, session, isOldSession) {
            if (err) {
                sessLogger.error("startOrJoinSession: couldn\'t create user session");
                callback(err);
            } else {
                //success
                oldSession = isOldSession;
                postStartSessionProcedure(session, time, hrTime, sessLogger);
                callback(null, session);
            }

            if (!oldSession) {
                report(session, err, login, oldSession, sessLogger, clientIP, function() {});
                // deliver pending messages
                if (!err) {
                    setTimeout( () => {
                        require('./SmsNotification.js').deliverPendingMessagesToSession(session);
                    },3000);
                }


            } else {
                sessLogger.info("startOrJoinSession: join running session: " + session.params.sessid);
                Common.specialBuffers[sessLogger.logid] = null;
            }
        });
}

function cleanUserSessionBuild(buildStatus, email, deviceID, session, callback) {
    var logger = session.logger;

    async.series([
        function(callback) {
            if (buildStatus.userConnectedDeviceUpdated)
                User.updateUserConnectedDevice(email, deviceID, null, null, logger, function(err) {
                    if (err)
                        logger.error("cleanUserSessionBuild: failed deleteing platform and gw of user");
                    callback(null);
                });
            else
                callback(null);
        },
        function(callback) {
            if (buildStatus.userDataCenterUpdated)
                User.getUserConnectedDevices(email, logger, function(err, userDevices) {
                    if (err) {
                        logger.error("cleanUserSessionBuild: failed getting user devices");
                        callback(null);
                        return;
                    }

                    //empty list - only one device tried to connect
                    if (userDevices.length == 0) {
                        User.updateUserConnectedDevice(email, deviceID, null, null, logger, function(err) {
                            if (err) {
                                logger.error("cleanUserSessionBuild: failed deleteing user data center");
                            }
                            callback(null);
                        });
                    } else
                        callback(null);
                });
            else
                callback(null);
        },
        function(callback) {
            if (buildStatus.sessionPlatformReferenceIncresed)
                session.deletePlatformReference(function(err) {
                    if (err)
                        logger.error("cleanUserSessionBuild: failed deleteing session platform reference");
                    callback(null);
                });
            else
                callback(null);
        },
        function(callback) {
            if (buildStatus.platformReferenceIncresed)
                session.platform.increaseReference(-1, function(err) {
                    if (err)
                        logger.error("cleanUserSessionBuild: failed decresing platform reference");
                    callback(null);
                });
            else
                callback(null);
        },
        function(callback) {
            if (buildStatus.userAttached)
                session.platform.detachUser(session, function(err) {
                    if (err) {
                        logger.error("cleanUserSessionBuild: failed detaching user from platform");
                        buildStatus.addToErrorsPlatforms = true;
                    }
                    callback(null);
                });
            else
                callback(null);
        },
        function(callback) {
            if (buildStatus.gatewayReferenceIncresed)
                gatewayModule.updateGWSessionScore(session.params.gatewayIndex, -1, session.params.sessid, logger, function(err) {
                    if (err)
                        logger.error("cleanUserSessionBuild: failed decresing gateway reference");
                    callback(null);
                });
            else
                callback(null);
        },
        function(callback) {
            if (buildStatus.gatewayLock)
                buildStatus.gatewayLock.release(function(err) {
                    if (err)
                        logger.error("cleanUserSessionBuild: failed releasing gateway lock");
                    callback(null);
                });
            else
                callback(null);
        },
        function(callback) {
            if (buildStatus.addToErrorsPlatforms)
                session.platform.addToErrorPlatforms(function(err) {
                    if (err)
                        logger.error("cleanUserSessionBuild: failed adding platform " + session.params.platid + " to platform error list");
                    callback(null);
                },false,true);
            else
                callback(null);
        },
        function(callback) {
            if (buildStatus.platformLock)
                buildStatus.platformLock.release(function(err) {
                    if (err)
                        logger.error("cleanUserSessionBuild: failed releasing lock");
                    callback(null);
                });
            else
                callback(null);
        },
        // delete session
        function(callback) {
            session.del(function(err) {
                if (err)
                    logger.error("cleanUserSessionBuild: failed deleting session");
                callback(null);
            });
        }
    ], function(err) {
        callback(null);
        return;
    });
}

function buildUserSession(login, dedicatedPlatID, timeZone, time, hrTime, logger, deviceParams, callback) {

    var buildStatus = {
        platformReferenceIncresed: false,
        platformLock: null,
        addToErrorsPlatforms: false,
        userAttached: false,
        sessionPlatformReferenceIncresed: false,
        gatewayReferenceIncresed: false,
        userDataCenterUpdated: false,
        userConnectedDeviceUpdated: false,
        revivePlatform: false,
        gatewayLock: null
    };

    var keys = null;
    var email = login.getEmail();
    var deviceID = login.getDeviceID();
    var deviceType = login.loginParams.deviceType;
    var desktopDevice = false;
    if (deviceType == "Desktop") {
        desktopDevice = true;
    }

    sessionModule.getSessionOfUserDevice(email, deviceID, function(err, sessobj) {
        if (err) {
            callback(err);
            return;
        }

        if (sessobj == null) {

                var session;
                var dedicatedplatform;

                async.series([
                        // check if another sesion of the same use not exists
                    function(callback) {
                        if (!Common.limitOneSessionPerUser) {
                            callback(null);
                            return;
                        }
                        sessionModule.getSessionsOfUser(email,(sessions) => {
                            if (!sessions || sessions.length == 0) {
                                logger.info(`No active sessions found for user ${email}`);
                                callback(null);
                            } else {
                                let msg = `Found active session for user ${email}. deviceid: ${sessions[0].params.deviceid}`;
                                logger.info(msg);
                                let resObj = {
                                    startSessionStatus : -9,
                                    startSessionMessage :  msg
                                };
                                callback(resObj);
                            }
                        });
                    },
                    // create session object
                    function(callback) {
                        logger.info("Creating session object...");
                        new Session(null, {
                            UserName: login.getUserName()
                        }, function(err, obj) {
                            if (err) {
                                callback("error creating session");
                                return;
                            }
                            session = obj;
                            session.logger = logger;
                            session.login = login;
                            session.params.email = email;
                            session.params.deviceid = deviceID;
                            session.params.docker_image = login.loginParams.docker_image;
                            session.params.deviceType = deviceType;
                            if (deviceParams && deviceParams.appName) {
                                session.params.appName = deviceParams.appName;
                            } else {
                                session.params.appName = Common.defaultAppName;
                            }

                            callback();
                        });
                    },
                    //check if user need dedicated platform and if he allowed to connect
                    function(callback) {
                        Common.db.Orgs.findAll({
                            attributes: ['dedicatedplatform', 'allowconnect'],
                            where: {
                                maindomain: login.loginParams.mainDomain
                            }
                        }).then(function(results) {


                            if (!results || results == "") {
                                var msg = 'cannot find domain';
                                logger.error('buildUserSession: ' + msg);
                                callback(msg);
                                return;
                            }

                            if (results[0].allowconnect === 0) {
                                logger.warn('buildUserSession: user\'s domain isn\'t allowed to connect');
                                callback('user\'s domain isn\'t allowed to connect');
                                return;
                            }

                            dedicatedplatform = results[0].dedicatedplatform ? true : false;
                            callback(null);
                        }).catch(err => {
                            var msg = 'buildUserSession: orgs: ' + err;
                            logger.error(msg);
                            callback(err);
                        });
                    },
                    function (callback) {
                        if (desktopDevice && !session.params.docker_image) {
                            // reading docker_image from database
                            Common.db.User.findOne({
                                attributes: ['docker_image'],
                                where: {
                                    email: email                                   
                                },
                            }).then(data => {
                                logger.info(`Reading docker_image from database: ${data.docker_image}`);
                                if (data.docker_image) {
                                    session.params.docker_image = data.docker_image;      
                                    callback(null);
                                } else {
                                    Common.getDesktop().debs.createImageForUser(email,login.loginParams.mainDomain).then((imageName) => {
                                        session.params.docker_image = imageName;
                                        logger.info(`Using created image: ${imageName}`);
                                        callback(null);
                                    }).catch (err => {
                                        logger.info(`Error in createImageForUser: ${err}`);
                                        callback(err);
                                    });
                                }
                            }).catch (err => {
                                logger.error("Error reading docker_image",err);
                                callback(err);
                            });
                        } else if (!desktopDevice && Common.platformType == "docker") {
                            session.params.docker_image = "nubo-android-10";
                            callback(null);
                        } else {
                            callback(null);
                        }
                    },
                    //validate user folders
                    function(callback) {
                        validateUserFoldersExist(session, keys, time, hrTime, callback);
                    },
                    // nfs
                    function(callback) {
                        nfsModule({
                                UserName: email,
                                logger: logger,
                                nfs_idx: Common.nfsId
                            },
                            function(err, nfs) {
                                if (err) {
                                    logger.warn("buildUserSession: cannot create nfs obect err: " + err);
                                    callback(null); // TODO: return err
                                } else {
                                    session.params.nfs_ip = nfs.nfs_ip;
                                    session.params.nfs_idx = nfs.nfs_idx;
                                    session.nfs = nfs;
                                    callback(null);
                                }
                            }
                        );
                    },
                    //get platform
                    function(callback) {
                        if (dedicatedplatform) {
                            session.params.platDomain = login.loginParams.mainDomain;
                        } else {
                            session.params.platDomain = 'common';
                        }

                        platformModule.getAvailablePlatform(null, dedicatedPlatID, session.params.platDomain, logger, function(err, obj, lock) {
                            if (err) {
                                let resObj = {
                                    startSessionStatus : 0,
                                    startSessionMessage :  "Not found available platform",
                                    startSessionErrorCode: -8
                                };
                                callback(resObj);
                                //callback("couldn't get platform");
                                return;
                            }

                            buildStatus.platformLock = lock;
                            buildStatus.platformReferenceIncresed = true;

                            session.platform = obj;
                            session.params.platid = obj.params.platid;
                            session.params.platform_ip = obj.params.platform_ip;

                            //logger.info(`getAvailablePlatform. obj.params: ${JSON.stringify(obj.params,null,2)}`);

                            /* undedined paramters - causing redis warning messages
                            session.params.hostline = obj.params.hostline;
                            session.params.platformline = obj.params.platformline;
                            */

                            callback(null);
                        });
                    },
                    //attach gateway to session
                    function(callback) {                        
                        //create dummy gateway obj
                        var gwObj = {
                            index: -1
                        };
                        new gatewayModule.Gateway(gwObj, {
                            logger: logger
                        }, function(err, gateway) {
                            if (err || !gateway) {
                                callback("failed to associate gateway to session");
                            } else {
                                session.params.gatewayIndex = gateway.params.index;
                                session.params.gatewayInternal = gateway.params.internal_ip;
                                session.params.gatewayExternal = gateway.params.external_ip;
                                session.params.isSSL = gateway.params.ssl;
                                session.params.gatewayPlayerPort = gateway.params.player_port;
                                session.params.gatewayAppsPort = gateway.params.apps_port;
                                session.params.gatewayControllerPort = gateway.params.controller_port;

                                buildStatus.gatewayLock = gateway.lock;
                                callback(null);
                            }
                        });
                    },
                    // create session files
                    function(callback) {
                        if (desktopDevice || !Common.isMobile()) {
                            callback(null);
                            return;
                        }

                        Common.getMobile().mobileUserUtils.createSessionFiles(session, deviceParams, function(err) {
                            callback(err);
                        });
                    },
                    //attach user to platform
                    function(callback) {
                        session.platform.attachUser(session, timeZone, function(err, res) {
                            if (err) {
                                buildStatus.addToErrorsPlatforms = true;
                                callback("attach user to platform failed");
                                return;
                            }

                            //logger.info("attachUser. res: "+res);
                            session.params.localid = res.localid;
                            if (Common.platformType == "docker") {
                                session.params.containerIpAddress = res.params.ipAddress;
                                session.params.containerUserName = res.params.linuxUserName;
                                session.params.containerUserPass = res.params.userPass;
                                if (session.params.gatewayInternal) {
                                    session.params.guacAddr = session.params.gatewayInternal;
                                } else {
                                    session.params.guacAddr = Common.guacAddr;
                                }
                            }
                            buildStatus.userAttached = true;
                            callback(null);
                        });
                    },
                     // start server side openGL
                     function(callback) {
                        if (Common.isEnterpriseEdition() && !desktopDevice) {
                            Common.getEnterprise().nuboGL.startNuboGL(session,function(err) {
                                callback();
                            });
                        } else {
                            callback(null);
                        }
                    },
                    // update gateway Reference
                    function(callback) {                       
                        gatewayModule.updateGWSessionScore(session.params.gatewayIndex, 1, session.params.sessid, session.logger, function(err) {
                            if (err) {
                                callback("failed increasing gateway reference");
                                return;
                            }
                            buildStatus.gatewayReferenceIncresed = true;
                            callback(null);
                        });
                    },
                    // unlock GW after session files created
                    function(callback) {                        
                        buildStatus.gatewayLock.release(function(err, replay) {
                            if (err) {
                                callback("cannot remove lock on platform");
                                return;
                            }

                            buildStatus.gatewayLock = null;
                            callback(null);
                        });
                    },
                    // update Platform Reference
                    function(callback) {
                        session.updatePlatformReference(function(err,cnt) {
                            if (err) {
                                logger.info(`updatePlatformReference error: ${err}`);
                                callback("failed updaing session\'s platform reference");
                                return;
                            } else {
                                if (Common.platformParams.restartPlatformSessionsThreshold > 0 && cnt>Common.platformParams.restartPlatformSessionsThreshold) {
                                    logger.info(`Platform exceeded the "Restat Platform Session Threshold": ${cnt}. Move platform to error for restart!`);
                                    //buildStatus.addToErrorsPlatforms = true;
                                    buildStatus.revivePlatform = true;
                                }
                            }
                            buildStatus.sessionPlatformReferenceIncresed = true;
                            callback(null);
                        });
                    },
                    // unlock platform after pm
                    function(callback) {
                        if (buildStatus.platformLock && buildStatus.platformLock.isAquired()) {
                            buildStatus.platformLock.release(function(err, replay) {
                                if (err) {
                                    callback("cannot remove lock on platform");
                                    return;
                                }

                                buildStatus.platformLock = null;
                                callback(null);
                            });
                        } else {
                            logger.info("Lock on platform not found");
                            buildStatus.platformLock = null;
                            callback(null);
                        }
                    },
                    // create session in redis
                    function(callback) {
                        session.params.activation = login.getActivationKey();
                        session.params.deleteFlag = 0;
                        session.params.loginToken = login.loginParams.loginToken;
                        var now = new Date();
                        session.params.startTime = now.toFormat("YYYY-MM-DD HH24:MI:SS");
                        session.params.startTS = now.getTime();
                        session.params.encrypted = login.loginParams.encrypted;
                        session.params.forceExit = 0;

                        session.setUserAndDevice(email, deviceID, function(err) {
                            if (err) {
                                callback("creating session failed");
                                return;
                            }
                            session.suspend(1, function(err) {
                                if (err) {
                                    callback("susspending session failed");
                                    return;
                                }
                                callback(null);
                            });
                        });
                    },
                    // update user DB with data center details
                    function(callback) {
                        if (!Common.dcName || !Common.dcURL) {
                            callback(null);
                            return;
                        }

                        var dcname = login.getDcname() != '' ? login.getDcname() : null;
                        var dcurl = login.getDcurl() != '' ? login.getDcurl() : null;

                        if (dcname && dcurl) {
                            buildStatus.userDataCenterUpdated = true;
                            User.updateUserDataCenter(email, dcname, dcurl, logger, callback);
                        } else {
                            callback(null);
                        }
                    },
                    //update user-device connected platform and gw
                    function(callback) {
                        //login.getDeviceID(): because withService changes the device ID we need the real device ID to set platform and GW on DB
                        User.updateUserConnectedDevice(email, login.getDeviceID(), session.params.platid, session.params.gatewayIndex, logger, function(err) {
                            if (err) {
                                callback("failed updating connected platform and gateway of the session")
                                return;
                            }

                            buildStatus.userConnectedDeviceUpdated = true;
                            callback(null);
                        });
                    },
                    // validate folders of the user
                    function(callback) {
                        validateUserFolders(email, deviceID, deviceType, function(err) {
                            if (err) {
                                callback("failed validating user folders " + err);
                                return;
                            }
                            callback(null);
                        });
                    },
                    //insert user rules into iptables
                    function(callback) {
                        if (!Common.isMobile() || session.platform.params['connection_error']) {
                            callback(null);
                            return;
                        }
                        const firewall = Common.getMobile().firewall;
                        firewall.generateUserRules(session.params.email, session.params.localid, session.params.platid, firewall.Firewall.add, function(err, tasks) {
                            if (err || !tasks || tasks.length == 0) {
                                callback(null);
                            } else {
                                session.platform.applyFirewall(tasks, function(err) {
                                    if (err) logger.error("applyFirewall failed with err: " + err);
                                    callback(null);
                                });
                            }
                        });
                    },
                    // Install/Uninstall new apps to user if needed
                    function(callback) {
                        // Install/Uninstall new apps to user if needed
                        // TODO: do this under lock only on 1st login
                        if (desktopDevice || !Common.isMobile()) {
                            callback(null);
                            return;
                        }
                        
                        Common.getMobile().appMgmt.startSessionInstallations(session, time, hrTime, uninstallFunc, function(err) {
                            callback(null);
                        });
                    }
                ], function(err) {
                    if (err) {
                        logger.error("buildUserSession: " + err);
                        if (session) {
                            logger.info("Running cleanUserSession...")
                            cleanUserSessionBuild(buildStatus, email, deviceID, session, function() {
                                callback(err);
                            });
                        } else {
                            logger.info("No session to clean...");
                            callback(err);
                        }
                    } else {
                        if (buildStatus.revivePlatform) {
                            // move to error for platform restart
                            session.platform.addToErrorPlatforms(function(err) {
                                if (err)
                                    logger.error("buildUserSession: failed adding platform " + session.params.platid + " to platform error list");
                            },false,false,true);
                        }
                        callback(null, session, false);
                    }
                });
        } else {
            if (sessobj.params.deleteFlag == 1 || sessobj.params.deleteError == 1) {
                callback("session in delete state");
                return;
            }

            if (sessobj.params.forceExit == 1) {
                callback("session forced to exit");
                return;
            }

            var session = sessobj;
            session.logger = logger;

            async.series([
                // withService only - check if same user connects with diffrent device
                function(callback) {
                    if (!Common.withService) {
                        return callback(null);
                    }

                    new Login(session.params.loginToken, function(err, sessionLogin) {
                        if (err) {
                            return callback(err);
                        }

                        if (!sessionLogin) {
                            return callback("missing login data. shouldn't get here!!!");
                        }

                        if (sessionLogin.getDeviceID() !== login.getDeviceID()) {
                            return callback("user allready connected with diffrent device");
                        }

                        return callback(null);
                    });
                },
                //get platform
                function(callback) {
                    platformModule.getAvailablePlatform(null, session.params.platid, null, logger, function(err, obj, lock) {
                        if (err) {
                            callback("couldn't get platform");
                            return;
                        }

                        session.platform = obj;
                        lock.release(function(err, replay) {
                            if (err) {
                                callback("cannot remove lock on platform");
                                return;
                            }


                            callback(null);
                        });
                    });
                },
                // validate folders of the user
                function(callback) {
                    validateUserFolders(email, deviceID, deviceType, function(err) {
                        if (err) {
                            callback("failed validating user folders, err: " + err);
                            return;
                        }
                        callback(null);
                    });
                },
                function(callback) {
                    if (session.params.loginToken != login.loginParams.loginToken) {
                        Common.redisClient.publish("loginTokenChanged", session.params.loginToken);
                        session.params.loginToken = login.loginParams.loginToken;
                        var loginTokenObj = { loginToken: login.loginParams.loginToken };
                        Common.redisClient.hmset('sess_' + session.params.sessid, loginTokenObj, function(err, obj) {
                            callback(null);
                        });
                    } else {
                        callback(null);
                    }
                }
            ], function(err) {
                if (err) {
                    logger.error("buildUserSession: " + err);
                    callback(err);
                    return;
                }

                callback(null, session, true);
            });
        }
    });
}




// send email, tracker
function report(session, createErr, login, oldSession, logger, clientIP, callback) {


    var email = login.getEmail();
    var deviceID = login.getDeviceID();
    var geoipInfo = null;

    async.series([
        function(callback) {
            if (Common.isEnterpriseEdition()) {
                var appid = deviceID + "_" + login.getActivationKey();
                Common.getEnterprise().audit(appid,'Start Session',clientIP,{
                    email: email
                },{
                    dcName: Common.dcName,
                    deviceType: login.loginParams.deviceType,
                    session: session ? session.params : "",
                    loginParams: login.loginParams,
                    log: Common.specialBuffers[logger.logid]
                });
            }
            
            var subj = (Common.dcName != "" ? Common.dcName + " - " : "") +
                (createErr == null ? "Session created successfully" : "Session create Error") +
                (geoipInfo ? ' [' + geoipInfo.countryCode + ']' : '');
            var text = (createErr ? 'Session create error: ' + createErr : '') +
                '\nDevice Type: ' + login.loginParams.deviceType +
                (geoipInfo ? '\nGeoIP Info: ' + JSON.stringify(geoipInfo, null, 2) : '') +
                '\nSession details: ' + (session ? JSON.stringify(session.params, null, 2) : "");
            sendEmailToAdmin(subj, text, function(err) {
                Common.specialBuffers[logger.logid] = null;
                callback(null);
            });
        }
    ], function(err) {
        callback(null);
    });
}


var dummyGW = {
        gateway: '1.1.1.1',
        port: "1111"
    }
    /*
     * Response to clent, close http request
     * Arguments:
     *  session - session object
     *  err - boolean, if error has been heppened
     */
function response2Client(session, errResObj, res, isLocalIP, logger, loginToken) {

    var resobj;

    if (errResObj) {        
        logger.error("response to client: " + JSON.stringify(errResObj, null, 2));
        res.send(errResObj);
        return;
    }

    new Login(loginToken, function(err, login) {
        if (err) {
            resobj = {
                status: 0,
                message: 'Internal error. Please contact administrator.'
            };

            if (Common.withService) {
                _.extend(resobj, dummyGW);
            }
            logger.error("response to client: " + JSON.stringify(resobj, null, 2));
            res.send(resobj);
            return;
        }

        if (!login || !login.isValidLogin()) {
            resobj = {
                status: 2,
                message: 'Internal error. Please contact administrator.',
                loginToken: 'notValid'
            };

            if (Common.withService) {
                _.extend(resobj, dummyGW);
            }

            logger.error("response to client: " + JSON.stringify(resobj, null, 2));
            res.send(resobj);
            return;
        }

        resobj = {
            status: 1,
            gateway: isLocalIP ? session.params.gatewayInternal : session.params.gatewayExternal,
            port: session.params.gatewayPlayerPort,
            isSSL: session.params.isSSL,
            sessionid: session.params.sessid,
            audioStreamPort: session.params.audioStreamPort
        };

        if (session.params.webRTCToken) {
            resobj.webRTCToken = session.params.webRTCToken;
            resobj.webRTCStreamID = session.params.webRTCStreamID;
            resobj.webRTCHost = session.params.webRTCHost;
        }
        if (session.params.audioToken) {
            resobj.audioToken = session.params.audioToken;
        }
        if (session.params.nuboglListenPort) {
            resobj.serverSideOpenGL = true;
        }

        //logger.info("response to client: " + JSON.stringify(resobj, null, 2));
        updateLastActivityInDB(login);
        res.send(resobj);
    });
}

function updateLastActivityInDB(login) {

    var date = new Date().toISOString();
    var email = login.loginParams.email;
    var domain = login.loginParams.mainDomain;

    Common.db.User.update({
        lastactivity: date
    }, {
        where: {
            email: email,
            orgdomain: domain
        }
    }).then(function() {
        //logger.info('updated last activity to user');
    }).catch(function(err) {
        logger.info(err);
        return;
    });
}

function postStartSessionProcedure(session, time, hrTime, logger) {

    if (Common.isEnterpriseEdition()) {
        Common.getEnterprise().settings.postStartSessionProcedure(session.params.email);
    }
    async.series([
        // Install/Uninstall new apps to user if needed
        function(callback) {
            // Install/Uninstall new apps to user if needed
            if (!Common.isMobile()) {
                callback(null);
                return;
            }
            Common.getMobile().appMgmt.startSessionInstallations(session, time, hrTime, uninstallFunc, function(err) {
                if (err) {
                    callback(err);
                    return;
                }

                callback(null);
            });
        },
    ], function(err, results) {
        if (err) {
            session.logger.error("postStartSessionProcedure: " + err);
        }
        Common.redisClient.publish("platformChannel", "refresh");
        return;
    });
}

function declineCall(req, res, next) {
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    res.contentType = 'json';
    var msg = "";
    var status = 100; //unknown

    //read and validate params
    var clientIP = req.headers["x-client-ip"];
    var isLocalIP = clientIP.indexOf(Common.internal_network) == 0 ? true : false;
    var loginToken = req.params.loginToken;
    var loginData;
    var session;
    var resObj;
    var platform;

    async.waterfall([
        function(callback) {
            new Login(loginToken, function(err, login) {
                if (err) {
                    logger.error("declineCall: " + err);
                    return callback(err);
                }

                if (!login ) {
                    var msg = "login isn\'t valid for user " + (login ? login.getUserName() : "");
                    resObj = {
                        status: Common.STATUS_EXPIRED_LOGIN_TOKEN,
                        message: msg,
                        loginToken: 'notValid'
                    };
                    logger.error("logoutUser: " + msg);
                    callback(msg);
                    return;
                }
                logger.user(login.getEmail());
                logger.info("declineCall", {
                    mtype: "important"
                });
                loginData = login;
                callback(null);
            });
        },
        function(callback) {
            var email = loginData.getEmail();
            var deviceID = loginData.getDeviceID();

            sessionModule.getSessionOfUserDevice(email, deviceID, function (err, sessobj) {
                if (err) {
                    callback(err);
                    return;
                }

                if (sessobj == null) {
                    var msg = "Session not found";
                    resObj = {
                        status: Common.STATUS_OK,
                        message: msg
                    };
                    logger.error("declineCall: " + msg);
                    callback(msg);
                    return;
                } else {
                    session = sessobj;
                    callback(null);
                }
            });
        },
        function (callback) {
            // load platform
            new Platform(session.params.platid, null, function (err, obj) {
                if (err || !obj) {
                    var msg = "declineCall: platform does not exist. err:" + err;
                    callback(msg);
                    return;
                }
                platform = obj;
                session.setPlatform(platform);
                callback(null);
            });
        },
        function (callback) {
            // send declineCall request to platform
            platform.declineCall(session.params.localid,callback);
        }
    ], function(err) {
        if (err) {
            logger.info("Error in declineCall",err);
            if (!resObj) {
                resObj = {
                    status: Common.STATUS_OK,
                    message: new String(err)
                };
            }
        } else {
            resObj = {
                status: Common.STATUS_OK,
                message: "Call declined"
            };
        }
        //logger.info("declineCall: ", JSON.stringify(resObj,null,2));
        res.send(resObj);
    });
}

function logoutUser(req, res, next) {
    // https://login.nubosoftware.com/logoutUser?loginToken=[loginToken]
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    res.contentType = 'json';
    var msg = "";
    var status = 100; //unknown

    //read and validate params
    var clientIP = req.headers["x-client-ip"];
    var isLocalIP = clientIP.indexOf(Common.internal_network) == 0 ? true : false;
    var loginToken = req.params.loginToken;
    var loginData;
    var session;
    var resObj;

    async.waterfall([
        function(callback) {
            new Login(loginToken, function(err, login) {
                if (err) {
                    logger.error("logoutUser: " + err);
                    return callback(err);
                }

                if (!login ) {
                    var msg = "login isn\'t valid for user " + (login ? login.getUserName() : "");
                    resObj = {
                        status: Common.STATUS_EXPIRED_LOGIN_TOKEN,
                        message: msg,
                        loginToken: 'notValid'
                    };
                    logger.error("logoutUser: " + msg);
                    callback(msg);
                    return;
                }
                logger.user(login.getEmail());
                logger.info("Logout User", {
                    mtype: "important"
                });
                loginData = login;
                callback(null);
            });
        },
        function(callback) {
            var email = loginData.getEmail();
            var deviceID = loginData.getDeviceID();

            sessionModule.getSessionOfUserDevice(email, deviceID, function (err, sessobj) {
                if (err) {
                    callback(err);
                    return;
                }

                if (sessobj == null) {
                    var msg = "Session not found";
                    resObj = {
                        status: Common.STATUS_OK,
                        message: msg
                    };
                    logger.error("logoutUser: " + msg);
                    callback(msg);
                    return;
                } else {
                    session = sessobj;
                    callback(null);
                }
            });
        },
        function (callback ) {
            // delete session_cache_params, so session will not start without user re-configure itself
            Common.db.UserDevices.update({
                session_cache_params: null
            }, {
                where: {
                    email: loginData.getEmail(),
                    imei: loginData.getDeviceID()
                }
            }).then(function() {
                logger.info("logoutUser. deleted session_cache_params..");
                callback();
            }).catch(function(err) {
                var errMsg = 'logoutUser. Update session_cache_params: ' + err;
                logger.error(errMsg);
                callback();
            });
        },
        function (callback) {
            endSession(session.params.sessid,callback);
        }
    ], function(err) {
        if (err) {
            logger.info("Error in logoutUser",err);
            if (!resObj) {
                resObj = {
                    status: Common.STATUS_OK,
                    message: new String(err)
                };
            }
        } else {
            resObj = {
                status: Common.STATUS_OK,
                message: "Session killed"
            };
        }
        //logger.info("logoutUser: ", JSON.stringify(resObj,null,2));
        res.send(resObj);
    });
}


function closeSessionOfUserDevice(email, deviceID,cb) {
    var logger = Common.getLogger(__filename);
    var session;
    async.series([
        function(callback) {
            sessionModule.getSessionOfUserDevice(email, deviceID, function (err, sessobj) {
                if (err) {
                    callback(err);
                    return;
                }

                if (sessobj == null) {
                    callback("session not found");
                    return;
                } else {
                    session = sessobj;
                    callback(null);
                }
            });
        }, function(callback) {
            logger.info(`Closing session. email: ${email}, deviceID: ${deviceID}, sessid: ${session.params.sessid}`)
            endSession(session.params.sessid,function(err) {
                if (err) {
                    logger.info(`Close session error: ${err}`);
                    callback(err);
                } else {
                    callback(null);
                }
            });
        }
    ], function(err, results) {
        if (err) {
            cb(err,false);
        } else {
            cb(null,true);
        }

    });
}

function closeOtherSessions(req, res, next) {
    // https://login.nubosoftware.com/logoutUser?loginToken=[loginToken]
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    res.contentType = 'json';
    var msg = "";
    var status = 100; //unknown

    //read and validate params
    var clientIP = req.headers["x-client-ip"];
    var isLocalIP = clientIP.indexOf(Common.internal_network) == 0 ? true : false;
    var loginToken = req.params.loginToken;
    var loginData;
    var sessionArr = [];
    var resObj;

    async.waterfall([
        function(callback) {
            new Login(loginToken, function(err, login) {
                if (err) {
                    logger.error("logoutUser: " + err);
                    return callback(err);
                }

                if (!login ) {
                    var msg = "login isn\'t valid for user " + (login ? login.getUserName() : "");
                    resObj = {
                        status: Common.STATUS_EXPIRED_LOGIN_TOKEN,
                        message: msg,
                        loginToken: 'notValid'
                    };
                    logger.error("logoutUser: " + msg);
                    callback(msg);
                    return;
                }
                logger.user(login.getEmail());
                logger.info("Logout User", {
                    mtype: "important"
                });
                loginData = login;
                callback(null);
            });
        },
        function(callback) {
            var email = loginData.getEmail();
            var deviceID = loginData.getDeviceID();

            sessionModule.getSessionsOfUser(email,(sessions) => {
                if (!sessions || sessions.length == 0) {
                    logger.info(`No active sessions found for user ${email}`);
                } else {
                    sessionArr = sessions;
                }
                callback(null);
            });
        },
        function (callback) {
            async.eachSeries(sessionArr, function(session, callback) {
                endSession(session.params.sessid,callback,"sessionClosedByUser");
            }, function(err) {
                if (err) {
                    logger.info("Error in endSession:"+err);
                }
                callback(err);
            });

        }
    ], function(err) {
        if (err) {
            logger.info("Error in closeOtherSessions",err);
            if (!resObj) {
                resObj = {
                    status: Common.STATUS_ERROR,
                    message: new String(err)
                };
            }
        } else {
            resObj = {
                status: Common.STATUS_OK,
                message: "Session killed"
            };
        }
        logger.info("closeOtherSessions: ", JSON.stringify(resObj,null,2));
        res.send(resObj);
    });
}
