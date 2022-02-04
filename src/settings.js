"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var Login = require('./login.js');
var sessionModule = require('./session.js');
var Session = sessionModule.Session;
var setPasscode = require('./setPasscode.js');
var async = require('async');
var userModule = require('./user.js');
var userUtils = require('./userUtils.js');
var getSecurityPasscode = require('./ControlPanel/getSecurityPasscode.js');

var isDebug = getDebugMode();
var isHttpGet = isHttpGetDebug();

var Settings = {
    'changePasscode' : changePasscode,
    'checkPasscode' : checkPasscode,
    'setLanguage' : setLanguage,
    'getSessionDetails' : getSessionDetails,
    'loadLoginParamsFromSession' : loadLoginParamsFromSession,
    'loadAdminParamsFromSession' : loadAdminParamsFromSession,
    'getDebugMode' : getDebugMode,
    'changeExpiredPassword' : changeExpiredPassword,
    'setNotificationStatusForApp' : setNotificationStatusForApp,
    'getNotificationsStatusForAllApps' : getNotificationsStatusForAllApps,
    'changeExpiredPasswordInternal' : changeExpiredPasswordInternal,
    'setNotificationSound' : setNotificationSound,
    'setNotificationVibrate' : setNotificationVibrate,
    'getNuboSettingsSecurityPasscode' : getNuboSettingsSecurityPasscode,
    'installApkForUser': installApkForUser,
    uninstallApkForUser,
    canInstallListForUser,
    factoryReset
};

module.exports = Settings;

function getDebugMode() {
    return (Common.settingsDebugMode == undefined) ? false : Common.settingsDebugMode;
};

function isHttpGetDebug() {
    return false;
};

function getSessionDetails(req, res, next) {
    var status = 1;

    var session = req.body.session;
    if (session == null || session.length < 5) {
        logger.info("getSessionDetails. Invalid session");
        res.send({
            status : '0',
            message : "Invalid parameters"
        });
        return;
    }

    new Session(session, function(err, obj) {
        if (err || !obj) {
            var msg = "Session does not exist. err:" + err;
            logger.info(msg);
            res.send({
                status : '0',
                message : "Cannot find session"
            });
            return;
        }
        var email = obj.params.email;
        logger.info("getSessionDetails mail " + email);

        Common.db.User.findAll({
            where : {
                email : email
            },
        }).complete(function(err, results) {

            if (!!err) {
                res.send({
                    status : '0',
                    message : "Internal error"
                });
                return;
            }

            if (!results || results == "") {
                res.send({
                    status : '0',
                    message : "Cannot find user"
                });
                return;
            }

            var firstName = results[0].firstname != null ? results[0].firstname : '';
            var lastName = results[0].lastname != null ? results[0].lastname : '';
            var jobTitle = results[0].jobtitle != null ? results[0].jobtitle : '';
            var orgDomain = results[0].orgdomain != null ? results[0].orgdomain : '';
            var orgEmail = results[0].orgemail != null ? results[0].orgemail : email;
            var isAdmin = results[0].isadmin != null ? results[0].isadmin : 0;
            var orgEmail = results[0].orgemail != null ? results[0].orgemail : '';

            res.send({
                status : '1',
                message : "ok",
                firstName : firstName,
                lastName : lastName,
                jobTitle : jobTitle,
                orgDomain : orgDomain,
                isAdmin : isAdmin,
                email : email,
                orgEmail : orgEmail,
                deviceid : obj.params.deviceid
            });
            return;
        });

    });
    // new Session
}// function getSessionDetails




function changePasscode(req, res, next) {
    changeOrCheckPasscode('change', req, res, next);
}

function checkPasscode(req, res, next) {
    changeOrCheckPasscode('check', req, res, next);
}

