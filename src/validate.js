var fs = require('fs');
var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var Login = require('./login.js');
var User = require('./user.js');
var ThreadedLogger = require('./ThreadedLogger.js');
var async = require('async');
var UserUtils = require('./userUtils.js');
var Config = require('./config.js');
var CommonUtils = require("./commonUtils.js");
var eventLog = require('./eventLog.js');
var EV_CONST = eventLog.EV_CONST;
var jwt = require('jsonwebtoken');

Validate = {
    func: validate,
    getClientConf: getClientConf,
    recheckValidate
};

module.exports = Validate;

//user is allowed 3 login attempts. then he will be locked.
var MAX_LOGIN_ATTEMPTS = 3;
//number of tries to validate before sending error to client
var MAX_VALIDATE_RETRIES = 4;
// time to wait before attempt to validate again.
var VALIDATE_ATTEMPT_INTERVAL = 500;

function returnInternalError(err, res) {
    status = Common.STATUS_ERROR;
    // internal error
    msg = "Internal error";
    console.error(err.name, err.message);
    logger.info(msg + ": " + err);
    if (res != undefined) {
        res.send({
            status: status,
            message: msg
        });
    }
    return;
}


function recheckValidate(req, res, next) {
    var status = Common.STATUS_ERROR;
    var message = 'Internal error';
    var loginToken = req.params.loginToken;
    async.series([
        function(callback) {
            new Login(loginToken, function(err, loginObj) {
                if (err) {
                    return callback(err);
                }
                if (!loginObj || loginObj.loginToken != loginToken) {
                    status = Common.STATUS_EXPIRED_LOGIN_TOKEN;
                    message = "Invalid loginToken";
                    callback(new Error(message));
                    return;
                }
                status = Common.STATUS_OK;
                message = "Login token found";
                callback();
            });
        }],function(err) {
            if (err) {
                logger.info(`recheckValidate error: ${err}`)
            }
            var response = {
                status: status,
                message: message
            };
            res.send(response);
        });

}
// https://login.nubosoftware.com/validate?username=[username]&deviceid=[deviceId]&activationKey=[activationKey]
function validate(req, res, next) {
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    //var timelog = logger.timelogger;
    res.contentType = 'json';
    var playerVersion = req.params.playerVersion ? req.params.playerVersion : null;
    var activationKey = req.params.activationKey ? req.params.activationKey : null;
    var jwtToken = req.params.jwt;
    var deviceId = req.params.deviceid ? req.params.deviceid : null;
    var clientIP = req.header('x-client-ip'); //req.connection.remoteAddress;
    // var clientIPint = req.header('x-client-ip');
    var clientUserName = req.params.username ? req.params.username : null;
    var timeZone = req.params.timeZone ? req.params.timeZone : null;

    var hideNuboAppPackageName = req.params.hideNuboAppPackageName;
    if (hideNuboAppPackageName == undefined || hideNuboAppPackageName.length < 1) {
        hideNuboAppPackageName = '';
    }
    var newProcess = req.params.newProcess ? (req.params.newProcess == "true" || req.paras.newProcess == true) : false;
    if (hideNuboAppPackageName != "") {
        logger.info(`hideNuboAppPackageName: ${hideNuboAppPackageName}, newProcess: ${newProcess}`);
    }

    var sessionTimeout = Common.sessionTimeout;
    if (req.params.sessionTimeout) {
        const userSessionTimeout = parseInt(req.params.sessionTimeout);
        if (Common.timeoutParams && Common.timeoutParams.allowUserSessionTimeout === true) {
            if (userSessionTimeout >= Common.timeoutParams.userSessionTimeoutMin && userSessionTimeout <= Common.timeoutParams.userSessionTimeoutMax) {
                sessionTimeout = userSessionTimeout;
                logger.info(`validate: user session timeout: ${sessionTimeout}`);
            }
        }
    }
    let customParams = req.body ? req.body.customParams : undefined;
    if (customParams) {
        logger.info(`validate: customParams: ${JSON.stringify(customParams, null, 2)}`);
    }

    if (Common.restrictWebClientAccess && deviceId.includes("web") && !CommonUtils.webclientAllowedToaccess(clientIP)) {
        res.send({
            status: Common.STATUS_ERROR,
            message: "web client forbited to access"
        });
        logger.error("validate: web client forbited to access");
        return;
    }

    var error = null;
    var response = null;
    var iter = 0;

    async.waterfall([
        function(callback) {
            checkIfNeedRedirection(playerVersion, activationKey, clientIP, deviceId, logger, function(err, redirectResponse, userData, activationData) {
                if (err || redirectResponse) {
                    error = err;
                    response = redirectResponse;
                    callback('done');
                    return;
                }

                callback(null, userData, activationData);
            });
        },
        function(userData, activationData, callback) {
            async.whilst(
                function() {
                    return (!response && iter <= MAX_VALIDATE_RETRIES);
                },
                function(callback) {
                    logger.info("validateActivation...");
                    validateActivation(activationKey, deviceId, userData, activationData, req.url, timeZone, clientUserName, clientIP, logger, hideNuboAppPackageName, newProcess, sessionTimeout, jwtToken, customParams, function(err, validateResponse) {
                        if (err)
                            error = err;

                        if (validateResponse) {
                            response = validateResponse;
                            callback(null);
                            return;
                        }

                        setTimeout(function() {
                            ++iter;
                            callback(null);
                        }, VALIDATE_ATTEMPT_INTERVAL);
                    });
                }, callback);
        }
    ], function(err) {
        if (error) {
            logger.error("validate: error handling validate request: "+error);
        }

        if (!response) {
            logger.error('validate: don\'t have response to send');
            response = {
                status: Common.STATUS_ERROR,
                message: 'Internal error. Please contact administrator.'
            }
            res.send(response);
            return;
        }

        if (!error && response)
            logger.info("validate: user successfully validated");
        //logger.info("client response: ", JSON.stringify(response, null, 2));
        res.send(response);

        return;
    });
}

