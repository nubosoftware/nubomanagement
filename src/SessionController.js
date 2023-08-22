"use strict";

/**
 * Contains the session control functions that are used by the server.
 * The session control functions are used to start, stop sessions.
 * This also handle some calls from the API
 */

const Common = require('./common.js');
const logger = Common.getLogger(__filename);
const Login = require('./login.js');
const ThreadedLogger = require('./ThreadedLogger.js');
const CommonUtils = require("./commonUtils.js");
const User = require('./user.js');
const Lock = require('./lock.js');
var sessionModule = require('./session.js');
var Session = sessionModule.Session;
const PlatformModule = require('./platform.js');
const nfsModule = require('./nfs.js');
const platformModule = require('./platform.js');
const gatewayModule = require('./Gateway.js');
const Plugin = require('./plugin.js');
const { Op } = require('sequelize');
const _ = require('underscore');

const SESSION_TYPE_MOBILE = "vmi_mobile";
const SESSION_TYPE_DESKTOP = "vmi_desktop";

module.exports = {
    startSessionImp: startSessionImp,
    endSession: endSession,
    logoutUser: logoutUser,
    logoutUserImp: logoutUserImp,
    startSessionByDevice,
    closeSessionOfUserDevice,
    closeOtherSessions,
    closeOtherSessionsImp,
    startSessionFromClient,
    list,
    reloadSessionTypesCache,
}

/**
 * Load a login object from the redis
 * If the login object is not found, it raises an error
 * @param {*} loginToken
 * @returns Login object
 */
function getLogin(loginToken) {
    return new Promise(function (resolve, reject) {
        new Login(loginToken, function (err, login) {
            if (err) {
                reject(err);
                return;
            }
            if (!login) {
                reject(new Error('Login token not found'));
                return;
            }
            resolve(login);
        });
    });
}


/**
 * Load NFS object for the given user
 * @param {*} email
 * @param {*} logger
 * @returns
 */
function getNFSObject(email, logger) {
    return new Promise(function (resolve, reject) {
        nfsModule({
            UserName: email,
            logger: logger,
            nfs_idx: Common.nfsId
        }, function (err, nfs) {
            if (err) {
                reject(err);
                return;
            }
            resolve(nfs);
        });
    });
}

/**
 * Find available gateway
 * If no gateway is found, it raises an error
 * @param {*} logger
 * @returns Gateway object
 */
function findGateway(logger) {
    return new Promise(function (resolve, reject) {
        var gwObj = {
            index: -1
        };
        logger.logTime(`startSessionImp before gatewayModule`);
        new gatewayModule.Gateway(gwObj, {
            logger: logger
        }, function (err, gateway) {
            if (err) {
                if (err instanceof Error) {
                    reject(err);
                } else {
                    reject(new Error(err));
                }
            } else if (!gateway) {
                reject(new Error('Gateway not found'));
            } else {
                resolve(gateway);
            }
        });
    });
}

/**
 * Create session files
 * @param {*} session
 * @param {*} deviceParams
 * @param {*} appParams
 * @returnsc Promise<xml_file_content>
 */
function createSessionFiles(session, deviceParams, appParams) {
    return new Promise(function (resolve, reject) {
        Common.getMobile().mobileUserUtils.createSessionFiles(session, deviceParams, appParams, function (err, _xml_file_content) {
            if (err) {
                if (err instanceof Error) {
                    reject(err);
                } else {
                    reject(new Error(err));
                }
            } else {
                resolve(_xml_file_content);
            }
        });
    });
}

/**
 * Attach session to the platform
 * @param {*} session
 * @param {*} timeZone
 * @returns
 */
function attachUser(session, timeZone) {
    return new Promise(function (resolve, reject) {
        session.platform.attachUser(session, timeZone, function (err, res) {
            if (err) {
                if (err instanceof Error) {
                    reject(err);
                } else {
                    reject(new Error(err));
                }
            } else {
                resolve(res);
            }
        });
    });
}


/**
 * Detach session from the platform
 * @param {*} session
 * @returns
 */
function detachUser(session) {
    return new Promise(function (resolve, reject) {
        session.platform.detachUser(session, function (err, res) {
            if (err) {
                let throwErr;
                if (err instanceof Error) {
                    throwErr = err;
                } else {
                    throwErr = new Error(err);
                }
                // add the response to the error
                throwErr.res = res;
                reject(throwErr);
            } else {
                resolve(res);
            }
        });
    });
}



/**
 * Install apps on the platform
 * @param {*} session
 * @param {*} time
 * @param {*} hrTime
 * @param {*} uninstallFunc
 * @returns
 */
function startSessionInstallations(session, time, hrTime) {
    return new Promise(function (resolve, reject) {
        var uninstallFunc = require('./ControlPanel/deleteAppFromProfiles.js').uninstallAPKForUserOnPlatforms;
        Common.getMobile().appMgmt.startSessionInstallations(session, time, hrTime, uninstallFunc, function (err) {
            if (err) {
                if (err instanceof Error) {
                    reject(err);
                } else {
                    reject(new Error(err));
                }
            } else {
                resolve();
            }
        });
    });
}

//

/**
 * Start NuboGL service
 * @param {*} session
 * @returns
 */
function startNuboGL(session) {
    return new Promise(function (resolve, reject) {
        Common.getEnterprise().nuboGL.startNuboGL(session, function (err) {
            if (err) {
                if (err instanceof Error) {
                    reject(err);
                } else {
                    reject(new Error(err));
                }
            } else {
                resolve();
            }
        });
    });
}

/**
 * Start session from client API
 * @param {*} req
 * @param {*} res
 * @param {*} login
 */