function changeOrCheckPasscode(cmd, req, res, next) {
    //https://login.nubosoftware.com/settings/changePasscode?secret=[]&session=[]&curPasscode=[]&newPasscode=[
    const finish = "__finish";
    var status = 1;
    var msg = "";

    var email = "";
    loadAdminParamsFromSession(req, res, function(err, login) {

        if (!getDebugMode()) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }
            var domain = login.loginParams.mainDomain;
            email = login.getEmail();
        } else {
            var domain = "nubosoftware.com";
        }

        var session = req.body.session;
        if (session == null || session.length < 5) {
            logger.error("changeOrCheckPasscode. Invalid session");
            status = 0;
        }

        var curPasscode = req.params.curPasscode;
        if (curPasscode == null || curPasscode.length < 5) {
            logger.error("changeOrCheckPasscode. Invalid current Passcode");
            status = 0;
        }

        if (cmd == 'change') {
            var newPasscode = req.params.newPasscode;
            if (setPasscode.validatePassword(logger, newPasscode) == 0) {
                logger.error("changeOrCheckPasscode. Invalid new Passcode");
                status = 0;
            }
        }

        if (status != 1) {
            res.send({
                status: '0',
                message: "Invalid parameters"
            });
            return;
        }

        var response = {
            status: Common.STATUS_ERROR,
            message: 'Internal error'
        };

        async.series([
        function(callback) {
            new Session(session, function (err, obj) {
                if (err || !obj) {
                    var msg = "Session does not exist. err:" + err;
                    logger.info(msg);
                    callback(msg);
                    return;
                }
                //logger.info('Session found: '+JSON.stringify(obj,null,2));
                email = obj.params.email;
                if (email == "demo@nubosoftware.com") {
                    var msg = "Demo user cannot change data in db. err:" + err;
                    callback(msg);
                    return;
                }
                callback(null);
            });
        },
        function(callback) {
            Common.db.User.findAll({
                attributes: ['passcode','passcodesalt'],
                where: {
                    email: email
                },
            }).complete(function (err, results) {

                if (!!err) {
                    var msg = "Internal error while fetching user from DB, err is: "+ err;
                    logger.error(msg);
                    callback(msg);
                    return;
                }

                if (!results || results == "") {
                    var msg = "Cannot find user";
                    callback(msg);
                    return;
                }

                var passCol = results[0].passcode;
                console.log('passCol: ' + passCol);
                if (passCol == null || passCol.length < 1) {
                    var msg = "Cannot find passcode";
                    callback(msg);
                    return;
                }
                var passcodeSalt = results[0].passcodesalt;
                var curHashedPasscode = setPasscode.hashPassword(curPasscode,passcodeSalt);
                if (passCol != curHashedPasscode) {
                    var msg = "Current passcode does not match";
                    callback(msg);
                    return;
                }
                console.log('cmd: ' + cmd);
                if (cmd != 'change') {
                    var msg = "Passcode is valid!";
                    response.status = Common.STATUS_OK;
                    response.message = msg;
                    callback(msg);
                    return;
                }
                callback(null);
            });
        },
        function(callback) {
            setPasscode.checkPasscodeHistory(login, newPasscode, finish, function (err) {
                if (err) {
                    response.status = Common.STATUS_ERROR;
                    if (err == finish) {
                        response.message = "Passcode already exists, choose a different passcode";
                    }
                }
                callback(err);
            });
        },
        function(callback) {
            var salt = setPasscode.generateUserSalt(login.getEmail());
            var passwordHash = setPasscode.hashPassword(newPasscode,salt);
            Common.db.User.update({
                passcodeupdate: new Date(),
                passcode: passwordHash,
                passcodetypechange: 0,
                passcodesalt: salt
            }, {
                where: {
                    email: email
                }
            }).then(function () {
                var msg = "Passcode changed successfully";
                response.status = Common.STATUS_OK;
                response.message = msg;
                callback(msg);
                return;
            }).catch(function (err) {
                var msg = 'Internal error, error is: ' + err;
                logger.error(msg);
                callback(msg);
                return;
            });
        }
        ], function(err) {
            res.send(response);
        });
    });

}