function checkIfNeedRedirection(playerVersion, activationKey, clientIP, deviceId, logger, callback) {

    var finish = 'finish';
    var response = null;
    var error = null;
    var userData = null;
    var activationData = null;


    async.series([
        //check client version
        function(callback) {
            if (playerVersion && playerVersion.length > 1) {
                var playerVer = parseVersion(playerVersion);
                var twoNumbersVersionStr = playerVer.major + "." + playerVer.minor;
                if (Common.versionRedirectionMap) {
                    var redirect = Common.versionRedirectionMap[twoNumbersVersionStr];
                    if (redirect && redirect != Common.dcURL) {
                        // need to redirect user no another server based on geographic location
                        var msg = "Redirecting user from " + twoNumbersVersionStr + " to " + redirect;
                        logger.info("checkIfNeedRedirection: player version not supported, " + msg);
                        response = {
                            status: Common.STATUS_CHANGE_URL,
                            message: msg,
                            mgmtURL: redirect
                        }
                        callback(finish);
                        return;
                    }
                }

                var minVer = parseVersion(Common.minPlayerVersion);
                if (!deviceId.includes("web") &&
                    (playerVer.major < minVer.major ||
                    (playerVer.major == minVer.major && playerVer.minor < minVer.minor) ||
                    (playerVer.major == minVer.major && playerVer.minor == minVer.minor && playerVer.val1 < minVer.val1) ||
                    (playerVer.major == minVer.major && playerVer.minor == minVer.minor &&
                                                        playerVer.val1 == minVer.val1 && playerVer.val2 < minVer.val2))) {

                    response = {
                        status: Common.STATUS_INVALID_PLAYER_VERSION,
                        message: "Invalid player version"
                    }
                    callback(finish);
                    return;
                }
            }
            callback(null);
        },
        //get activation data to get the user name
        function(callback) {
            if (!Common.dcName || !Common.dcURL) {
                callback(finish);
                return;
            }
            getActivationData(activationKey, logger, function(err, activation) {
                if (err) {
                    var msg = 'failed getting activation data';
                    logger.error(msg+": "+err);
                    response = {
                        status: Common.STATUS_ERROR,
                        message: msg
                    }
                    error = msg;
                    callback(finish);
                    return;
                } else {
                    //logger.info("activation: "+JSON.stringify(activation,null,2));
                    if (activation.status === Common.STATUS_ERROR) {
                        error = "Activation pending"
                        response = {
                            status: Common.STATUS_ERROR,
                            deviceapprovaltype: activation.deviceapprovaltype,
                            message: 'Activation pending. Please try again later.'
                        }
                        callback(error);
                    } else {
                        activationData = activation;
                        callback(null);
                    }
                }
            });
        },
        // check player version again when device type is known
        function(callback) {
            let deviceTypeVersion = Common["minPlayerVersion"+activationData.devicetype];
            if (!deviceTypeVersion) {
                callback(null);
                return;
            }
            var playerVer = parseVersion(playerVersion);
            var minVer = parseVersion(deviceTypeVersion);
            if ((playerVer.major < minVer.major ||
                (playerVer.major == minVer.major && playerVer.minor < minVer.minor) ||
                (playerVer.major == minVer.major && playerVer.minor == minVer.minor && playerVer.val1 < minVer.val1) ||
                (playerVer.major == minVer.major && playerVer.minor == minVer.minor &&
                                                    playerVer.val1 == minVer.val1 && playerVer.val2 < minVer.val2))) {

                response = {
                    status: Common.STATUS_INVALID_PLAYER_VERSION,
                    message: "Invalid player version"
                }
                logger.info(`Invalid player version for device type ${activationData.devicetype}, player version: ${playerVersion}, minumum version: ${deviceTypeVersion}`);
                callback(finish);
                return;
            } else {
                logger.info(`Valid player version for device type ${activationData.devicetype}, player version: ${JSON.stringify(playerVer)}, minumum version: ${JSON.stringify(minVer)}`);
            }
            callback(null);
        },
        // check if user connected already to some data center
        function(callback) {
            if (!Common.dcName || !Common.dcURL) {
                callback(finish);
                return;
            }

            UserUtils.createOrReturnUserAndDomain(activationData.email, logger, function(err, user, userObj, orgObj) {
                if (err) {
                    response = {
                        status: Common.STATUS_ERROR,
                        message: 'Internal error'
                    }

                    logger.error("checkIfNeedRedirection: couldn't get user, " + err);
                    error = err;
                    callback(finish);
                    return;
                }

                userData = user;
                userData.org = orgObj;
                userData.user = userObj;

                if (!user.dcname || Common.dcName == user.dcname) {
                    callback(finish);
                    return;
                }

                var msg = "Redirecting user from " + Common.dcName + " to " + user.dcname;
                logger.info("checkIfNeedRedirection: user connected already, " + msg);

                response = {
                    status: Common.STATUS_CHANGE_URL,
                    message: msg,
                    mgmtURL: user.dcurl
                };

                if (!Common.withService || !deviceId.includes("web")) {
                    callback(finish);
                    return;
                }

                Config.getDataCenterConfig(Common.db, user.dcname, logger, function(err, conf) {
                    if (err) {
                        response = {
                            status: Common.STATUS_ERROR,
                            message: 'Internal error'
                        }
                        logger.error("checkIfNeedRedirection: " + err);
                        error = err;
                        callback(finish);
                        return;
                    }

                    response.mgmtURL = conf.dcInternalURL;

                    callback(finish);
                    return;

                });
            });
        }
    ], function(finish) {
        callback(error, response, userData, activationData);
    });
}