async function startSessionFromClient(req,res,login) {
    var startSessionParams = {
        clientIP: req.headers["x-client-ip"],
        loginToken: login.loginToken,
        login: login,
        timeZone: req.params.timeZone,
        platid: req.params.platid,
        sessionType: req.params.sessionType,
        target: req.params.target,
    }
    if (req.params.deviceParams && req.params.deviceParams.width) {
        startSessionParams.deviceParams = req.params.deviceParams;
        logger.info(`startSession. reading deviceParams from request`);
    }
    try {
        const {session, isLocalIP, logger} = await startSessionImp(startSessionParams);
        let resobj = {
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


        //updateLastActivityInDB(login);
        var date = new Date().toISOString();
        var email = login.loginParams.email;
        var domain = login.loginParams.mainDomain;

        await Common.db.User.update({
            lastactivity: date
        }, {
            where: {
                email: email,
                orgdomain: domain
            }
        })
        logger.info("response to client: " + JSON.stringify(resobj, null, 2));
        res.send(resobj);
    } catch (respParams) {
        console.error(respParams);
        logger.error(`startSessionFromClient. error: ${JSON.stringify(respParams.resObj, null, 2)}, respParams: ${respParams}`);
        if (respParams.resObj) {
            res.send(respParams.resObj);
        } else {
            res.send({ status: 0, msg: "Internal error" });
        }
    }

}


var sessionTypesCache = undefined;
var reloadSessionTypes = false;

/**
 * Get session types
 * @returns
 */
function getSessionTypes() {
    if (sessionTypesCache && !reloadSessionTypes) {
        return sessionTypesCache;
    }
    let sessionTypes = [];
    if (Common.isMobile()) {
        sessionTypes.push({
            value: SESSION_TYPE_MOBILE,
            title: "Virtual Mobile",
            icon: "mdi-cellphone"
        });
    }
    if (Common.isDesktop()) {
        sessionTypes.push({
            value: SESSION_TYPE_DESKTOP,
            title: "Virtual Desktop",
            icon: "md-monitor"
        });
    }
    if (Common.pluginsEnabled) {
        const pluginSessions = Plugin.getSessionTypes();
        sessionTypes = sessionTypes.concat(pluginSessions);
    }
    sessionTypesCache = sessionTypes;
    reloadSessionTypes = false;
    return sessionTypes;
}

function reloadSessionTypesCache() {
    reloadSessionTypes = true;
}

/**
 * List running sessions and possible sessions to starts
 * @param {*} req
 * @param {*} res
 * @param {*} login
 */
async function list(req, res, login) {
    let status = Common.STATUS_ERROR;
    try {
        if (!login || !login.isValidLogin()) {
            throw new Error("Invalid login");
        }
        // get open session if exists
        const email = login.getEmail();
        const deviceID = login.getDeviceID();
        const rawSession = await sessionModule.getSessionOfUserDevicePromise(email, deviceID);
        let session;
        if (rawSession && rawSession.params) {
            session = _.pick(rawSession.params, ["sessid", "sessionType", "deviceType","target"]);
        }
        // get all session types
        let sessionTypes = getSessionTypes();

        let targets = [];
        for (const sessionType of sessionTypes) {
            let target = { ...sessionType};
            delete target.plugin;
            let addedTarget = false;
            if (sessionType.plugin) {
                const plugin = sessionType.plugin;
                try {
                    const pluginTargets = await plugin.callFunc('getSessionTargets', target, email, deviceID);
                    for (const target of pluginTargets) {
                        //logger.info(`SessionController:list. plugin target: ${target.target}, session target: ${session.target}`);
                        if (session && session.sessionType == target.value && session.target == target.target) {
                            target.session = session;
                        }
                        targets.push(target);
                    }
                    addedTarget = true;
                } catch (err) {
                   // ignore error - add session type without targets
                   logger.info(`SessionController:list. plugin error: ${err.message}, stack: ${err.stack}`);
                }
            }
            if (!addedTarget) {
                if (session && session.sessionType == target.value) {
                    target.session = session;
                }
                targets.push(target);
            }
        }

        const resObj = {
            status: Common.STATUS_OK,
            sessionTypes: targets,
            session: session
        };

        // send result
        res.send(resObj);

    } catch (err) {
        logger.info(`SessionController:list. error: ${err.message}, stack: ${err.stack}`);
        res.send({ status: status, msg: err.message });
    }
}


/**
 * Start session
 * @param {*} startSessionParams
 * @returns
 */
async function startSessionImp(startSessionParams) {
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    logger.logTime(`startSessionImp start`);
    // logger.info(`startSessionImp start. startSessionParams: ${JSON.stringify(startSessionParams, null, 2)}`);

    var msg = "";
    var status = 100; //unknown

    //read and validate params
    var clientIP = startSessionParams.clientIP;
    var isLocalIP = (clientIP && clientIP.indexOf(Common.internal_network) == 0) ? true : false;
    var loginToken = startSessionParams.loginToken;
    var timeZone = startSessionParams.timeZone || Common.defaultTimeZone;
    var dedicatedPlatID = startSessionParams.platid;
    var fastConnection = startSessionParams.fastConnection ? startSessionParams.fastConnection : null;
    var sessionType = startSessionParams.sessionType;
    var target = startSessionParams.target;
    var sessionTypeItem;
    var loginData;
    var login;
    var session;
    var webClient;
    var resObj = {
        status: 0,
        message: ""//'Internal error. Please contact administrator.'
    };

    try {
        // check if the loginToken is valid and load the login object
        if (startSessionParams.login) {
            loginData = startSessionParams.login;
            loginToken = loginData.loginToken;
            startSessionParams.loginToken = loginToken;
        } else {
            try {
                loginData = await getLogin(loginToken);
            } catch (err) {
                logger.info("startSessionImp getLogin error: " + err.message);
            }
        }

        // check if the login is valid (the user is logged in or this is automated fast connection)
        if (!loginData || (!fastConnection && !loginData.isValidLogin())) {
            var msg = "login isn\'t valid for user " + (loginData ? loginData.getUserName() : "");
            resObj = {
                status: 2,
                message: msg,
                loginToken: 'notValid'
            };
            throw new Error(msg);
        }

        // add some metadata to the logger
        logger.user(loginData.getEmail());
        logger.device(loginData.getDeviceID());
        logger.info("Start session", {
            mtype: "important"
        });

        var deviceType = loginData.loginParams.deviceType;
        var desktopDevice = false;
        if (deviceType == "Desktop") {
            desktopDevice = true;
        }

        // check session type
        if (!sessionType) {
            // try to generate default session type
            if (Common.isMobile() && Common.isDesktop()) {
                // if both mobile and desktop are enabled, check if this is a desktop client
                if (desktopDevice)
                    sessionType = SESSION_TYPE_DESKTOP;
                else
                    sessionType = SESSION_TYPE_MOBILE;
            } else if (Common.isMobile()) {
                sessionType = SESSION_TYPE_MOBILE;
            } else if (Common.isDesktop()) {
                sessionType = SESSION_TYPE_DESKTOP;
            }
        }
        if (!sessionType) {
            var msg = "session type is not defined";
            resObj = {
                status: 0,
                message: msg,
            };
            throw new Error(msg);
        }
        if (fastConnection && sessionType != SESSION_TYPE_MOBILE) {
            var msg = "fast connection is only supported for mobile session type";
            resObj = {
                status: 0,
                message: msg,
            };
            throw new Error(msg);
        }
        const sessionTypes = getSessionTypes();
        for (const item of sessionTypes) {
            if (item.value == sessionType) {
                sessionTypeItem = item;
                break;
            }
        }
        if (!sessionTypeItem) {
            var msg = "session type is not supported";
            resObj = {
                status: 0,
                message: msg,
            };
            throw new Error(msg);
        }
        startSessionParams.sessionTypeItem = sessionTypeItem;
        var pluginSession = false;
        if (sessionType.startsWith("plugin:")) {
            pluginSession = true;
        }



        // check if this is a web client
        if (loginData.getDeviceID())
            webClient = loginData.getDeviceID().includes("web");
        else
            webClient = false;

        // check if the user is allowed to start a session
        if (Common.restrictWebClientAccess && webClient) {
            if (!CommonUtils.webclientAllowedToaccess(clientIP)) {
                var msg = "Web client is not allowed to start a session";
                resObj = {
                    status: 0,
                    message: msg,
                };
                throw new Error(msg);
            }
        }

        // check if the user is not running a session in another datacenter
        const { dcname } = await User.getUserDataCenterPromise(loginData.getEmail(), logger);
        if (dcname && dcname != loginData.getDcname()) {
            var msg = `user is logged in at diffrent data center (${dcname}).`;
            resObj = {
                status: 2,
                message: msg,
                loginToken: 'notValid'
            };
            throw new Error(msg);
        }


        // logger.info("startSessionImp: deviceParams: " + JSON.stringify(startSessionParams.deviceParams, null, 2));
        if (sessionType == SESSION_TYPE_MOBILE) {
            if (startSessionParams.deviceParams) {
                // if there are new device params add them to the cache for next time
                let session_cache_params = JSON.stringify(startSessionParams.deviceParams);
                await Common.db.UserDevices.update({
                    session_cache_params: session_cache_params
                }, {
                    where: {
                        email: loginData.getEmail(),
                        imei: loginData.getDeviceID()
                    }
                });
            } else {
                // try to read old value for session_cache_params
                const { session_cache_params } = await Common.db.UserDevices.findOne({
                    attributes: ['session_cache_params'],
                    where: {
                        imei: loginData.getDeviceID(),
                        email: loginData.getEmail()
                    }
                });
                if (session_cache_params) {
                    startSessionParams.deviceParams = JSON.parse(session_cache_params);
                    if (!startSessionParams.timeZone && startSessionParams.deviceParams.timeZone) {
                        timeZone = startSessionParams.deviceParams.timeZone;
                    }
                } else {
                    logger.info("startSessionImp: deviceParams are missing");
                    const msg = "Cannot proceed with fast connection when deviceParams are missing";
                    resObj = {
                        status: 2,
                        message: msg,
                        loginToken: 'notValid'
                    };
                    throw new Error(msg);
                }
            }
        }

        login = loginData;
        var UserName = login.getUserName();
        var email = login.getEmail();
        var deviceID = login.getDeviceID();
        var domain = login.getMainDomain();
        var timeLog = logger.timelogger;
        var oldSession = false;
        var time = new Date().getTime();
        var hrTime = process.hrtime()[1];


        let userDeviceLock = new Lock({
            key: 'lock_' + email + '_' + deviceID,
            logger: logger,
            numOfRetries: 200,
            waitInterval: 500,
            lockTimeout: 1000 * 60 * 5 // 5 minutes
        });

        let ret = await userDeviceLock.acquirePromise();
        if (ret !== 1) {
            throw new Error(`Cannot acquire lock for user ${email} and device ${deviceID}`);
        }

        let buildStatus = {
            platformReferenceIncresed: false,
            platformLock: null,
            addToErrorsPlatforms: false,
            userAttached: false,
            sessionPlatformReferenceIncresed: false,
            gatewayReferenceIncresed: false,
            userDataCenterUpdated: false,
            userConnectedDeviceUpdated: false,
            revivePlatform: false,
            gatewayLock: null,
            sesionObjectCreated: false,
        };

        try {
            // buildUserSession

            var keys = null;




            // sessionModule.getSessionOfUserDevice
            let oldSession = false;
            session = await sessionModule.getSessionOfUserDevicePromise(email, deviceID);
            if (session) {
                // a session already exists for this user and device
                // we still need to check if the session is still valid
                // if it is valid we will return the session
                // if it is not valid we will throw an error
                if (session.params.deleteFlag == 1 || session.params.deleteError == 1) {
                    throw new Error("session in delete state");
                }
                if (session.params.forceExit == 1) {
                    throw new Error("session forced to exit");
                }
                if (session.params.sessionType != sessionType) {
                    throw new Error(`session type (${sessionType}) is not the same as the old session type (${session.params.sessionType})`);
                }
                oldSession = true;
                if (session.params.platid) {
                    const platform = await PlatformModule.getPlatform(session.params.platid);
                    session.platform = platform;
                }
                session.logger = logger;
                if (session.params.loginToken != login.loginParams.loginToken) {
                    Common.redisClient.publish("loginTokenChanged", session.params.loginToken);
                    session.params.loginToken = login.loginParams.loginToken;
                    var loginTokenObj = { loginToken: login.loginParams.loginToken };
                    await Common.redisClient.hmset('sess_' + session.params.sessid, loginTokenObj);
                }
                if (pluginSession) {
                    // if this is a plugin session we need to call the plugin startSession function
                    // to make sure the session is still started in the plugin
                    // session.params.pluginName = sessionTypeParts[1];
                    // session.params.pluginSessionType = sessionTypeParts[2];
                    const plugin = await Plugin.getPluginById(session.params.pluginName);
                    if (!plugin) {
                        throw new Error(`Cannot find plugin ${session.params.pluginName}`);
                    }
                    session.plugin = plugin;
                    try {
                        await plugin.callFunc('startSession', session, startSessionParams);
                        logger.info(`Plugin ${session.params.pluginName} startSession success`);
                    } catch (err) {
                        throw new Error(`Plugin ${session.params.pluginName} startSession failed. ${err}`);
                    }
                }
                await session.savePromise();
            } else {
                // no session exists for this user and device
                // we need to create a new session
                if (Common.limitOneSessionPerUser === true) {
                    // check if there is another session for this user
                    // if there is another session we will throw an error
                    const sessions = await sessionModule.getSessionIdsOfUser(email);
                    if (sessions && sessions.length > 0) {
                        resObj = {
                            status: -9,
                            message: `Found active session for user ${email}.`
                        };
                        throw new Error(`Found active session for user ${email}.`);
                    }
                }
                // create a new session object
                session = await sessionModule.loadSession(null, {
                    UserName: login.getUserName()
                });
                // configure some session parameters
                session.login = login;
                session.params.email = email;
                session.params.deviceid = deviceID;
                session.params.sessionType = sessionType;
                session.params.target = target;
                // some docker params. may need to move to relevant module/plugin
                session.params.docker_image = login.loginParams.docker_image;

                if (sessionType == SESSION_TYPE_MOBILE && Common.platformType == "docker") {
                    session.params.docker_image = `domain_${login.loginParams.mainDomain}`;;
                }
                session.params.deviceType = deviceType;
                session.params.maindomain = login.loginParams.mainDomain;
                session.params.devicename = login.loginParams.deviceName;
                if (startSessionParams.deviceParams && startSessionParams.deviceParams.appName) {
                    session.params.appName = startSessionParams.deviceParams.appName;
                } else {
                    session.params.appName = Common.defaultAppName;
                }
                session.params.tz = timeZone;

                // set recording path, will use for recording and app usage
                session.params.recording_path = Common.recording_path;

                // make sure to create the recording path in the first time only
                if (!Common.recordingPathCreated && Common.recording_path) {
                    const fsp = require('fs').promises;
                    try {
                        logger.info(`startSessionImp. creating recording path: ${Common.recording_path}`);
                        await fsp.mkdir(Common.recording_path, { recursive: true });
                        // set permissions allow write to all
                        await fsp.chmod(Common.recording_path, 0o777);
                    } catch (err) {
                        logger.error(`startSessionImp. error creating recording path: ${err.message}`);
                    }
                    Common.recordingPathCreated = true;
                }


                // set recording paramss
                if (login.loginParams.recording == 1) {
                    session.params.recording = login.loginParams.recording;
                    session.params.recording_name = `recording_${session.params.sessid}_0`;
                    logger.info(`recording: ${login.loginParams.recording}, recording_path: ${Common.recording_path}`);
                }
                // set app usage file name
                session.params.appUsageFileName = `appUsage_${session.params.sessid}.csv`;



                if (login.loginParams.hideNuboAppPackageName) {
                    session.params.hideNuboAppPackageName = login.loginParams.hideNuboAppPackageName;
                }

                // create session in redis
                session.params.activation = login.getActivationKey();
                session.params.deleteFlag = 0;
                session.params.loginToken = login.loginParams.loginToken;
                var now = new Date();
                session.params.startTime = now.toFormat("YYYY-MM-DD HH24:MI:SS");
                session.params.startTS = now.getTime();
                session.params.encrypted = login.loginParams.encrypted;
                session.params.forceExit = 0;

                await session.setUserAndDevicePromise(email, deviceID);
                await session.suspendPromise(1); // suspend session until first connection
                buildStatus.sesionObjectCreated = true;


                logger.info(`startSessionImp. session.params: ${JSON.stringify(session.params)}`);

                // get some paramters from the orgnization object in db
                const org = Common.db.Orgs.findOne({
                    attributes: ['dedicatedplatform', 'allowconnect'],
                    where: {
                        maindomain: login.loginParams.mainDomain
                    }
                });
                if (!org) {
                    throw new Error(`Cannot find organization for domain ${login.loginParams.mainDomain}`);
                }
                if (org.allowconnect === 0) {
                    throw new Error(`Organization ${login.loginParams.mainDomain} does not allow connections`);
                }
                session.params.dedicatedplatform = org.dedicatedplatform ? true : false;

                // if a docker image is not assigned to the session we will try to assign one
                if (Common.platformType == "docker" && !session.params.docker_image) {
                    const userDockerObj = Common.db.User.findOne({
                        attributes: ['docker_image'],
                        where: {
                            email: email
                        },
                    });
                    if (userDockerObj && userDockerObj.docker_image) {
                        session.params.docker_image = userDockerObj.docker_image;
                    } else if (sessionType == SESSION_TYPE_DESKTOP) {
                        // creating new image for desktop
                        const imageName = await Common.getDesktop().debs.createImageForUser(email, login.loginParams.mainDomain);
                        session.params.docker_image = imageName;
                        logger.info(`Using created image: ${imageName}`);
                    }
                }

                if (pluginSession) {
                    // if this is a plugin session we will not create the user folders,
                    // gateway, nfs and platform. We will just call plugin startSession
                    // and let the plugin handle the rest
                    const sessionTypeParts = sessionType.split(':');
                    if (sessionTypeParts.length != 3) {
                        throw new Error(`Invalid plugin session type ${sessionType}`);
                    }
                    session.params.pluginName = sessionTypeParts[1];
                    session.params.pluginSessionType = sessionTypeParts[2];
                    const plugin = await Plugin.getPluginById(session.params.pluginName);
                    if (!plugin) {
                        throw new Error(`Cannot find plugin ${session.params.pluginName}`);
                    }
                    session.plugin = plugin;
                    try {
                        await plugin.callFunc('startSession', session, startSessionParams);
                        logger.info(`Plugin ${session.params.pluginName} startSession success`);
                    } catch (err) {
                        throw new Error(`Plugin ${session.params.pluginName} startSession failed. ${err}`);
                    }
                } else {
                    // if the session is not a plugin session we will create the user folders
                    // and assign gateway , nfs and platform to the session
                    // validate the folders for the user exsist
                    const userUtils = require('./userUtils.js')
                    const foldersValid = await userUtils.validateUserFoldersPromise(email, deviceID, deviceType);
                    if (!foldersValid) {
                        logger.info(`startSessionImp. Folders not valid for user ${email}. Creating folders.`);
                        await userUtils.createUserFoldersPromise(email, deviceID, deviceType, true, time, hrTime);
                    }
                    const nfs = await getNFSObject(email, logger);
                    session.params.nfs_ip = nfs.nfs_ip;
                    session.params.nfs_idx = nfs.nfs_idx;
                    session.nfs = nfs;
                    logger.info(`startSessionImp. nfs_ip: ${nfs.nfs_ip}`);

                    // find a platform to run the session on
                    if (session.params.dedicatedplatform) {
                        session.params.platDomain = login.loginParams.mainDomain;
                    } else {
                        session.params.platDomain = 'common';
                    }
                    try {
                        const { plat, lock } = await platformModule.getAvailablePlatformPromise(null, dedicatedPlatID, session.params.platDomain, logger);
                        buildStatus.platformLock = lock;
                        buildStatus.platformReferenceIncresed = true;

                        session.platform = plat;
                        session.params.platid = plat.params.platid;
                        session.params.platform_ip = plat.params.platform_ip;
                        logger.info(`startSessionImp. platform: ${JSON.stringify(plat.params)}`);
                    } catch (err) {
                        resObj = {
                            status: 0,
                            message: "Not found available platform",
                            startSessionErrorCode: -8
                        };
                        throw err;
                    }

                    try {

                        // attach gateway to session
                        const gateway = await findGateway(logger);
                        session.params.gatewayIndex = gateway.params.index;
                        session.params.gatewayInternal = gateway.params.internal_ip;
                        session.params.gatewayExternal = gateway.params.external_ip;
                        session.params.isSSL = gateway.params.ssl;
                        session.params.gatewayPlayerPort = gateway.params.player_port;
                        session.params.gatewayAppsPort = gateway.params.apps_port;
                        session.params.gatewayControllerPort = gateway.params.controller_port;

                        buildStatus.gatewayLock = gateway.lock;

                        try {
                            // add app params
                            let appParams = Object.assign({}, Common.appParams);
                            if (sessionType == SESSION_TYPE_MOBILE && Common.platformType == "docker") {
                                // we load app params only to mobile devices
                                logger.logTime(`startSessionImp before appParams`);
                                const apps = await Common.db.Apps.findAll({
                                    attributes: ['packagename', 'displayprotocol'],
                                    where: {
                                        maindomain: login.loginParams.mainDomain,
                                        displayprotocol: {
                                            [Op.ne]: 0
                                        }
                                    },
                                });
                                if (apps && apps.length > 0) {
                                    if (!appParams) {
                                        appParams = {};
                                    }
                                    for (const app of apps) {
                                        let item = appParams[app.packagename];
                                        if (!item) {
                                            item = {};
                                        }
                                        item.displayprotocol = app.displayprotocol;
                                        appParams[app.packagename] = item;
                                    }
                                    logger.info(`appParams: ${JSON.stringify(appParams, null, 2)}`);
                                }
                            }

                            // create session files
                            if (sessionType == SESSION_TYPE_MOBILE) {
                                // we create session files only to mobile devices
                                logger.logTime(`startSessionImp before createSessionFiles`);
                                const _xml_file_content = await createSessionFiles(session, startSessionParams.deviceParams, appParams);
                                if (_xml_file_content) {
                                    session.xml_file_content = _xml_file_content;
                                }
                            }

                            // attach to platform
                            logger.logTime(`startSessionImp before attachUser`);
                            try {
                                const res = await attachUser(session,timeZone);
                                logger.info("attachUser. res: " + JSON.stringify(res, null, 2));
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
                            } catch (err) {
                                logger.error(`startSessionImp. Error attachUser: ${err}`, err);
                                buildStatus.addToErrorsPlatforms = true;
                                throw err;
                            }
                            buildStatus.userAttached = true;


                            // start server side openGL
                            if (Common.isEnterpriseEdition() && sessionType == SESSION_TYPE_MOBILE) {
                                await startNuboGL(session);
                            }

                            // update gateway Reference
                            await gatewayModule.updateGWSessionScorePromise(session.params.gatewayIndex, 1, session.params.sessid, session.logger);
                            buildStatus.gatewayReferenceIncresed = true;
                        } finally {
                            // unlock gateway
                            if (buildStatus.gatewayLock) {
                                try {
                                    await buildStatus.gatewayLock.releasePromise();
                                } catch (err) {
                                    logger.error(`startSessionImp. Error release gatewayLock: ${err}`, err);
                                }
                                buildStatus.gatewayLock = null;
                            }
                        }

                        // update platform references in redis
                        const cnt = await session.updatePlatformReferencePromise();
                        if (Common.platformParams.restartPlatformSessionsThreshold > 0 && cnt > Common.platformParams.restartPlatformSessionsThreshold) {
                            logger.info(`Platform exceeded the "Restat Platform Session Threshold": ${cnt}. Move platform to error for restart!`);
                            buildStatus.revivePlatform = true;
                        }
                        buildStatus.sessionPlatformReferenceIncresed = true;
                    } finally {
                        // unlock platform after pm
                        if (buildStatus.platformLock && buildStatus.platformLock.isAquired()) {
                            try {
                                await buildStatus.platformLock.releasePromise();
                            } catch (err) {
                                logger.error(`startSessionImp. Error release platformLock: ${err}`, err);
                            }
                        } else {
                            logger.info("Lock on platform not found");
                        }
                        buildStatus.platformLock = null;
                    }
                }

                // save session paramss in rediss
                await session.savePromise();



                // update user DB with data center details
                if (Common.dcName && Common.dcURL) {
                    logger.logTime(`startSessionImp before updateUserDataCenter`);
                    const dcname = login.getDcname() != '' ? login.getDcname() : null;
                    const dcurl = login.getDcurl() != '' ? login.getDcurl() : null;

                    if (dcname && dcurl) {
                        buildStatus.userDataCenterUpdated = true;
                        await Common.db.User.update({
                            dcname: dcname,
                            dcurl: dcurl
                        }, {
                            where: {
                                email: email
                            }
                        });
                    }
                }

                // update some database tables

                // update session history (do not wait for result)
                try {
                    Common.db.SessionHistory.create({
                        session_id: session.params.sessid,
                        email: session.params.email,
                        device_id: session.params.deviceid,
                        maindomain: session.params.maindomain,
                        devicename: session.params.devicename,
                        start_time: new Date(session.params.startTime),
                        end_time: new Date(),
                        platform: session.params.platid,
                        gateway: session.params.gatewayIndex,
                        active_seconds: 0
                    });
                } catch (err) {
                    logger.error(`startSessionImp. Error update session history: ${err}`, err);
                }

                //update user-device connected platform and gw
                await User.updateUserConnectedDevicePromise(email, login.getDeviceID(), session.params.platid, session.params.gatewayIndex, session.params.localid,true);
                buildStatus.userConnectedDeviceUpdated = true;

                // re validate folders of the user - disabled for now
                // insert user rules into iptables - disabled for now

                // Install/Uninstall new apps to user if needed
                if (sessionType == SESSION_TYPE_MOBILE) {
                    logger.logTime(`startSessionImp before startSessionInstallations`);
                    try {
                        await startSessionInstallations(session, time, hrTime);
                    } catch (err) {
                        logger.error(`startSessionImp. Error startSessionInstallations: ${err}`, err);
                    }
                }
            }

            // post session start actions
            logger.logTime(`startSessionImp before postStartSessionProcedure`);
            if (Common.isEnterpriseEdition()) {
                Common.getEnterprise().settings.postStartSessionProcedure(session.params.email);
            }
            if (!pluginSession) {
                Common.redisClient.publish("platformChannel", "refresh");
            }

            if (!oldSession) {
                await report(session, null, login, oldSession, logger, clientIP);
                setTimeout(() => {
                    require('./SmsNotification.js').deliverPendingMessagesToSession(session);
                }, 3000);
            } else {
                logger.info("startOrJoinSession: join running session: " + session.params.sessid);
                // delete the log buffer
                Common.specialBuffers[logger.logid] = null;
            }

            // return session
            let retParams = {
                session: session,
                isLocalIP: isLocalIP,
                logger: logger,
                loginToken: loginToken
            };
            return retParams;


        } catch (err) {
            // logger.error(`startSessionImp. Error: ${err}. do some cleanups and throw error.`);
            console.error(err);
            // do some cleanups incase of error before throwing the error
            if (buildStatus.userConnectedDeviceUpdated) {
                try {
                    logger.info("startSessionImp. clean user connected device");
                    await User.updateUserConnectedDevicePromise(email, deviceID, null, null, null, false);
                } catch (err) {
                    logger.error(`cleanUserSessionBuild: failed deleteing platform and gw of user: ${err}`, err);
                }
            }
            if (buildStatus.platformReferenceIncresed) {
                try {
                    logger.info("startSessionImp. decrease platform reference");
                    await session.platform.increaseReferencePromise(-1);
                } catch (err) {
                    logger.error(`cleanUserSessionBuild: failed decrease platform reference: ${err}`, err);
                }
            }
            if (buildStatus.userAttached) {
                try {
                    logger.info("startSessionImp. detach user after error");
                    await detachUser(session);
                } catch (err) {
                    logger.error(`cleanUserSessionBuild: failed detach user: ${err}`, err);
                }
            }
            if (buildStatus.gatewayReferenceIncresed) {
                try {
                    logger.info("startSessionImp. clean gateway score");
                    await gatewayModule.updateGWSessionScorePromise(session.params.gatewayIndex, 1, session.params.sessid, logger);
                } catch (err) {
                    logger.error(`cleanUserSessionBuild: failed decrease gateway reference: ${err}`, err);
                }
            }
            if (buildStatus.addToErrorsPlatforms) {
                try {
                    logger.info("startSessionImp. add platform to error platforms");
                    await session.platform.addToErrorPlatformsPromise();
                } catch (err) {
                    logger.error(`cleanUserSessionBuild: failed add platform to error platforms: ${err}`, err);
                }
            }
            if (buildStatus.sesionObjectCreated && session) {
                try {
                    logger.info("startSessionImp. delete session object");
                    await session.delPromise();
                } catch (err) {
                    logger.error(`cleanUserSessionBuild: failed delete session: ${err}`, err);
                }
            }
            throw err;
        } finally {
            try {
                await userDeviceLock.releasePromise();
            } catch (err) {
                logger.error(`startSessionImp. Error release userDeviceLock: ${err}`, err);
            }
            if (buildStatus.revivePlatform) {
                try {
                    logger.info(`startSessionImp. Revive platform: ${session.params.platid}`);
                    await session.platform.addToErrorPlatformsPromise(false, false, true)
                } catch (err) {
                    logger.error(`startSessionImp. Error revive platform: ${err}`, err);
                }
            }
        }



    } catch (err) {
        logger.error(`startSessionImp. Error: ${err}`);
        console.error(err);
        if (session && login) {
            await report(session, null, login, oldSession, logger, clientIP);
        }
        let retParams = {
            err: err,
            resObj: resObj,
            isLocalIP: isLocalIP,
            logger: logger,
            loginToken: loginToken
        };
        throw retParams;
    }
}


/**
 * Close session and release all resources
 * @param {*} sessionID
 * @param {*} closeSessionMsg
 */
async function endSession(sessionID,closeSessionMsg,doNotRemoveLoginToken) {
    var sessLogger = new ThreadedLogger(Common.getLogger(__filename));
    var session;
    var endSessErr = null;
    let pluginSession = false;
    try {
        if (sessionID == null || sessionID.length < 1) {
            throw new Error("Invalid session id");
        }
        const tempSession = await sessionModule.loadSession(sessionID);
        if (!tempSession) {
            throw new Error("Session not found");
        }
        var addToErrorsPlatforms = false;

        const deviceid = tempSession.params.deviceid;
        const email = tempSession.params.email;
        const sessid = tempSession.params.sessid;
        sessLogger.user(email);
        sessLogger.device(deviceid);
        sessLogger.info(`Closing session. user: ${email}, sessid: ${sessid}`,{ mtype:"important"});

        let sessLock = new Lock({
            key: "lock_" + email + "_" + deviceid,
            logger: sessLogger,
            numberOfRetries: 1,
            waitInterval: 500,
            lockTimeout: 1000 * 60 * 30
        });
        let ret = await sessLock.acquirePromise();
        if (ret !== 1) {
            throw new Error(`Cannot acquire lock for user ${email} and device ${deviceid}`);
        }
        try {
             // re-load session after lock has been created
            session = await sessionModule.loadSession(sessionID);
            if (!session) {
                throw new Error("Session not found after lock");
            }
            session.logger = sessLogger;
            const sessionType = session.params.sessionType;

            // remove audio configuration
            if (sessionType == SESSION_TYPE_MOBILE) {
                try {
                    await Common.getMobile().audioStreamManager.closeAudioSession(session);
                } catch (err) {
                    sessLogger.error(`endSession. Error closing audio session: ${err}`, err);
                }
            }


            if (session.params.pluginName) {
                pluginSession = true;
            }
            let platform;
            if (!pluginSession) {
                // load nfs object
                const nfs = await getNFSObject(email, sessLogger);
                session.nfs = nfs;

                // load platform
                platform = await PlatformModule.getPlatform(session.params.platid);
                if (!platform) {
                    throw new Error("Platform not found");
                }
                session.setPlatform(platform);
            }

            //get real device ID (to support when withService set)
            // this is not more needed as we are using deviceid from session
            const realDeviceID = deviceid;

            // Remove login token from user redis
            if (!doNotRemoveLoginToken) {
                await Common.redisClient.del('login_' + session.params.loginToken);
            }

            // Close session on platform
            //sessLogger.logTime("Closing session on platform");
            var platLock;
            if (Common.platformType != "docker" && !pluginSession) {
                // lock platform
                platLock = new Lock({
                    key: "lock_platform_" + platform.params.platid,
                    logger: sessLogger,
                    numOfRetries: 60, // wait for 30 seconds max
                    waitInterval: 500,
                    lockTimeout: 1000 * 60 * 10 // 10 minutes max lock
                });
                let ret = await platLock.acquirePromise();
                if (ret !== 1) {
                    throw new Error(`Cannot acquire lock on platform ${platform.params.platid}`);
                }
            } else if (pluginSession) {
                // close session on the plugin
                const plugin = await Plugin.getPluginById(session.params.pluginName);
                if (!plugin) {
                    logger.info(`endSession: Plugin ${session.params.pluginName} not found`)
                } else {
                    try {
                        await plugin.callFunc('stopSession', session);
                        logger.info(`Plugin ${session.params.pluginName} stopSession success`);
                    } catch (err) {
                        logger.info(`Plugin ${session.params.pluginName} stopSession failed. ${err}`);
                    }
                }
            }
            try {
                // call endSessionLocked
                let UNum = session.params.localid ? session.params.localid : 0;
                // mark delete flag
                session.params.deleteFlag = 1;
                // update end time
                var now = new Date();
                session.params.endTime = now.toFormat("YYYY-MM-DD HH24:MI:SS");
                // update total session time
                var endTS = now.getTime();
                var msec = endTS - session.params.startTS;
                var hh = Math.floor(msec / 1000 / 60 / 60);
                msec -= hh * 1000 * 60 * 60;
                var mm = Math.floor(msec / 1000 / 60);
                msec -= mm * 1000 * 60;
                var ss = Math.floor(msec / 1000);
                msec -= ss * 1000;
                session.params.totalSessionTime = (hh > 0 ? hh + ' hours, ' : '') + (mm ? mm + ' minutes, ' : '') + (ss ? ss + ' seconds' : '');
                await session.savePromise();

                // detach from platform
                if (platform) {
                    if (platform.params['connection_error']) {
                        sessLogger.info("Skip detachUser as platform has a connection erorr");
                    } else {
                        try {
                            await detachUser(session);
                        } catch (err) {
                            sessLogger.error(`endSession: failed to detach user from platform: ${err}`, err);
                            addToErrorsPlatforms = err.res && err.res.addToErrorsPlatforms || false;
                        }
                    }
                    // remove nubo GL server
                    if (Common.isEnterpriseEdition() && Common.glManagers && session.params.nuboglManager) {
                        try {
                            Common.getEnterprise().nuboGL.stopGLServer(session.params.nuboglManager , session.params.platid,session.params.localid);
                            sessLogger.info("Stopped GL Server");
                        } catch (err) {
                            sessLogger.error(`endSession: failed to stop GL server: ${err}`, err);
                        }
                    }
                    // delete platform reference
                    await session.deletePlatformReferencePromise();
                    // decrese platform sessions
                    await session.platform.increaseReferencePromise(-1);
                }
                // update onlinestatus in Activations
                await Common.db.Activation.update({
                    onlinestatus: 0
                }, {
                    where: {
                        activationkey: session.params.activation
                    }
                });
                // remove users media streams
                if (sessionType == SESSION_TYPE_MOBILE) {
                    await removeSessionStreams(session);
                }
                //decrease gateway's session score
                if (!session.params.gatewayIndex || pluginSession) {
                    if (!pluginSession)
                        sessLogger.info(`Session does not have gateway associated`);
                } else {
                    let gwLock = new Lock({
                        key: 'lock_gateway_' + session.params.gatewayIndex,
                        logger: sessLogger,
                        numberOfRetries: 30,
                        waitInterval: 500,
                        lockTimeout: 1000 * 60 // 1 minute
                    });
                    let ret = await gwLock.acquirePromise();
                    if (ret !== 1) {
                        throw new Error(`Cannot acquire lock for gateway ${session.params.gatewayIndex}`);
                    }
                    try {
                        await gatewayModule.updateGWSessionScorePromise(session.params.gatewayIndex, -1, session.params.sessid, sessLogger);
                    } finally {
                        try {
                            await gwLock.releasePromise();
                        } catch (err) {
                            sessLogger.error(`endSession. Error release gwLock: ${err}`, err);
                        }
                    }
                }
            } catch (err) {
                sessLogger.error(`endSession: Error during platform lock: ${err}`, err);
            } finally {
                try {
                    sessLogger.info("endSession. delete session object");
                    await session.delPromise();
                } catch (err) {
                    sessLogger.error(`endSession: failed delete session: ${err}`, err);
                }
                if (addToErrorsPlatforms) {
                    try {
                        await platform.addToErrorPlatformsPromise(false,true);
                    } catch (err) {
                        logger.error(`endSession: failed to add platform to errors platforms: ${err}`, err);
                    }
                }
                if (platLock) {
                    try {
                        await platLock.releasePromise();
                    } catch (err) {
                        sessLogger.error(`endSession. Error release platLock: ${err}`, err);
                    }
                }
            }
            // remove platform/gateway assosiation to user device
            await User.updateUserConnectedDevicePromise(email, realDeviceID, null, null,  null, false);

            // delete all platform notification from physical device
            require("./platformUserNotification.js").removeAllSessionNotifications(session,closeSessionMsg,sessLogger);

            // remove data center details in case it is last connected device
            let devices = await User.getUserConnectedDevicesPromise(email, sessLogger);
            if (devices.length == 0) {
                await Common.db.User.update({
                    dcname: null,
                    dcurl: null
                }, {
                    where: {
                        email: email
                    }
                });
            }

            // resize image
            if (sessionType == SESSION_TYPE_MOBILE && Common.platformType == "docker" && session.params.tempUserDataFlag !== "1") {
                try {
                    await require('./userUtils.js').resizeUserData(session.params.email,realDeviceID,session.params["inc_storage"]);
                } catch (err) {
                    sessLogger.error(`endSession: failed to resize user data: ${err}`, err);
                }
            }
        } finally {
            try {
                await sessLock.releasePromise();
            } catch (err) {
                sessLogger.error(`endSession. Error release sessLock: ${err}`, err);
            }
        }
        // publish to platform channel
        if (!pluginSession)
            Common.redisClient.publish("platformChannel", "refresh");

        //updateUserInDbOnLogout(session);
        if (session && !pluginSession) {
            try {
                const size = await require('./userUtils.js').getUserDataSizePromise(session.params.email);
                sessLogger.info(`endSession: user data size: ${size}`);
                var delta = {
                    storageLast: size
                };
                await Common.db.User.update(
                    delta, {
                        where: {
                            email: session.params.email
                        }
                    }
                );
            } catch (err) {
                sessLogger.error(`endSession: failed to get/update user data size: ${err}`, err);
            }
        }

    } catch (err) {
        sessLogger.error(`endSession. Error: ${err}`);
        console.error(err);
        endSessErr = err;
    }

    if (endSessErr) {
        var errMsg = "endSession: " + endSessErr;
        sessLogger.error(errMsg,{ mtype:"important"});
    } else {
        sessLogger.logTime("Session closed");
        sessLogger.info(`Session closed`,{ mtype:"important"});
    }

    if (session != null) {
        try {
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
            // put session details in session history
            let totalActiveSeconds = parseInt(session.params["totalActiveSeconds"]);
            if (session.params["suspend"] == 0 && session.params["suspendtime"]) {
                // calculate the number of active session if session is now connected
                let activetime =  parseInt( (new Date().getTime() - new Date(session.params["suspendtime"]).getTime()) / 1000 );
                if (activetime > 0) {
                    totalActiveSeconds = totalActiveSeconds + activetime;
                }
            }
            logger.info(`Session totalActiveSeconds: ${totalActiveSeconds}`);
            await Common.db.SessionHistory.upsert({
                session_id : session.params.sessid,
                email : session.params.email,
                device_id : session.params.deviceid,
                maindomain : session.params.maindomain,
                devicename : session.params.devicename,
                start_time: new Date(session.params.startTime),
                end_time : new Date(),
                platform : session.params.platid,
                gateway : session.params.gatewayIndex,
                active_seconds: totalActiveSeconds
            });

            if (session.params.appUsageFileName) {
                // upload app usage file to database
                await updateAppUsage(session);
            }

            if (endSessErr) {
                var subj = (Common.dcName != "" ? Common.dcName + " - " : "") + "Session deleted unsuccessfully";
                var text = 'Session delete error: ' + errMsg + '\nSession details: ' + JSON.stringify(session.params, null, 2);
                await sendEmailToAdmin(subj, text);

            }
        } catch (err) {
            sessLogger.error(`endSession. Error in updating SessionHistory: ${err}`);
        }
    }
    Common.specialBuffers[sessLogger.logid] = null;
    // throw error if exists
    if (endSessErr) {
        throw endSessErr;
    }
}



/**
 * App usage ignore set, these apps are system apps and should be ignored
 */
const appUsageIgnoreSet = new Set([
    'com.android.systemui',
    'com.android.settings',
    'com.android.vending',
    'com.android.launcher3',
    'com.nubo.blackscreenapp',
    'android'
]);

/**
 * Calculate app usage from app usage file,
 * store in database and remove file
 * @param {*} session
 */
async function updateAppUsage(session) {
    try {
        const fsp = require('fs').promises;
        const appUsageFile = session.params.appUsageFileName;
        const appUsageFilePath = Common.path.join(session.params.recording_path, appUsageFile);
        const appUsageFileContent = await fsp.readFile(appUsageFilePath, 'utf8');
        // parse csv file, seeprate lines and columns
        const lines = appUsageFileContent.split('\n');
        let appsMap = {};
        for (const line of lines) {
            try {
                const cols = line.split(',');
                if (cols.length !== 3) continue;
                const timeStr = cols[0];
                const app = cols[1];
                // ignore system apps
                if (appUsageIgnoreSet.has(app)) continue;
                const action = cols[2];
                const time = new Date(timeStr);
                const day = time.toFormat("YYYY-MM-DD");
                const appKey = `${day}_${app}`;
                let appData = appsMap[appKey];
                if (!appData) {
                    appData = {
                        day : day,
                        app: app,
                        startAppTime: undefined,
                        count: 0,
                        seconds: 0,
                        startCnt: 0
                    };
                }
                if (action === 'create_app') {
                    // count app lunch, only one per day
                    appData.count = 1;
                } else if (action === 'start_app') {
                    // mark start of app time
                    if (!appData.startAppTime) {
                        appData.startAppTime = time;
                    }
                    appData.startCnt++;
                } else if (action === 'stop_app') {
                    if (appData.startAppTime) {
                        // add app usage time
                        appData.startCnt--;
                        if (appData.startCnt === 0) {
                            appData.seconds += parseInt((time.getTime() - appData.startAppTime.getTime()) / 1000);
                            appData.startAppTime = undefined;
                        }
                    } else {
                        // look for start app time in previous lines
                        const prevDay = new Date(time.getTime() - 24 * 60 * 60 * 1000);
                        const prevDayKey = `${day}_${app}`;
                        const prevAppData = appsMap[prevDayKey];
                        if (prevAppData && prevAppData.startAppTime) {
                            // add app usage time
                            prevAppData.startCnt--;
                            if (prevAppData.startCnt === 0) {
                                prevAppData.seconds += parseInt((time.getTime() - prevAppData.startAppTime.getTime()) / 1000);
                                prevAppData.startAppTime = undefined;
                            }
                            appData = prevAppData;
                        }
                    }
                }
                appsMap[appKey] = appData;
            } catch (err) {
                logger.error(`updateAppUsage: Error parsing line: ${line}, Error: ${err}`);
                console.error(err);
            }
        }
        //console.log(`updateAppUsage. appsMap: ${JSON.stringify(appsMap, null, 2)}`);
        // save app usage to database
        for (const appKey in appsMap) {
            const appData = appsMap[appKey];
            const dayDate = new Date(appData.day);
            const appUsage = await Common.db.AppUsage.findOne({
                where: {
                    day : dayDate,
                    email: session.params.email,
                    packagename: appData.app
                }
            });
            if (!appUsage) {
                await Common.db.AppUsage.create({
                    day : dayDate,
                    email: session.params.email,
                    packagename: appData.app,
                    count: appData.count,
                    seconds: appData.seconds
                });
            } else {
                appUsage.count += appData.count;
                appUsage.seconds += appData.seconds;
                await appUsage.save();
            }
        }

        // remove app usage file
        await fsp.unlink(appUsageFilePath);

    } catch (err) {
        logger.error(`updateAppUsage: Error: ${err}`);
    }
}

/**
 * Remove mobile session streams
 * @param {*} session
 * @returns {Promise}
 */
function removeSessionStreams(session) {
    return new Promise((resolve, reject) => {
        Common.getMobile().mediaStream.removeUserStreams(session.params.sessid, function(err) {
            resolve();
        });
    });
}

/**
 * Report session start
 * @param {*} session
 * @param {*} createErr
 * @param {*} login
 * @param {*} oldSession
 * @param {*} logger
 * @param {*} clientIP
 */
async function report(session, createErr, login, oldSession, logger, clientIP) {
    try {
        var email = login.getEmail();
        var deviceID = login.getDeviceID();
        var geoipInfo = null;
        if (Common.isEnterpriseEdition()) {
            var appid = deviceID + "_" + login.getActivationKey();
            Common.getEnterprise().audit(appid, 'Start Session', clientIP, {
                email: email
            }, {
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
        Common.specialBuffers[logger.logid] = null;
        await sendEmailToAdmin(subj, text)
    } catch (err) {
        logger.error(`report. Error: ${err}`, err);
    }

}

/**
 * Start session just by device information
 * @param {*} email
 * @param {*} imei
 * @param {*} userDeviceData
 */
async function startSessionByDevice(email,imei,userDeviceData) {
    try {
        const {user, userObj, orgObj} = await require('./userUtils.js').createOrReturnUserAndDomainPromise(email,logger);
        let userData = user;
        userData.org = orgObj;
        const activationData = await Common.db.Activation.findOne({
            attributes: ['activationkey', 'status', 'email', 'deviceid', 'firstlogin', 'resetpasscode', 'firstname', 'lastname', 'jobtitle', 'devicetype', 'secondAuthRegistred','expirationdate'],
            where: {
                email: email,
                deviceid: imei,
                status: 1
            },
        });
        if (!activationData) {
            throw new Error('Activation not found');
        }
        // create dummy login object
        let login = await getLogin();
        login.setAuthenticationRequired(false);
        login.setPasscodeActivationRequired(false);
        login.setValidPassword(true);
        login.loginParams.clientauthtype = Common.CLIENT_AUTH_TYPE_NONE;
        login.setValidLogin(true);

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
        login.loginParams.recording = userData.recording || userData.org.recordingall || 0 ;
        login.loginParams.docker_image = userData.docker_image;

        await login.savePromise();
        var startSessionParams = {
            clientIP: "0.0.0.0",
            loginToken: login.getLoginToken()
        }
        const respParams = await startSessionImp(startSessionParams);
        logger.info("startSessionByDevice. Started");
    } catch (err) {
        logger.error(`startSessionByDevice. Error: ${err}`, err);
        throw err;
    }
}

/**
 * Close session of user and device
 * @param {*} email
 * @param {*} deviceID
 * @returns
 */
async function closeSessionOfUserDevice(email, deviceID) {
    try {
        const session = await sessionModule.getSessionOfUserDevicePromise(email, deviceID);
        if (!session) {
            logger.info(`closeSessionOfUserDevice. Session not found for user ${email} and device ${deviceID}`);
            return;
        }
        await endSession(session.params.sessid);
    } catch (err) {
        logger.error(`closeSessionOfUserDevice. Error: ${err}`, err);
    }
}

/**
 * Close other sessions of user
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function closeOtherSessions(req, res, next) {
    closeOtherSessionsImp(req, res, next, null);
}

/**
 * Close other sessions of user
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @param {*} login
 */
async function closeOtherSessionsImp(req, res, next,login) {
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
    try {
        if (login) {
            loginData = login;
            loginToken = loginData.loginToken;
        } else {
            try {
                loginData = await getLogin(loginToken);
            } catch (err) {
                logger.info("logoutUser getLogin error: " + err.message);
            }
        }
        if (!loginData ) {
            var msg = "login isn\'t valid for user " + (loginData ? loginData.getUserName() : "");
            resObj = {
                status: Common.STATUS_EXPIRED_LOGIN_TOKEN,
                message: msg,
                loginToken: 'notValid'
            };
            throw new Error(msg);
        }
        var email = loginData.getEmail();
        var deviceID = loginData.getDeviceID();
        logger.user(email);
        logger.info("Logout User", {
            mtype: "important"
        });
        const sessions = await sessionModule.getSessionsOfUserPromise(email);
        for (const session of sessions) {
            await endSession(session.params.sessid,"sessionClosedByUser");
        }
        resObj = {
            status: Common.STATUS_OK,
            message: "Session killed"
        };
        logger.info("closeOtherSessions: ", JSON.stringify(resObj,null,2));
        res.send(resObj);

    } catch (err) {
        logger.error("closeOtherSessions: Error: " + err, err);
        try {
            if (resObj) {
                res.send(resObj);
            } else {
                res.send({
                    status: Common.STATUS_ERROR,
                    message: err.message
                });
            }
        } catch (err) {
            logger.error("closeOtherSessions: send Error: " + err, err);
        }
    }
}

/**
 * Logout session of current user.
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function logoutUser(req, res, next) {
    logoutUserImp(req, res, null);
}

/**
 * Logout session of current user.
 * Support using pre-validated login object
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @param {*} login
 * @returns
 */
async function logoutUserImp(req, res, login) {
    logger.info("logoutUser: start");
    res.contentType = 'json';


    //read and validate params
    var clientIP = req.headers["x-client-ip"];
    var isLocalIP = clientIP.indexOf(Common.internal_network) == 0 ? true : false;
    var loginToken = req.params.loginToken;
    var deleteCacheDeviceDataStr =  req.params.deleteCacheDeviceData;
    var deleteCacheDeviceData;
    if (deleteCacheDeviceDataStr != undefined && deleteCacheDeviceDataStr == "N" || deleteCacheDeviceDataStr == "n") {
        deleteCacheDeviceData = false;
    } else {
        deleteCacheDeviceData = true;
    }
    let doNotRemoveLoginToken = req.params.doNotRemoveLoginToken;
    var loginData;
    var session;
    var resObj;
    try {
        if (login) {
            loginData = login;
            loginToken = loginData.loginToken;
        } else {
            try {
                loginData = await getLogin(loginToken);
            } catch (err) {
                logger.info("logoutUser getLogin error: " + err.message);
            }
        }
        if (!loginData ) {
            var msg = "login isn\'t valid for user " + (loginData ? loginData.getUserName() : "");
            resObj = {
                status: Common.STATUS_EXPIRED_LOGIN_TOKEN,
                message: msg,
                loginToken: 'notValid'
            };
            throw new Error(msg);
        }
        var email = loginData.getEmail();
        var deviceID = loginData.getDeviceID();

        let session = await sessionModule.getSessionOfUserDevicePromise(email, deviceID);
        if (!session) {
            logger.info(`logoutUser. Session not found. email: ${email}, deviceID: ${deviceID}`);
            resObj = {
                status: Common.STATUS_OK,
                message: "Session not found"
            };
            res.send(resObj);
            return;
        }
        // delete session_cache_params, so session will not start without user re-configure itself
        if (deleteCacheDeviceData) {
            await Common.db.UserDevices.update({
                session_cache_params: null
            }, {
                where: {
                    email: email,
                    imei: deviceID
                }
            });
            logger.info("logoutUser. deleted session_cache_params..");
        }
        // end session
        await endSession(session.params.sessid,"logoutUser",doNotRemoveLoginToken);
        resObj = {
            status: Common.STATUS_OK,
            message: "Session killed"
        };
        res.send(resObj);

    } catch (err) {
        logger.error(`logoutUser. Error: ${err}`, err);
        if (resObj) {
            res.send(resObj);
        } else {
            res.send({
                status: Common.STATUS_ERROR,
                message: "Internal error"
            });
        }
    }
}


/**
 * Send email to admin
 * @param {*} subj
 * @param {*} text
 * @returns
 */
function sendEmailToAdmin(subj, text) {
    return new Promise((resolve, reject) => {
        if (!Common.adminEmail && Common.disableSessionEmails) {
            resolve();
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
        Common.mailer.send(mailOptions, function (success, message) {
            if (!success) {
                var msg = "Email send error: " + message;
                // logger.info(msg);
                reject(new Error(msg));
            } else {
                resolve(null);
            }
        }); //Common.mailer.send
    });
}