function loadLoginParamsFromSession(req, res, callback) {
    // https://login.nubosoftware.com/settings/[command]?session=[]&...other
    // params

    var session = "";
    if (isHttpGetDebug()) {
        session = req.params.session;
    } else {
        session = req.body.session;
    }

    if (!getDebugMode() && (session == null || session.length < 5)) {
        logger.error("loadLoginParamsFromSession. Invalid session");
        callback("Invalid parameters");
        return;
    }
    new Session(session, function(err, obj) {
        if (err || !obj) {
            var msg = "Session does not exist. err:" + err;
            logger.info(msg);
            callback(msg);
            return;
        }
        //logger.info('Session found: '+JSON.stringify(obj.params,null,2));
        var loginToken = obj.params.loginToken;

        new Login(loginToken, function(err, login) {
            if (err) {
                msg = "Invalid loginToken, err:" + err;
                callback(msg);
                return;
            }
            //console.dir(login.loginParams);
            callback(null, login,obj);
        });
        // new Login
    });
    // new Session
}

function loadAdminParamsFromSession(req, res, callback) {
    if (req.nubodata.adminLogin) {
        callback(null,req.nubodata.adminLogin);
        return;
    }
    loadLoginParamsFromSession(req, res, function(err, login) {
        if (getDebugMode()) {
            callback(null, login);
        } else {
            if (login && login.loginParams.isAdmin != 1) {
                /*TODO: BUG: functions that use in that function request login object even in error case */
                callback("User is not admin", login);
            } else {
                callback(err, login);
            }
        }
    });
}

function setLanguage(req, res, next) {
    //https://login.nubosoftware.com/settings/setLanguage?session=[]&langCode=[]&countryCode=[]
    var langCode = req.params.langCode;
    if (langCode == null || langCode.length < 2) {
        logger.info("setLanguage. Invalid lang code");
        res.send({
            status : '0',
            message : "Invalid parameters"
        });
        return;
    }
    var localevar = req.params.localevar;
    if (localevar == null) {
        localevar = '';
    }
    var countryCode = req.params.countryCode;
    if (countryCode == null || countryCode.length < 2) {
        logger.info("setLanguage. Invalid country code");
        res.send({
            status : '0',
            message : "Invalid parameters"
        });
        return;
    }
    loadLoginParamsFromSession(req, res, function(err, login) {
        if (err) {
            res.send({
                status : '0',
                message : err
            });
            return;
        }
        var email = login.getEmail();
        var deviceID = login.getDeviceID();
        var setLanguageValues = {
            langCode : langCode
        };
        var setCountryValues = {
            countryCode : countryCode
        };

        if (email != "demo@nubosoftware.com") {

            Common.db.User.update({
                language : langCode,
                countrylang : countryCode,
                localevar : localevar
            }, {
                where : {
                    email : email
                }
            }).then(function() {
                res.send({
                    status : '1',
                    message : "Language changed successfully."
                });
                return;
            }).catch(function(err) {
                res.send({
                    status : '0',
                    message : "Internal error: " + err
                });
                return;
            });

        } else {
            res.send({
                status : '0',
                message : "Demo user does not change any data in DB"
            });
            return;
        }
    });
}



function changeExpiredPasswordInternal(email, callback) {

    var americandm = email.substring(email.lastIndexOf('@') + 1);
    if(americandm === 'americanlaser.co.il'){
        var msg = "skipping only for americanlaser!!!!!";
        callback(null, msg);
        return;
    }

    var msg = "";
    Common.db.Activation.update({
        firstlogin : 1
    }, {
        where : {
            email : email
        }
    }).then(function() {
        var Notification = require('./Notifications.js');
        Notification.notify(email, "Your password has expired", "", "", -1, function(err) {
            if (err) {
                msg = 'changeExpiredPasswordInternal: cannot notify client, err: ' + err;
                callback(msg, msg);
            } else {
                msg = "password changed successfully."
                callback(null, msg);
            }
        });
    }).catch(function(err) {
        msg = "Internal error: " + err;
        callback(msg, msg);
        return;
    });

}