function getActivationData(activationKey, logger, callback) {

    Common.db.Activation.findAll({
        attributes: ['activationkey', 'status', 'email', 'deviceid', 'firstlogin', 'resetpasscode', 'firstname', 'lastname', 'jobtitle', 'devicetype', 'devicename','secondAuthRegistred','expirationdate','biometric_token','otp_token','pushregid','deviceapprovaltype','public_key'],
        where: {
            activationkey: activationKey
        },
    }).complete(function(err, results) {
        if (!!err) {
            logger.error("getActivationInfo: ffff" + err);
            var errMsg = "Internal database error";
            callback(errMsg);
            return;
        }

        if (!results || results == "") {
            var errMsg = "activationKey not found!";
            logger.error("getActivationInfo: " + errMsg);
            callback(errMsg);
            return;
        }

        if (results.length != 1) {
            var errMsg = "Internal database error";
            logger.error("getActivationInfo: more then one activation key, key: " + activationKey);
            callback(errMsg);
            return;
        }

        callback(null, results[0]);
    });
}

function getUserDeviceData(email, deviceID, logger, maindomain, callback) {
    /*var blockedDevices = [];
    Common.db.BlockedDevices.findAll({
        attributes: ['filtername'],
        where: {
            maindomain: maindomain,
        },
    }).complete(function(err, results) {
        if (!!err) {
            errormsg = 'Error on get Blocked Devices: ' + err;
            console.log(errormsg);
            return;
        } else if (results) {
            results.forEach(function(row) {
                blockedDevices.push(row.filtername);
            });
        }
    });*/

    Common.db.UserDevices.findAll({
        attributes: ['email', 'imei', 'active', 'devicename', 'loginattempts'],
        where: {
            email: email,
            imei: deviceID
        },
    }).complete(function(err, results) {
        if (!!err) {
            logger.error('getUserDeviceData: ' + err);
            var errMsg = "Internal database error";
            callback(errMsg);
            return;

        }

        if (!results || results == "") {
            var errMsg = "Device does not exist";
            logger.error('getUserDeviceData: ' + errMsg);
            callback(errMsg);
            return;
        }

        if (results.length != 1) {
            var errMsg = "Internal database error";
            logger.error("getUserDeviceData: more then one device, deviceID: " + deviceID);
            callback(errMsg);
            return;
        }

        require('./ControlPanel/getBlockedDevices').checkBlockDevice(maindomain,results[0].imei,results[0].devicename).then(isDeviceBlocked => {
            var loginattempts = results[0].loginattempts != null ? results[0].loginattempts : 0;
            callback(null, results[0], isDeviceBlocked, loginattempts);
        }).catch (err => {
            callback(err);
        });
        /*for (var i = 0; i < blockedDevices.length; i++) {
            //console.log("****getUserDeviceData. devicename: " + results[0].devicename + ", blockedDevices[i]: " + blockedDevices[i]);

            // check if devicename is in our blockedDevices table
            if (results[0].devicename && blockedDevices[i]) {
                if (results[0].devicename.toLowerCase().indexOf(blockedDevices[i].toLowerCase()) > -1) {
                    isDeviceBlocked = true;
                    break;
                }
            }

            // check if imei is in our blockedDevices table
            if (results[0].imei && blockedDevices[i]) {
                if (results[0].imei.toLowerCase().indexOf(blockedDevices[i].toLowerCase()) > -1) {
                    isDeviceBlocked = true;
                    break;
                }
            }
        };*/


    });
}

