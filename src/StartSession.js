"use strict";

require('date-utils');
var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var Login = require('./login.js');
var async = require('async');
var platformModule = require('./platform.js');
var Platform = platformModule.Platform;
var sessionModule = require('./session.js');
var ThreadedLogger = require('./ThreadedLogger.js');
const SessionController = require('./SessionController.js');


var StartSession = {
    func: startSession,
    endSession: endSession,
    startSessionByDevice: startSessionByDevice,
    declineCall,
};

module.exports = StartSession;



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

    SessionController.startSessionImp(startSessionParams).then( respParams => {
        response2Client(respParams.session, respParams.resObj, res, respParams.isLocalIP, respParams.logger, respParams.loginToken);
    }).catch(respParams => {
        response2Client(respParams.session, respParams.resObj, res, respParams.isLocalIP, respParams.logger, respParams.loginToken);
    });

}

function startSessionByDevice(email,imei,userDeviceData,cb) {
    SessionController.startSessionByDevice(email,imei,userDeviceData).then( () => {
        // logger.info(`startSessionByDevice. session started for email: ${email}, imei: ${imei}`);
        if (cb) cb();
    }).catch( err => {
        // logger.error(`startSessionByDevice. error: ${err}`);
        if (cb) cb(err);
    });
}


function endSession(sessionID, callback, closeSessionMsg) {
    // logger.info(`Called obselete function endSession, stack : ${new Error().stack}`);
    SessionController.endSession(sessionID, closeSessionMsg).then(function() {
        callback(null);
    }).catch(function(err) {
        callback(err);
    });
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
        if (session.params.recording) {
            resobj.recording = session.params.recording;
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