// Change expired password
// This function update 'firstlogin' to 1 (create startup.json)
// When a user login to Nubo with an expired password he will be prompted to change the password (login screen)

function changeExpiredPassword(req, res, next) {
    //https://login.nubosoftware.com/settings/changeExpiredPassword?session=[]
    var domain = req.params.domain;
    logger.debug("settings::changeExpiredPassword: domain= " + domain);
    loadLoginParamsFromSession(req, res, function(err, login) {
        if (err) {
            res.send({
                status : '0',
                message : err
            });
            return;
        }
        var registrationEmail = login.getEmail();
        if (registrationEmail == "demo@nubosoftware.com") {
            res.send({
                status : '0',
                message : "Demo user cannot change data in db"
            });
            return;
        } else {
            changeExpiredPasswordInternal(registrationEmail, function (err, msg) {
                if (err) {
                    logger.error(err);
                }
                res.send({
                    status : err ? '0':'1',
                    message : msg
                });
            });
        }
    });
}



function setNotificationSound(req, res, next) {

    var enableSound = req.params.enableSound;
    if (enableSound == null || enableSound.length <= 0) {
        logger.info("setNotificationSound. Invalid enableSound");
        res.send({
            status : '0',
            message : "Invalid parameters"
        });
        return;
    }

    loadAdminParamsFromSession(req, res, function(err, login) {

        if (!getDebugMode()) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }
            var domain = login.loginParams.mainDomain;
            var email = login.getEmail();
        } else {
            var domain = "nubosoftware.com";
        }

        Common.db.User.update({
            enablesound : enableSound
        }, {
            where : {
                email : email,
                orgdomain : domain
            }
        }).then(function() {
            res.send({
                status : 1,
                message : "Update notification sound successfully"
            });

        }).catch(function(err) {
            var errormsg = 'Error on updating notification sound: ' + err;
            res.send({
                status : 0,
                message : err
            });
            return;
        });
    });
}

function setNotificationVibrate(req, res, next) {

    var enableVibrate = req.params.enableVibrate;
    if (enableVibrate == null || enableVibrate.length <= 0) {
        logger.info("setNotificationVibrate. Invalid enableVibrate");
        res.send({
            status : '0',
            message : "Invalid parameters"
        });
        return;
    }

    loadAdminParamsFromSession(req, res, function(err, login) {

        if (!getDebugMode()) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }
            var domain = login.loginParams.mainDomain;
            var email = login.getEmail();
        } else {
            var domain = "nubosoftware.com";
        }

        Common.db.User.update({
            enablevibrate : enableVibrate
        }, {
            where : {
                email : email,
                orgdomain : domain
            }
        }).then(function() {
            res.send({
                status : 1,
                message : "Update notification vibrate successfully"
            });

        }).catch(function(err) {
            var errormsg = 'Error on updating notification vibrate: ' + err;
            res.send({
                status : 0,
                message : err
            });
            return;
        });
    });
}