function validateActivation(activationKey, deviceID, userdata, activationdata, url, timeZone,
    clientUserName, clientIP, logger, hideNuboAppPackageName, newProcess, sessionTimeout, jwtToken, customParams, callback) {

    var finish = 'finish';
    var response = null;
    var error = null;
    var loginToken = null;



        var login;
        var activationData = activationdata;
        var userData = userdata;
        var userDeviceData = null;

        var adminName = "";
        var adminEmail = "";

        async.series([
            //get activation data
            function(callback) {
                if (activationData) {
                    callback(null);
                } else {
                    getActivationData(activationKey, logger, function(err, activation) {
                        if (err) {
                            response = {
                                status: Common.STATUS_ERROR,
                                message: err
                            }
                            error = err;
                            logger.error('validateActivation: ' + err);
                            callback(finish);
                            return;
                        }

                        logger.user(activation.email);
                        activationData = activation;
                        callback(null);
                    });
                }
            },
            // check jwt token if public key is set
            function(callback) {
                activationData.customParams = customParams;
                if (activationData.public_key) {
                    // jwt
                    try {
                        // logger.info('validateActivation: jwtToken: ' + jwtToken);
                        if (!jwtToken) {
                            throw new Error("JWT token is missing");
                        }
                        var decoded = jwt.verify(jwtToken, activationData.public_key);
                        if (!decoded) {
                            throw new Error("Invalid JWT");
                        }
                        let decodedActivationKey = decoded.activationKey;
                        if (!decodedActivationKey) {
                            decodedActivationKey = decoded.sub;
                        }
                        if (decodedActivationKey !== activationKey) {
                            throw new Error("Invalid activationKey in JWT");
                        }
                        callback(null);
                    } catch (err) {
                        response = {
                            status: Common.STATUS_ERROR,
                            message: "Invalid JWT"
                        }
                        error = err;
                        logger.error('validateActivation: ' + err);
                        callback(finish);
                        return;
                    }
                } else {
                    // logger.info(`validateActivation: no public key set for activationKey: ${activationKey}`);
                    callback(null);
                }
            },
            //check activation data
            function(callback) {
                switch (activationData.status) {
                    case 0:
                        var msg = "Activation pending. Please try again later.";
                        response = {
                            status: Common.STATUS_ERROR,
                            deviceapprovaltype: activationData.deviceapprovaltype,
                            message: msg
                        }
                        callback(finish);
                        return;
                    case 1:
                        callback(null);
                        return;
                    case 2:
                        response = {
                            status: Common.STATUS_EXPIRED_LOGIN_TOKEN,
                            message: "Activation expired. Please register again."
                        }
                        callback(finish);
                        return;
                    case 3:
                        logger.info('************** we should NEVER get here ***********');
                        callback(null);
                        return;
                    case Common.STATUS_RESET_BIOMETRIC_PENDING:
                    case Common.STATUS_RESET_OTP_PENDING:
                    case Common.STATUS_RESET_PASSCODE_PENDING:
                        let expirationdate = activationData.expirationdate;
                        //logger.info("validate. expirationdate: "+expirationdate+", type: "+typeof expirationdate+", activationData: "+JSON.stringify(activationData,null,2));
                        let now = new Date();
                        if (expirationdate > now || true) {
                            var msg = "Passcode reset pending. Please try again later.";
                            response = {
                                status: activationData.status,
                                deviceapprovaltype: activationData.deviceapprovaltype,
                                message: msg
                            }
                            callback(finish);
                            return;
                        } else {
                            // expiration date passed - cancel reset pascode state
                            Common.db.Activation.update({
                                status: Common.STATUS_OK,
                                emailtoken: "",
                                resetpasscode: 0
                            }, {
                                    where: {
                                        activationkey: activationKey,
                                        status: Common.STATUS_RESET_PASSCODE_PENDING
                                    }
                                }).then(function () {
                                    activationData.status = Common.STATUS_OK;
                                    activationData.resetpasscode = 0;
                                    logger.info("expiration date passed - cancel reset pascode state. expirationdate: "+expirationdate+", now: "+now);
                                    callback(null);
                                    return;
                                }).catch(function (err) {
                                    var msg = "Internal error. Please contact administrator.";
                                    response = {
                                        status: Common.STATUS_ERROR,
                                        message: msg
                                    }
                                    logger.error('validateActivation. Common.db.Activation.update: ' + err);
                                    callback(finish);
                                    return;
                                });
                            return;
                        }
                    default:
                        var msg = "Internal error. Please contact administrator.";
                        response = {
                            status: Common.STATUS_ERROR,
                            message: msg
                        }
                        logger.error('validateActivation: ' + msg);
                        callback(finish);
                        return;
                }
            },
            // check userName and deviceID
            function(callback) {
                if (deviceID !== activationData.deviceid && !Common.allowDeviceIDChange) {
                    error = "device ID recived from client doesnt indentical to the one in activation table";
                    logger.error('validateActivation: ' + error + " URL: " + url);
                    response = {
                        status: Common.STATUS_ERROR,
                        message: error
                    }
                    callback(finish);
                } else
                    callback(null);
            },
            //get user data
            function(callback) {
                if (userData) {
                    callback(null);
                } else {
                    UserUtils.createOrReturnUserAndDomain(activationData.email, logger, function(err, resObj, userObj, orgObj) {
                        if (err) {
                            response = {
                                status: Common.STATUS_ERROR,
                                message: "Internal error. Please contact administrator."
                            }
                            error = err;
                            logger.error('validateActivation: ' + err);
                            callback(finish);
                            return;
                        }
                        userData = resObj;
                        userData.org = orgObj;
                        userData.user = userObj;
                        callback(null);
                    });
                }
            },
            //run plugin validation if exists
            function(callback) {
                if (Common.pluginsEnabled) {
                    require('./plugin').invokeTriggerWaitForResult('validation', 'before',activationData,userData).then(function (result) {
                        if (result === false) {
                            error = "Plugin validation failed.";
                            response = {
                                status: Common.STATUS_ERROR,
                                message: error
                            }
                            callback(finish);
                        } else {
                            callback(null);
                        }
                    }).catch(function (err) {
                        logger.error('validateActivation:invokeTriggerWaitForResult. error: ' + err);
                        callback(null);
                    });
                } else {
                    callback(null);
                }
            },            
            function(callback) {
                if (Common.isMobile()) {
                    Common.getMobile().mobileUserUtils.createUserVariablesFiles(userData, activationData, logger, function(err) {
                        callback(null);
                    });
                } else {
                    callback(null);
                }
            },
            // get admin data
            function(callback) {
                Common.db.User.findOne({
                    attributes: ['email', 'firstname', 'lastname'],
                    where: {
                        orgdomain: userData.domain,
                        isadmin: '1'
                    },
                }).complete(function(err, admin) {
                    if (err) {
                        errormsg = 'Error on get Admin' + err;
                        console.log(errormsg);
                        callback(errormsg);
                        return;
                    }

                    if (!admin) {
                        logger.warn("validateActivation: cannot find admin for organization");
                        callback(null);
                        return;
                    }

                    adminName = admin.firstname + " " + admin.lastname;
                    adminEmail = admin.email;
                    callback(null);
                });
            },
            //check user data
            function(callback) {
                if (userData.user.isactive == 0) {
                    response = {
                        status: Common.STATUS_DISABLE_USER,
                        message: "user not active!. Please contact administrator.",
                        orgName: userData.orgName,
                        adminEmail: adminEmail,
                        adminName: adminName
                    }
                    callback(finish);
                    return;
                }

                callback(null);
            },
            //get and check user device data
            function(callback) {
                var email = activationData.email;
                var deviceid = activationData.deviceid;
                var maindomain = userData.domain;
                getUserDeviceData(email, deviceid, logger, maindomain, function(err, userDevice, isDeviceBlocked, loginattempts) {
                    if (err) {
                        response = {
                            status: Common.STATUS_ERROR,
                            message: err
                        }
                        error = err;
                        logger.error('validateActivation. getUserDeviceData error: ' + err,err);
                        console.log(err);
                        callback(finish);
                        return;
                    }

                    if (isDeviceBlocked) {
                        response = {
                            status: Common.STATUS_DISABLE_USER_DEVICE,
                            message: "device " + deviceid + " blocked!. Please contact administrator.",
                            orgName: userData.orgName,
                            adminEmail: adminEmail,
                            adminName: adminName
                        }
                        var extra_info = `Attempt to login from a blocked device. device name: ${userDevice.devicename}, device id: ${deviceid}`;
                        eventLog.createEvent(EV_CONST.EV_DEVICE_TYPE_BLOCKED, email, maindomain, extra_info, EV_CONST.WARN, function(err) {
                            if(err) logger.error("createEvent failed with err: " + err);
                        });
                        callback(finish);
                        return;
                    }

                    if (userDevice.active == 0) {
                        response = {
                            status: Common.STATUS_DISABLE_USER_DEVICE,
                            message: "device " + deviceid + " not active!. Please contact administrator.",
                            orgName: userData.orgName,
                            adminEmail: adminEmail,
                            adminName: adminName
                        }
                        var extra_info = `Attempt to login from a disabled device. device name: ${userDevice.devicename}, device id: ${deviceid}`;
                        eventLog.createEvent(EV_CONST.EV_DISABLED_USER_DEVICE, email, maindomain, extra_info, EV_CONST.WARN, function(err) {
                            if(err) logger.error("createEvent failed with err: " + err);
                        });
                        callback(finish);
                        return;
                    }

                    // when user is first created, he gets loginattempts = 0.
                    // there is no possibility that user has loginattempts = null.
                    // this can only be due to reasons such as alter table from old db
                    let maxLoginAttempts = MAX_LOGIN_ATTEMPTS;
                    if(Common.hasOwnProperty("maxLoginAttempts")){
                        maxLoginAttempts = Common.maxLoginAttempts;
                    }
                    if (!Common.withService && maxLoginAttempts > 0 && loginattempts  >= maxLoginAttempts) {
                        response = {
                            status: Common.STATUS_PASSWORD_LOCK,
                            deviceapprovaltype: activationData.deviceapprovaltype,
                            message: "User passcode has been locked. Unlock email was sent. Please contact administrator."
                        }
                        logger.info('validateActivation: user passcode has been locked. Unlock email was sent. Please contact administrator.');
                        callback(finish);
                        return;
                    }

                    userDeviceData = userDevice;
                    callback(null);
                });
            },
            //create login token
            function(callback) {
                new Login(null, function(err, newLogin) {
                    if (err) {
                        response = {
                            status: Common.STATUS_ERROR,
                            message: "Internal error. Please contact administrator."
                        }
                        error = err;
                        logger.error('validateActivation: ' + err);
                        callback(finish);
                        return;
                    }

                    login = newLogin;
                    callback(null);
                });
            },
            function(callback) {
                if (Common.isEnterpriseEdition()) {
                    Common.getEnterprise().settings.prepareValidateUser(login,userData,activationData,hideNuboAppPackageName,function(err) {
                        if (err) {
                            response = {
                                status: Common.STATUS_ERROR,
                                message: "Internal error. Please contact administrator."
                            }
                            error = err;
                            callback(finish);
                            return;
                        } else {
                            callback(null);
                        }
                    });
                } else {
                    var passcode = userData.passcode;
                    var resetPasscode = activationData.resetpasscode != null ? activationData.resetpasscode : 0;
                    login.setPasscodeActivationRequired(passcode == null || passcode == '' || resetPasscode == 1);
                    login.setAuthenticationRequired(false);
                    callback(null);
                }
            },
            function(callback) {

                login.setDeviceName(userDeviceData.devicename);
                login.setDeviceID(userDeviceData.imei);
                login.setEmail(userData.email);
                login.setUserName(userData.username);
                login.setImUserName(userData.username);
                login.setActivationKey(activationKey);
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
                if (Common.secondFactorAuthType) {
                    login.setSecondFactorAuth(Common.secondFactorAuthType.NONE);
                }
                login.loginParams.secondAuthRegistred = activationData.secondAuthRegistred;
                login.loginParams.public_key = activationData.public_key;

                login.loginParams.hideNuboAppPackageName = hideNuboAppPackageName;
                login.loginParams.sessionTimeout = sessionTimeout;
                login.loginParams.clientauthtype = userData.org.clientauthtype;
                login.loginParams.secondauthmethod = userData.org.secondauthmethod;
                login.loginParams.otptype = userData.org.otptype;
                login.loginParams.watermark = userData.org.watermark;
                login.loginParams.pushregid = activationData.pushregid;
                login.loginParams.docker_image = userData.docker_image;
                login.loginParams.recording = userData.recording || userData.org.recordingall || 0 ;
                //logger.info(`userData.recording: ${userData.recording}, userData.org.recordingall: ${userData.org.recordingall}, login.loginParams.recording: ${login.loginParams.recording}`);

                let canSetBiometricToken;
                if (activationData.biometric_token == "") {
                    //logger.info("Biometric token can be set!");
                    canSetBiometricToken = true;
                } else {
                    canSetBiometricToken = false;
                }

                let canSetOTPToken;
                if (activationData.otp_token == "") {
                    //logger.info("OTP token can be set!");
                    canSetOTPToken = true;
                } else {
                    canSetOTPToken = false;
                }



                login.save(function(err, login) {
                    if (err) {
                        response = {
                            status: Common.STATUS_ERROR,
                            message: "Internal error. Please contact administrator."
                        }
                        error = err;
                        logger.error('validateActivation: ' + err);
                        callback(finish);
                        return;
                    }
                    response = {
                        status: Common.STATUS_OK,
                        message: "Device activated !",
                        authenticationRequired: login.getAuthenticationRequired(),
                        passcodeActivationRequired: login.getPasscodeActivationRequired(),
                        'orgName': userData.orgName,
                        'authType': userData.authType,
                        'firstName': (userData.firstname ? userData.firstname : ''),
                        'lastName': (userData.lastname ? userData.lastname : ''),
                        'jobTitle': (activationData.jobtitle ? activationData.jobtitle : ''),
                        'sendTrackData': Common.sendTrackData,
                        'trackDataUrl': Common.trackURL,
                        'platformVersionCode': Common.platformVersionCode,
                        'photoCompression': Common.photoCompression,
                        'clientProperties': Common.clientProperties,
                        'sendCameraDetails': Common.sendCameraDetails,
                        passcodeminchars: userData.org.passcodeminchars,
                        passcodetype: userData.org.passcodetype,
                        passcodetypechange: userData.user.passcodetypechange,
                        clientauthtype:  userData.org.clientauthtype,
                        secondauthmethod:  userData.org.secondauthmethod,
                        otptype: userData.org.otptype,
                        watermark: userData.org.watermark,
                        canSetBiometricToken,
                        canSetOTPToken,
                        'disableUserAuthentication' : (Common.disableUserAuthentication === true ? true : false),
                        loginToken: login.getLoginToken()
                    }
                    //logger.info("Validate response: "+JSON.stringify(response,null,2));

                    if (Common.fastConnection) {
                        loginToken = login.getLoginToken();
                    }

                    callback(finish);


                });
            }
        ], function(finish) {
            callback(error, response);
            if (response.status == Common.STATUS_OK) {
                const getAuthReq = login.getAuthenticationRequired();
                logger.info(`validate. Common.fastConnection: ${Common.fastConnection}, activationData.firstlogin: ${activationData.firstlogin}, getAuthReq: ${getAuthReq}, typeof getAuthReq: ${typeof getAuthReq}`);
                if (hideNuboAppPackageName != "" && newProcess && login && activationData && activationData.deviceid) {
                    var email = activationData.email;
                    var deviceid = activationData.deviceid;
                    require('./SessionController').closeSessionOfUserDevice(email,deviceid).then( () => {
                        logger.info("Close session for hideNuboAppPackageName");
                    }).catch(err => {
                        logger.info("Close session for hideNuboAppPackageName error: "+err);
                    });
                } else if (!error && Common.fastConnection &&
                    loginToken && login &&
                    (typeof getAuthReq != 'string' || getAuthReq != "true") &&
                    (typeof getAuthReq != 'boolean' || getAuthReq != true) ) {
                //optimistic login - starting user session...

                    logger.info("fast connection enabled, optimistic startsession");
                    var startSessionParams = {
                        clientIP: clientIP,
                        loginToken:loginToken,
                        timeZone: timeZone,
                        fastConnection: true
                    }
                    require('./SessionController').startSessionImp(startSessionParams).then( respParams => {
                        // logger.info(`Optimistic Start session completed. err: ${JSON.stringify(respParams.err,null,2)}, resObj: ${JSON.stringify(respParams.resObj,null,2)} `);
                    }).catch(respParams => {
                        // logger.info(`Optimistic start session failed. err: ${JSON.stringify(respParams.err,null,2)} , resObj: ${JSON.stringify(respParams.resObj,null,2)}`);
                    });
                }
            }
        });

}