function setNotificationStatusForApp(req, res, next) {
    //https://login.nubosoftware.com/settings/setNotificationStatusForApp?session=[]&appName=[]&notificationStatus=[]

    var appName = req.params.appName;
    if (appName == null || appName.length <= 0) {
        logger.info("setNotificationStatusForApp. Invalid App Name");
        res.send({
            status : '0',
            message : "Invalid parameters"
        });
        return;
    }
    var notificationStatus = req.params.notificationStatus;
    if (notificationStatus == null || (notificationStatus != 0 && notificationStatus != 1)) {
        logger.info("setNotificationStatusForApp. Invalid Notification Status");
        res.send({
            status : '0',
            message : "Invalid parameters"
        });
        return;
    }
    loadLoginParamsFromSession(req, res, function(err, login) {
        if (err) {
            res.send({
                status : '0',
                message : err
            });
            return;
        }
        var email = login.getEmail();
        var mainDomain = login.getMainDomain();
        if (email != "demo@nubosoftware.com") {

            Common.db.UserApplicationNotifs.findAll({
                attributes : ['appname','maindomain','email','sendnotif'],
                where : {
                    appname    : appName,
                    email      : email,
                    maindomain : mainDomain
                },
            }).complete(function(err, results) {
                if (!!err) {
                    res.send({
                        status : '0',
                        message : "Internal error: " + err
                    });
                    return;

                }
                if (!results || results == "") {

                    // Insert new entry to database
                    Common.db.UserApplicationNotifs.create({
                        maindomain : mainDomain,
                        email : email,
                        appname : appName,
                        sendnotif : notificationStatus
                    }).then(function(results) {
                        async.series([
                              function (callback) {
                                  res.send({
                                      status : '1',
                                      message : "Notification status was added successfully"
                                  });
                                  callback(null);
                              },

                              function (callback) {
                                  // remove notification, int enterprise edition only
                                  if (Common.isEnterpriseEdition()) {
                                    Common.getEnterprise().settings.updateSubscriptionForUser(appName,notificationStatus,email,mainDomain,callback);
                                  } else {
                                      callback(null);
                                  }
                              }],

                              function (err) {
                              }
                        );
                        return;
                    }).catch(function(err) {
                        res.send({
                            status : '0',
                            message : "can't create notification status for " + appName + ", error is:" + err
                        });
                        return;
                    });
                } else {
                    // update existing entry
                    Common.db.UserApplicationNotifs.update({
                        sendnotif : notificationStatus
                    }, {
                        where : {
                            maindomain : mainDomain,
                            email : email,
                            appname : appName
                        }
                    }).then(function(results) {
                        async.series([
                              function (callback) {
                                  res.send({
                                      status : '1',
                                      message : "Notification status was updated successfully"
                                  });
                                  callback(null);
                              },

                              function (callback) {
                                  // remove notification,. enterpirse only
                                  if (Common.isEnterpriseEdition()) {
                                    Common.getEnterprise().settings.updateSubscriptionForUser(appName,notificationStatus,email,mainDomain,callback);
                                  } else {
                                      callback(null);
                                  }
                              }],

                              function (err) {
                                    // do nothing, just print to log
                                    if (err) {
                                        logger.error("Error in updating notification settings:" + err);
                                    }
                              }
                        );
                        return;
                    }).catch(function(err) {
                        res.send({
                            status : '0',
                            message : "can't update notification status for " + appName + ", error is:" + err
                        });
                        return;
                    });
                }
            });

        } else {
            res.send({
                status : '0',
                message : "Demo user does not change any data in DB"
            });
            return;
        }
    });
}


/*
 *
 */
function getNotificationsStatusForAllApps(req, res, next) {
    // https://login.nubosoftware.com/settings/getNotificationsStatusForAllApps?session=[]
    loadLoginParamsFromSession(req, res, function(err, login)  {
        if (err) {
            res.send({
                status : '0',
                message : err
            });
            return;
        }
        var email = login.getEmail();
        var mainDomain = login.getMainDomain();

        var enableSound = 0;
        var enableVibrate = 0;
        var dataRes;

        async.series([
          // get user details
          function(callback) {
              Common.db.User.findAll({
                  attributes : ['enablesound', 'enablevibrate'],
                  where : {
                      email : email,
                      orgdomain : mainDomain
                  },
              }).complete(function(err, results) {

                  if (!!err) {
                      callback(err);
                      return;
                  }

                  if (!results || results == "") {
                      logger.error("getNotificationVolume, user not found ");
                      callback("getNotificationVolume, user not found ");
                      return;
                  }
                  // get all values of current row
                  enableSound = results[0].enablesound != null ? results[0].enablesound : '';
                  enableVibrate = results[0].enablevibrate != null ? results[0].enablevibrate : '';
                  callback(null);
                  return;
              });
          },
          function(callback) {
              userModule.getUserNotificationsStatusForAllApps(email, function(errorMessage, appsNotifResponse) {
                  if (err) {
                      callback(err);
                      return;
                  }
                  dataRes = '{"status" : "1",' + appsNotifResponse + ',"enableSound":' + enableSound + ',"enableVibrate":' + enableVibrate + '}';
                  callback(null);
                  return;
              });
          }], function(err, results) {

            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }
            res.write(dataRes);
            res.end('');
            return;
          });

    });
}


function getNotificationsStatusForAllAppsInternal(email, callback) {
    var resCnt = 0;

    Common.db.UserApplicationNotifs.findAll({
        attributes : ['appname', 'maindomain', 'email', 'sendnotif'],
        where : {
            email : email
        },
    }).complete(function(err, results) {

        if (!!err) {
            callback(err);
            return;
        }
        var buffer = '{"status":"1","appsNotifStatus":[';
        results.forEach(function(row) {

            // get all values of current row
            var appName = row.appname != null ? row.appname : '';
            var sendNotif = row.sendnotif != null ? row.sendnotif : '';

            var jsonNotifApp = {
                appName : appName,
                sendNotif : sendNotif
            };

            // separates every jsonUser
            if (resCnt > 0) {
                buffer += ',';
            }

            resCnt += 1;

            buffer += JSON.stringify(jsonNotifApp);

        });

        buffer += ']}';
        logger.info('APPS NAMES:' + buffer);
        callback(null, buffer);
        return;
    });

}

function getNuboSettingsSecurityPasscode(req, res, next) {

    loadLoginParamsFromSession(req, res, function(err, login) {
        if (!getDebugMode()) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }

            var domain = login.loginParams.mainDomain;
        } else {
            var domain = "nubosoftware.com";
        }

        getSecurityPasscode.getSecurityPolicyFromDB( req, res, domain, function(err, obj) {
            if (err) {
                res.send({
                    status : '0',
                    message : "Internal error: " + err
                });
                return;
            }
            var json = JSON.stringify({
                status : "1",
                message : "import security settings succedded",
                passcodeType : obj.passcodeType,
                passcodeMinChars : obj.passcodeMinChars,
                passcodeExpirationDays : obj.passcodeExpirationDays,
                passcodetypechange : obj.passcodetypechange
            });
            res.end( json );
        });
    });
}

function uninstallApkForUser(req, res, next) {
    loadLoginParamsFromSession(req, res, function(err, login,sess) {
        if (err) {
            res.send({
                status : '0',
                message : err
            });
            return;
        }
        if (!sess) {
            logger.error("uninstallApkForUser: Cannot find session");
            res.send({
                status : '0',
                message : "Cannot find session"
            });
            return;
        }
        var email = login.getEmail();
        var deviceID = login.getDeviceID();
        var packageName = req.params.packageName;
        var platid = sess.params.platid;
        var localid = sess.params.localid;

        logger.info("uninstallApkForUser. email: "+email+", deviceID: "+deviceID+", packageName: "+packageName);
        if (Common.isMobile()) {
            Common.getMobile().appMgmt.uninstallAPKToUser(email,deviceID,packageName,platid,localid,function(err){
                if (err) {
                    logger.error(`Error uninstallApkForUser. status: ${err.status}, message: ${err.message}`);
                    res.send(err);
                } else {
                    logger.info("APK Un-installed successfully");
                    res.send({
                        status : '1', // DELETE_SUCCEEDED = 1
                        message : 'APK Un-installed successfully'
                    });
                }
            });
        } else {
            logger.info("uninstallApkForUser. Not mobile platform");
            res.send({
                status : '0', // DELETE_SUCCEEDED = 1
                message : 'Not mobile platform'
            });
        }
        return;
    });
}