function getClientConf(req, res, next) {
    // console.log(req.url)
    // var fingerPrint = req.params.fingerprint === 'true' ? true : false;
    var supportedConf = req.params.supportedConf;
    var loginToken = req.params.loginToken;
    var clientIP = req.header('x-client-ip');
    var finish = "__finish";

    var logger = new ThreadedLogger(Common.getLogger(__filename));
    var login;
    var webClient;
    logger.info("getClientConf. supportedConf: "+supportedConf);


    var response = {
        status: Common.STATUS_ERROR,
        message: 'Internal error'
    };

    var OTP_MASK = 1;
    var FIDO_MASK = 2;
    var MTRANSKEY_MASK = 4;

    async.series([
        function(callback) {
            new Login(loginToken, function(err, loginObj) {
                if (err) {
                    return callback(err);
                }

                if (!loginObj) {
                    response.status = Common.STATUS_EXPIRED_LOGIN_TOKEN;
                    response.message = "Invalid loginToken";
                    loginToken = 'notValid';

                    return callback("shouldn't get this error!!!");
                }

                login = loginObj;
                logger.user(login.getEmail());
                webClient = login.getDeviceID().includes("web");
                if (webClient) {
                    return callback("web client shouldn't access this API !!!!!!!!!!!!!!!!!");
                }

                callback(null);
            });
        },
        function(callback) {
            if (Common.isEnterpriseEdition()) {
                Common.getEnterprise().passwordUtils.afterClientConf(login,supportedConf,response,callback);
            } else {
                return callback(null);
            }
        },
        function(callback) {
            var regid = req.params.regid;
            if (!regid || regid.length == 0) {
                callback(null);
                return;
            }
            if (regid == login.loginParams.pushregid) {
                //logger.info("pushregid not changed...");
                callback(null);
                return;
            }
            login.loginParams.pushregid = regid;
            Common.db.Activation.update({
                pushregid : regid
            }, {
                where : {
                    activationkey : login.getActivationKey()
                }
            }).then(function() {
                logger.info("Update pushregid: "+regid);
                callback();
            }).catch(function(err) {
                logger.info("Error in update  pushregid" + err);
                callback();
                return;
            });

        },
        function(callback) {
            login.save(callback);
        }
    ], function(err) {
        if (err && err != finish) {
            logger.error("getClientConf: " + err);
            logger.error("\n\n: getclientConf: ", response)
            res.send(response);
            return;
        }

        response.status = Common.STATUS_OK;
        response.message = "ok";
        //logger.error("\n\n: getclientConf: " , response)
        res.send(response);

    });
}

function parseVersion(verStr) {
    var ver = {
        major: 0,
        minor: 0,
        val1: 0,
        val2: 0
    };
    
    var arr = verStr.split(".");
    if (arr.length >= 2) {
        // Extract only numeric part and convert to number
        ver.major = parseInt(arr[0].match(/^\d+/)[0] || 0);
        ver.minor = parseInt(arr[1].match(/^\d+/)[0] || 0);
    }
    if (arr.length >= 3) {
        ver.val1 = parseInt(arr[2].match(/^\d+/)[0] || 0);
        if (arr.length >= 4) {
            ver.val2 = parseInt(arr[3].match(/^\d+/)[0] || 0);
        }
    }
    // logger.info(`parseVersion. ver: ${JSON.stringify(ver,null,2)}`);
    return ver;
}