function installApkForUser(req, res, next) {
    loadLoginParamsFromSession(req, res, function(err, login,sess) {
        if (err) {
            res.send({
                status : '0',
                message : err
            });
            return;
        }
        if (!login) {
            logger.error("installApkForUser: Cannot find login token");
            res.send({
                status : '0',
                message : "Cannot find login token"
            });
            return;
        }
        if (!sess) {
            logger.error("installApkForUser: Cannot find session");
            res.send({
                status : '0',
                message : "Cannot find session"
            });
            return;
        }
        var email = login.getEmail();
        var deviceID = login.getDeviceID();
        var mainDomain = login.getMainDomain();
        var apkName = req.params.apkPath;
        var platid = sess.params.platid;
        var localid = sess.params.localid;

        logger.info("installApkForUser. email: "+email+", deviceID: "+deviceID+", apkName: "+apkName);
        if (Common.isMobile()) {
            Common.getMobile().appMgmt.uploadAPKToUser(email,mainDomain,deviceID,apkName,platid,localid,function(err){
                if (err) {
                    if (err.status) {
                        logger.info("Install failed with status: "+err.status);
                        res.send(err);
                    } else {
                        logger.error("Error installing APK: "+err);
                        res.send({
                            status : '0',
                            message : 'Error installing APK for user'
                        });
                    }
                } else {
                    logger.info("APK Installed successfully");
                    res.send({
                        status : '1',
                        message : 'APK Installed successfully'
                    });
                }

            });
        } else {
            logger.info("installApkForUser. Not mobile platform");
            res.send({
                status : '0', 
                message : 'Not mobile platform'
            });
        }

        return;
    });
}

function canInstallListForUser(req, res, next) {
    loadLoginParamsFromSession(req, res, function(err, login,sess) {
        if (err) {
            res.send({
                status : '0',
                message : err
            });
            return;
        }
        if (!login) {
            logger.error("canInstallListForUser: Cannot find login token");
            res.send({
                status : '0',
                message : "Cannot find login token"
            });
            return;
        }
        if (!sess) {
            logger.error("canInstallListForUser: Cannot find session");
            res.send({
                status : '0',
                message : "Cannot find session"
            });
            return;
        }

        var email = login.getEmail();
        var deviceID = login.getDeviceID();
        var mainDomain = login.getMainDomain();

        logger.info("canInstallListForUser. email: "+email+", deviceID: "+deviceID," , mainDomain: "+mainDomain);
        require('./userUtils.js').getAppListForUser(email,mainDomain,function(err,list){
            if (err) {
                logger.error("Error canInstallListForUser: "+err);
                console.error(err);
                res.send({
                    status : '0',
                    message : 'Error canInstallListForUser'
                });
            } else {
                logger.info(`canInstallListForUser successfully. Found ${list.length} apps`);
                res.send({
                    status : '1',
                    message : 'OK',
                    list: list
                });
            }

        });

        return;
    });
}

function factoryReset(req, res, next) {
    loadLoginParamsFromSession(req, res, function(err, login,sess) {
        if (err) {
            res.send({
                status : '0',
                message : err
            });
            return;
        }
        if (!login) {
            logger.error("factoryReset: Cannot find login token");
            res.send({
                status : '0',
                message : "Cannot find login token"
            });
            return;
        }
        if (!sess) {
            logger.error("factoryReset: Cannot find session");
            res.send({
                status : '0',
                message : "Cannot find session"
            });
            return;
        }

        var email = login.getEmail();
        var deviceID = login.getDeviceID();
        var mainDomain = login.getMainDomain();

        logger.info("factoryReset request from: email: "+email+", deviceID: "+deviceID," , mainDomain: "+mainDomain);
        require('./userUtils.js').wipeUserDevice(email,function(err){
            if (err) {
                logger.error("Error factoryReset",err);
                res.send({
                    status : '0',
                    message : 'Error factoryReset'+err
                });
            } else {
                logger.info(`factoryReset successfully.`);
                res.send({
                    status : '1',
                    message : 'OK'
                });
            }

        });

        return;
    });
}



