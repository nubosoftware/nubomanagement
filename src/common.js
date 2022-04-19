"use strict";

var crypto = require('crypto');
var dataEncryptor = require('./dataEncryptor.js');
var async = require('async');
var _ = require('underscore');
var url = require('url');
const { URL } = require('url');
var DEBUG = true;
var globals = require('./globals.js');
var config = require('./config.js');
var SysConf = require('./sysConf.js');
const {promisify} = require('util');
const mkdirp = require('mkdirp');
const os = require('os');
const enterpriseLoader = require('./enterpriseLoader');

var Common = {
    STATUS_OK : 1,
    STATUS_ERROR : 0,
    STATUS_EXPIRED_LOGIN_TOKEN : 2,
    STATUS_INVALID_PLAYER_VERSION : 3,
    STATUS_PASSWORD_LOCK : 4,
    STATUS_CHANGE_URL : 301,
    STATUS_DISABLE_USER_DEVICE : 5,
    STATUS_DISABLE_USER : 6,
    STATUS_EXPIRED_PASSCODE : 7,
    STATUS_DATA_CENTER_UNAVALIBLE : 8,
    STATUS_INVALID_RESOURCE : 10,
    STATUS_OTP_MAX_TRIES: 30,
    STATUS_OTP_TIMEOUT: 31,
    STATUS_PASSWORD_NOT_MATCH: 32,
    STATUS_PASSWORD_NOT_INCLUDE_NUMBER: 33,
    STATUS_PASSWORD_NOT_INCLUDE_LETTER: 34,
    STATUS_PASSWORD_NOT_INCLUDE_SPECIAL_CHAR: 35,
    STATUS_INVALID_CREDENTIALS : 36,
    STATUS_RESET_PASSCODE_PENDING : 100,
    STATUS_RESET_BIOMETRIC_PENDING : 101,
    STATUS_RESET_OTP_PENDING : 102,
    STATUS_ADMIN_ACTIVATION_PENDING : 200,
    STATUS_ADMIN_ACTIVATION_VALID : 201,
    STATUS_ADMIN_RESET_PENDING : 202,
    STATUS_NOTIF_EMPTY : 50,
    ACTION_RESET_PASSCODE: 1,
    ACTION_CANCEL_RESET_PASSCODE: 2,
    ACTION_WIPE_RESET_PASSCODE: 3,
    ACTION_RESET_BIOMETRIC: 4,
    ACTION_RESET_OTP: 5,

    CLIENT_AUTH_TYPE_NONE: 0,
    CLIENT_AUTH_TYPE_PASSWORD: 1,
    CLIENT_AUTH_TYPE_BIOMETRIC_OTP: 2,
    CLIENT_AUTH_TYPE_PASSWORD_AND_BIOMETRIC_OTP: 3,
    CLIENT_AUTH_TYPE_PASSWORD_OR_BIOMETRIC_OTP: 4,

    SECOND_AUTH_METHOD_BIOMETRIC: 1,
    SECOND_AUTH_METHOD_OTP: 2,
    SECOND_AUTH_METHOD_BIOMETRIC_OR_OTP: 3,

    EDITION_COMMUNITY: "community",
    EDITION_ENTERPRISE: "enterprise",

    minUXIPVersion : 1,
    util : require('util'),
    fs : require('fs'),
    path : require('path'),
    db : '',
    allowedOrigns : [],
    serverurl : "https://lab.nubosoftware.com/",
    internalurl : "https://lab.nubosoftware.com/",
    restify : require('restify'),
    crypto : require('crypto'),
    dbValidator : true,
    nodemailer : require("nodemailer"),
    redis: require("redis"),
    redisValidator: true,
    platfromPortStart: 5560,
    platformIPPrefix: "192.168.122.",
    platformMacPrefix: "52:54:00:12:00:",
    cassandraHost: 'localhost:9160',
    nfshomefolder : '/srv/nfs4/homes/',
    nfslocalcachefolder : '/home/nubodev/Android/nubo-production/nubomanagement/homesbak/homes/',
    nfsId: 1,
    settingsfolder : 'com.nubo.nubosettings/startup/',
    browserfolder : 'com.android.browser/',
    internal_network : 'none',
    gwplatformport : 8890,
    gwcontrolport : 8891,
    hostline : 'user@host',
    adSync : 'AD_Sync',
    imagesPath: "/opt/Android-Nougat",
    exchange_platformpath : "/home/sharon/storage/Android/ExchangePlatformKK/nuboplatform", //sharon
    sessionTimeout : 600, // 10 minutes session timeout
    sshPrivateKey : '/home/nubodev/.ssh/id_rsa',
    platformType : 'emulator',
    defaultSignature : '- Sent from my Nubo work environment',
    startPlatformNum : 2,
    sendCameraDetails : false,
    iosPushUseSandbox : true,
    iosPushCertFile : "cert.pem",
    iosPushKeyFile : "key.pem",
    demoActivationKey : "AAABBCCDD",
    dcName : "nubo",
    singleDataCenter: true, // this mean that we do not use another datacenter with the same database
    dcInternalURL : "https://lab.nubosoftware.com/",
    minPlayerVersion : "0.0",
    encAlgorithmOld : 'aes-128-ecb',
    encAlgorithm : 'aes-256-cbc',
    encKey : "", // this should be the same key as in JDBCAuthProvider.AES_KEY in openfire
    externalMountsSrc : '',
    listenAddresses : ["https://", "http://"],
    activationTimeoutPeriod : 48,
    nuboMask : '24',
    sendPlatformStatusToAdmin: true,
    sendSessionStatusToAdmin: false,
    platformParams : {
        poolStrategy: 'calculated',
        concurrency: 2,
        concurrencyDelay: 10000,
        platformPoolSize: 0,
        explatformPoolSize: 0,
        upperCapacityLevel: 0.5,
        bottomCapacityLevel: 0,
        maxCapacity: 60,
        usersPerPlatform: 20,
        choosePool: 10,
        maxFailed: 0,
        maxFails: 5,
        fixedPool: true,
        restartPlatformSessionsThreshold: 0,
        cleanPlatformsMode: false
    },
    logLevel: "info",
    hideControlPanel : false,
    //TODO change the name to something more appropriate!!!
    withService : false,
	controlPanelApp : "com.nubo.controlpanel",
    isHandlingMediaStreams : false,
    streams : "media/streams/",
    photoCompression : 70,
    activateBySMS : false,
    smsHandler : false,
    DEFAULT_PASSWORD : "",
    defaultLocale: "en",
    registerOrgPassword: "",
    encryptedParameters: {
        "dbPassword": 1,
        "mailOptions": {
            "auth": {
                "pass": 1
            }
        },
        "NotificationGateway": {
            "authKey": 1
        },
        "redisConf" : {
            "password" : 1
        },
        "vmwareParams": {
            "password" : 1
        },
        "registerOrgPassword": 1,
        "DEFAULT_PASSWORD" : 1,
        "allowedFE" : '*'
    },
    encryptConf: false,
    DEBUG : DEBUG,
    authValidatorPermittedMode: false,
    ADSyncInterval : '0 0 * * *',
    ADSyncTimeZone : 'Etc/UTC',
    publicServerCredentials: {
        key: "",
        cert: ""
    },
    URLLauncher : {
        projectPath : "/opt/URLLauncher/",
        androidHomePath : "/opt/android_tools"
    },
    globals: {},
    allowedFE : {},
    defaultTimeZone: "Etc/UTC",
    defaultAppName: "Nubo",

    otpTimeout : 90,
    otpMaxTries: 5,
    webClientSubnets: [],
    restrictWebClientAccess: false,
    savedPasscodeHistory: 0,
    apkDownloadURL: "http://gw.nubosoftware.com:4000/downloadAPK?packageid=",

    platformKey: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAzvlbq4mQcmE4DbdlGE3cniWijiYG6IX1MJ8dyFzAdsxkj94r\nap59BLFc6lnQsxcuqvtOGxt18bNQUnUDdrwbJbn/Out4LE7QhFm29eYHxcS1BVAr\nPGB+KwDUEACL1DRHvsVkBVSXynH/Y5v4Mb2W9Ot5TZnMns2IZBlNredCEagnyqPb\noiOTjSvRZXORVHg+nITydksgTEz+Wo57wX9Z/HKzLKcOZ7amRe28l+NslwgUQM2V\nH8oh+C4h15K/jVseFEeCDq8JBVf/LxXh1wq0vwj1lbcHiM94wnuVfjK0Vp3nUsAS\ncQrdEdKNiZwhxsJbqhKibKtVIaO34sNSHL/iTQIDAQABAoIBAHrlMXtfiXeBJolu\ndgbCZNc6vZTuG3gB4p7mPAb2nAluP9/1KY57YPxiXCuC/Rr6DunTooMSASxtLqpn\ndJESDISQNm7D1m1otwN/SdYkqkTSEjJ/ccy99uyN511BFcYA7QDnsAZCPockvWJm\nAC94xaPUFgjv48H/hJb7N1alVGOqheCHiK2MKBmUilgByK3V1/qTpVnLae772Czf\n1UYnxtajHv02INUqvxcAQuoyVW4r+cS2EaeidUuBwoW7LDDsOEC+2DYVXAVOSVr+\nKVBF81aoT8/qGr/CNu9mwpTGFyE51GbiRl5cVIrn8ZnR5a5hK9XQg93fzD6x91Rh\npjv6HYECgYEA6gc8j+MIWmLzlT3ZlRH2QCRg+u/SwNGRyHuO/I3u1mnQvK5vkJUs\nngM+IVuggbOEoFaj+UOTx+BLld+QVdOZkqoFwnZpjlFawiwFSetf5cWSzNVgYfNO\nDR5el1QDRSTs2yqenCi43Dq880DMadi7pa2uKzGCrLxJfQv/nMNtWj0CgYEA4mfi\nwVoNrHaekoPb7MNaXZ6Z/NTRAHSTPozUxkAfa87hPQbVfwma29ErdLHkUdB3OunB\nd4+3KwsW1VY3lPJKNsttx4JkzlNz4sIY/7cLDlyn+CWmS9bque3VzJrHxO5YvRp+\n0UKvN1sFkuefUPxjZu5Me3O1889Rvkb52Kb1+VECgYAhlMA/9VfxgFlrhOB/33/y\nXEX+PAOF34yHtBMkcklfQvfM20ru+Djaw6RarQcvFU9moogM8IF4INs3uki/yAk1\nXmhNKyiiX1IioqZvoPK1yc/yzHt0ErGUeFMia8+8UDwchtUTm1RLZbJPRXEPjyX9\n9BoV4JjbqHjzFJGtMO20EQKBgFSu6MjLZyvn3l4NBfikBSvZQ92muFoEQIL36CoT\nF+2aHvNVmAuBSzQHI8rtMupLIB2gC2YuEiP+bNb0/asviQS/yFsEcbIe0syxLuqO\ny4req1EMvAvH4loTFJIIHsqRIA3zWBXrbGA3InmVOyjujjuUzHSsjhUYqYmTQKaB\npKVRAoGBAJQOMQQbBt6qphuWaXdoBxW/litXNPmGxBhoJhgKz+ZDb9bZMZ+vE3BT\nO6Q/WUODN+M8bIspSQMfizraI7hIyqxhmnGyXo1i4o9aG7piGpgFocJ9VlBxohHf\nlW3YiLza8c3fnjImNSjcuiqnRjy4IlzJba7MP/vGs9JOo3g5L5la\n-----END RSA PRIVATE KEY-----",
    javaCommand: "java",
    telephonyProvider: {
        provider: "twilio",
        apiScript: "twilioAPI"
    },
    emailSender: {
        senderEmail: "support@nubosoftware.com",
        senderName: "Nubo Support"
    },
    guacAddr: "nubo-guac",
    rootDir: process.cwd(),
    reloadSettings: parse_configs
};




try {
    Common.fs.mkdirSync("./log");
    process.setMaxListeners(0);
} catch(err) {}

const scriptName = (process.argv[1] ? process.argv[1] : "script");
var loggerName = Common.path.basename(scriptName, '.js') + ".log";
var exceptionLoggerName = Common.path.basename(scriptName, '.js') + "_exceptions.log";
// console.log("log file: " + loggerName);

const  { createLogger , format, transports  } = require('winston');
const { countBy } = require('underscore');
const validate = require('validate.js');
const { combine, timestamp, label, printf } = format;

const myFormat = printf(info => {
    return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
});


function createIntLogger() {

    let scriptBaseName = Common.path.basename(scriptName, '.js');
    let syslogAppName;
    if (scriptBaseName == "multithreadserver" || scriptBaseName == "restserver") {
        syslogAppName = "nubomanagement";
    } else {
        syslogAppName = `nubomanagement-${scriptBaseName}`;
    }
    console.log(`syslogAppName: ${syslogAppName}`);


    let logTransports = [
        new (transports.Console)({
            name: 'console',
            json: true,
            handleExceptions: true,
            timestamp: true,
            colorize: true
        }),
        new transports.File({
            name: 'file',
            filename: Common.rootDir + '/log/' + loggerName,
            handleExceptions: true,
            maxsize: 100 * 1024 * 1024, //100MB
            maxFiles: 4,
        })
    ];
    if (scriptBaseName == "nuboConfig") {
        logTransports.shift();
    }



    let syslogParams = {
        app_name : syslogAppName,
        handleExceptions : true,
        localhost: os.hostname(),
        type: "RFC5424",
        //protocol: "unix",
        //path: "/dev/log",
        protocol: 'udp',
        host: 'nubo-rsyslog',
        port: 5514,
        format: format.json()
    };
    if (Common.syslogParams) {
        _.extend(syslogParams,Common.syslogParams);
    } else {
        syslogParams.disable = true;
    }
    if (!syslogParams.disable) {
        let Syslog = require('@nubosoftware/winston-syslog').Syslog;
        let syslogTransport = new Syslog(syslogParams);
        logTransports.push(syslogTransport);
    }

    Common.intLogger = createLogger({
        format: combine(
            //label({ label:  Common.path.basename(scriptName, '.js') }),
            timestamp(),
            myFormat
        ),
        transports: logTransports,
        exceptionHandlers: [
            new (transports.Console)({
                json: false,
                timestamp: true
            }),
            new transports.File({
                filename: Common.rootDir + '/log/' + exceptionLoggerName,
                json: false
            })
        ],
        exitOnError: false
    });

}

// temporary create logger before loading settings
createIntLogger();



Common.isEnterpriseEdition = function () {
    return Common.enterpriseModule;
}
Common.getEnterprise = function() {
    return enterpriseLoader.get();
}

Common.isMobile = function () {
    return Common.mobileModule;
}

Common.getMobile = function() {
    return require('./mobileModuleLoader').get();
}

Common.isDesktop = function () {
    return Common.desktopModule;
}

Common.getDesktop = function() {
    return require('./desktopModuleLoader').get();
}


Common.getEdition = function() {
    if (Common.isEnterpriseEdition()) {
        return Common.EDITION_ENTERPRISE;
    } else {
        return Common.EDITION_COMMUNITY;
    }
}

Common.getDeviceTypes = function() {
    let deviceTypes = [];
    if (Common.isDesktop()) {
        deviceTypes.push("desktop");
    }
    if (Common.isMobile()) {
        deviceTypes.push("mobile");
    }
    return deviceTypes;
}


let cacheLoggers = {};
Common.getLogger = (fileName) => {
    let name = Common.path.basename(scriptName, '.js'); //+ ( fileName ? "_"+Common.path.basename(fileName) : "");
    if (cacheLoggers[name]) {
        return cacheLoggers[name];
    }
    let moduleLogger = {
        error: (text, err) => {
            let msg = text;
            if (err) {
                if (err.stack) {
                    msg += " " + err.stack;
                } else {
                    msg += " " + err;
                }
            }
            Common.intLogger.log({
                level: 'error',
                message: msg,
                label: name
            });
        },
        info: (text,err) => {
            let msg = text;
            if (err) {
                if (err.stack) {
                    msg += " " + err.stack;
                } else {
                    msg += " " + err;
                }
            }
            Common.intLogger.log({
                level: 'info',
                message: msg,
                label: name
            });
        },
        warn: (text) => {
            Common.intLogger.log({
                level: 'warn',
                message: text,
                label: name
            });
        },
        debug: (text) => {
            Common.intLogger.log({
                level: 'debug',
                message: text,
                label: name
            });
        },
        log: (...args) => {
            let extra_meta = {label: name};
            let len = args.length;
            if(typeof args[len-1] === 'object' && Object.prototype.toString.call(args[len-2]) !== '[object RegExp]') {
                _.extend(args[len-1], extra_meta);
            } else {
                args.push(extra_meta);
            }
            Common.intLogger.log.apply(Common.intLogger,args);
        }
    };
    cacheLoggers[name] = moduleLogger;
    return moduleLogger;
};

Common.logger = Common.getLogger("");

var logger = Common.getLogger(__filename);

Common.specialBuffers = {};

Common.intLogger.on('logging', function(transport, level, msg, meta) {
    if (meta != null && meta.specialBuffer != null && transport.name == "console") {
        if (Common.specialBuffers[meta.specialBuffer] == null)
            Common.specialBuffers[meta.specialBuffer] = "";
        Common.specialBuffers[meta.specialBuffer] += '\n' + new Date() + " [" + level + "] " + msg;
        //console.log("logging. level:"+level+", msg:"+msg+", meta:"+JSON.stringify(meta,null,2)+", transport: "+JSON.stringify(transport,null,2));
    }
});

Common.sshPool = {};

var firstTimeLoad = true;

function load_settings(sysConf,callback) {
    var decryptedSettings;
    var encryptedSettings;
    var settings;
    let settingsFile;

    async.series([
        //read file
        function(callback) {
            // locate settings file and move to right location if needed
            //logger.info(`sysConf.isDocker: ${sysConf.isDocker}`);
            if (sysConf.isDocker) {
                settingsFile = Common.path.join('./conf','Settings.json');
                // move file if needed
                const oldfileLocation = Common.path.join(Common.rootDir,'Settings.json');
                SysConf.fileMoveIfNedded(settingsFile,oldfileLocation).then(() => {
                    callback(null);
                }).catch(err => {
                    logger.error(`Fatal error: cannot find Settings.json: ${err}`,err);
                    callback(err);
                });
            } else {
                settingsFile = Common.path.join(Common.rootDir,'Settings.json');
                callback(null);
            }
        },
        function(callback) {
            Common.settingsFile = settingsFile;

            Common.fs.readFile(settingsFile, function(err, data) {
                if (err) {
                    callback(err);
                    return;
                }

                var rawSettings = data.toString().replace(/[\n|\t]/g, '');
                // logger.debug("load_settings: " + rawSettings);
                try {
                    settings = JSON.parse(rawSettings);

                } catch (err) {
                    callback(err + ", while parsing Settings.json");
                    return;
                }

                Common.encKey = settings.encKey;
                callback(null);
            });
        },
        function(callback){
            if(settings.encKey){
                return callback(null);
            }

            SysConf.getSkey(function(err, savedKey){
                if(err){
                    return callback(err);
                }

                Common.encKey = savedKey;
                callback(null);
            })
        },
        // decrypt fields
        function(callback) {
            try {
                decryptedSettings = dataEncryptor.parseParameters('dec', settings, Common.encryptedParameters, Common.dec);

            } catch (err) {
                callback("decrypting " + err);
                return;
            }
            callback(null);
        },
         // encrypt fields in case some value changed
        function(callback) {
            var newSettingsToFile = null;
            if (settings.encryptConf) {
                try {
                    encryptedSettings = dataEncryptor.parseParameters('enc', settings, Common.encryptedParameters, Common.enc);
                    if (!(_.isEqual(encryptedSettings, settings))) {
                        newSettingsToFile = JSON.stringify(encryptedSettings, null, 4);
                    }
                } catch (err) {
                    callback("encrypting " + err);
                    return;
                }

                if(newSettingsToFile){
                    Common.fs.writeFile(settingsFile, newSettingsToFile, callback);
                }
                else{
                    callback(null);
                }
            } else {
                callback(null);
            }
        },
    ], function(err) {
        if (err) {
            logger.error("load_settings: " + err);
            callback(err);
            return;
        }

        callback(null, decryptedSettings);
    });
}

Common.loadSettings = load_settings;

let initCB = null;

/**
 * Update the Settings.json file with new/changed params from the params object.
 * Parameters that do not exists in the params object will be kept unchanged
 * @param {Object} params
 * @param {Function} cb
 */
Common.updateSettingsJSON = function (params,cb) {
    let sysConf;
    let settings;
    async.series([
        (cb) => {
            // load the sysconf
            SysConf.loadSysConf(function(err, sysConfObj) {
                sysConf = sysConfObj;
                cb(err);
            });
        }, (cb) => {
            // reload the settings from the json file
            load_settings(sysConf,function(err, settingsObj) {
                settings = settingsObj;
                cb(err);
            });
        }, (cb) => {
            // add all params into the settings file
            settings = _.extend(settings,params);

            // write the settings json file
            let settingsToString = JSON.stringify(settings, null, 4);
            Common.fs.writeFile(Common.settingsFile, settingsToString, cb);
        }
    ],(err) => {
        if (err) {
            logger.error(`Error save Settings.json file: ${err}`,err);
        } else {
            logger.info(`Settings.son file saved.`);
        }
        if (cb) {
            cb(err);
        }
    })
}
function parse_configs(parseConfigCB) {

    stopWatchSettings();
    // logger.info('Load settings from file');
    var myFirstTimeLoad = firstTimeLoad;
    firstTimeLoad = false;

    async.waterfall([
        function(callback) {
            SysConf.loadSysConf(function(err, sysConf) {
                if (err) {
                    return callback(err);
                }

                callback(null, sysConf);
            })
        },
        function(sysConf, callback) {
            load_settings(sysConf,function(err, settings) {
                if (err) {
                    logger.error('cannot load settings from file');
                    callback(err);
                } else {
                    if (settings.logLevel && (settings.logLevel !== Common.logLevel)) logger.level = settings.logLevel;
                    // console.log(settings)
                    Common.withService = settings.withService;
                    callback(null, settings, sysConf);
                }
            });
        },
        function(settings, sysConf, callback) {
            if (!myFirstTimeLoad) {
                return callback(null, settings, sysConf);
            }

            var options = {
                sequelizeLogs: settings.sequelizeLogs,
                dbMaxConnections: sysConf.maxConnections,
                dbMaxIdleTime: sysConf.maxIdleTime
            };

            Common.sysConf = sysConf;
            var dbConf = sysConf.dbConf;

            require('./DBModel.js').initSequelize(dbConf.name, dbConf.user, dbConf.password, dbConf.host, dbConf.port, options, function(err, dbObj, sequelizeObj) {
                if(err){
                    logger.error("initSequelize error",err);
                    return callback("cannot connect to db");
                }

                Common.db = dbObj;
                Common.sequelize = sequelizeObj;

                callback(null, settings, sysConf);
            });
        },
        // init modules
        function(settings, sysConf, callback) {
            // load mobile module if enabled
            const mobileModuleLoader = require('./mobileModuleLoader');
            if (mobileModuleLoader.isPresent()) {
                try {
                    mobileModuleLoader.init();
                    Common.mobileModule = true;
                } catch (err) {
                    logger.error(`Unbale to init mobile module: ${err}`,err);
                }
            } else if (require('./desktopModuleLoader').isPresent()) {
                // load desktop module if enabled
                try {
                    require('./desktopModuleLoader').init();
                    Common.desktopModule = true;
                } catch (err) {
                    logger.error(`Unbale to init desktop module: ${err}`,err);
                }
            }
            if (enterpriseLoader.isPresent()) {
                    enterpriseLoader.init(function(err) {
                        if (err) {
                            logger.error(`Unbale to init eneterprise module: ${err}`,err);
                        } else {
                            Common.enterpriseModule = true;
                        }
                        callback(null, settings, sysConf);
                    });
            } else {
                callback(null, settings, sysConf);
            }
        },
        //load config from db
        function(settings, sysConf, callback) {
            config.loadConfig(settings, Common.db, Common.dec, logger, function(err, newSettings) {
                if (err) {
                    callback(err);
                    return;
                }

                // console.log(newSettings);
                callback(null, newSettings, sysConf);
            });
        },
        //set common
        function(settings, sysConf, callback) {
            // load all attributes of settings in to Common
            for (var attrname in settings) {
                // console.log("attrname: " + attrname + " val: "+ settings[attrname])
                Common[attrname] = settings[attrname];
            }

            if (Common.dcURL) {
                var publicUrlObj = url.parse(Common.dcURL);
                Common.publicServerCredentials.options = {};
                Common.publicServerCredentials.options.host = publicUrlObj.hostname;
                Common.publicServerCredentials.options.port = Number(publicUrlObj.port);
                var isSSL = publicUrlObj.protocol === "https:";
                if (isSSL) {
                    if (Common.publicServerCredentials.key && Common.publicServerCredentials.key != "") {
                        try {
                            Common.publicServerCredentials.options.key = Common.fs.readFileSync(Common.publicServerCredentials.key);
                            Common.publicServerCredentials.options.certificate = Common.fs.readFileSync(Common.publicServerCredentials.cert);
                            Common.publicServerCredentials.options.rejectUnauthorized = false;
                        } catch (err) {
                            logger.error("Error reading publicServerCredentials: "+ err);
                        }
                    } else {
                        //logger.info("Warning: cannot find publicServerCredentials SSL keys but dcURL is https: "+Common.dcURL);
                    }

                }
                if (!Common.controlPanelURL) {
                    let urlObj = new URL(Common.dcURL);
                    urlObj.port = 6443;
                    Common.controlPanelURL = urlObj.href;
                    //logger.info(`Default controlPanelURL: ${Common.controlPanelURL}`);
                }
            }
            callback(null, settings, sysConf);
        },
        function(settings, sysConf, callback) {
            if (!myFirstTimeLoad) {
                return callback(null);
            }

            //connect to redis
            var RedisSub = require('./redisSub.js');
            var RedisClientModule = require('./redisClient.js');
            Common.redisConf = sysConf.redisConf;
            Common.RedisClientModule = new RedisClientModule(sysConf.redisConf, settings.redisValidator, logger);
            Common.redisClient = Common.RedisClientModule.client();
            Common.getRedisMulti = Common.RedisClientModule.multiClient;
            Common.redisSub = new RedisSub(Common.RedisClientModule.clientSub());

            if (Common.messagesServer) {
                Common.createRedisMessagesClient = () => {
                    var redisModule = require("redis");
                    let c = redisModule.createClient(Common.messagesServer);
                    return c;
                }
            }
            callback(null);

        },
        function(callback) {
            if (!Common.mailOptions ) {
                logger.info("nodemailer has not been configured");
                Common.mailer = {

                };
            } else {

                Common.mailer = Common.nodemailer.createTransport(Common.mailOptions );
            }

            // logger.info("Common.mailOptions: " + JSON.stringify(Common.mailOptions, null, 2));

            Common.mailer.send = function(mailOptions, callback) {
                if (!Common.mailOptions) {
                    callback(false, "nodemailer has not been configured");
                    return;
                }
                if (mailOptions.fromname)
                    mailOptions.from = mailOptions.fromname + "<" + mailOptions.from + ">";
                if (mailOptions.toname)
                    mailOptions.to = mailOptions.toname + "<" + mailOptions.to + ">";
                Common.mailer.sendMail(mailOptions, function(error, response) {
                    if (error) {
                        logger.info("Common.mailer.send: " + error);
                        callback(false, error);
                        return;
                    }
                    callback(true, "");
                    return;
                });
            };
            callback(null);
        },
        function(callback) {
            Common.constraints = require("@nubosoftware/nubo-validateconstraints")(validate);
            callback(null);
        },
        function(callback) {
            globals.getGlobals().then(globals => {
                Common.globals = globals;
                callback(null);
            }).catch(err => {
                callback(err);
            });
        },
        function(callback) {
            var orgList = [];
            Common.db.Orgs.findAll({
                attributes : ['maindomain','inviteurl'],
            }).then(function(results) {
                /*if (!results || results == "") {
                    var err = "Common. orgs table is empty";
                    logger.error(err);
                    callback(err);
                    return;
                }*/
                results.forEach(function(row) {
                    var org = {};
                    org.maindomain = row.maindomain;
                    org.inviteurl = row.inviteurl;
                    orgList.push(org);
                });
                Common.orgList = orgList;
                callback(null);
            }).catch(err => {
                logger.error("Common. get orgs data error " + err,err);
                console.error(err);
                callback(err);
            });
        }
    ], function(err) {
        watchSettings();
        if (err) {
            logger.error("common.js::parse_configs failed with err: " + err);

            if (Common.loadCallback) {
                Common.loadCallback(err);
            }
            if (myFirstTimeLoad) {
                initCB.reject(err);
            }
            if (parseConfigCB) {
                parseConfigCB(err);
            }
            return;
        }

        if (myFirstTimeLoad) {
            // re-create logger after  settings load
            createIntLogger();
            initCB.resolve();
        }
        if (Common.loadCallback) {
            Common.loadCallback(null, myFirstTimeLoad);
        }

        if (parseConfigCB) {
            parseConfigCB();
        }
    });
}



var padKey = function(encKey) {
    var resKey = "";
    var addCnt = 32-encKey.length;
    while (resKey.length < addCnt) {
        resKey += '0';
    }
    return encKey+resKey;
}

Common.encOld = function(plainText) {
    if (!plainText || plainText.length <= 2)
        return plainText;
    var cipher = crypto.createCipher(Common.encAlgorithmOld, Common.encKey);
    var encrypted = "enc:" + cipher.update(plainText, 'utf8', 'hex') + cipher.final('hex') ;
    return encrypted;
};

Common.enc = function(plainText) {
    if (!plainText || plainText.length <= 2)
        return plainText;
    var iv =  crypto.randomBytes(16);
    var cipher = crypto.createCipheriv(Common.encAlgorithm, padKey(Common.encKey), iv);
    var encrypted = "enc:" + cipher.update(plainText, 'utf8', 'hex') + cipher.final('hex') + ":" + iv.toString('hex');
    return encrypted;
};

Common.encClientProperties = function(plainText) {
    if (!plainText || plainText.length <= 0 || !Common.clientPropertiesKey) {
        return plainText;
    }
    let key = Buffer.from(Common.clientPropertiesKey, 'hex');
    var iv =  crypto.randomBytes(16);
    var cipher = crypto.createCipheriv(Common.encAlgorithm, key, iv);
    var encrypted = "enc:" + cipher.update(plainText, 'utf8', 'hex') + cipher.final('hex') + ":" + iv.toString('hex');
    return encrypted;
};

Common.dec = function(encText) {
    if (!encText || encText.length <= 4)
        return encText;
    if (encText.indexOf("enc:") != 0)
        return encText;
    var arr = encText.split(":");
    var decipher;
    if (arr.length == 2) {
        // old algorithm without IV
        decipher = crypto.createDecipher(Common.encAlgorithmOld, Common.encKey);
        logger.info("decrypt with old algorith!");
    } else if (arr.length == 3) {
        // new algorith with IV
        decipher = crypto.createDecipheriv(Common.encAlgorithm, padKey(Common.encKey),Buffer.from(arr[2], "hex"));
    } else {
        logger.error("Invalid format for encrypted text");
        return "dec_crashed";
    }
    var encOnlyText =arr[1];
    var decrypted;
    try {
        decrypted = decipher.update(encOnlyText, 'hex', 'utf8') + decipher.final('utf8');
    } catch (err) {
        logger.error("Common.js::dec: " +err);
        return "dec_crashed";
    }

    return decrypted;
};

Common.initPromise = new Promise((resolve,reject) => {
    initCB = {
        resolve: resolve,
        reject: reject
    }
    parse_configs();
});


function watchSettings() {

    Common.fs.watchFile(Common.settingsFile, {
        persistent: false,
        interval: 5007
    }, function(curr, prev) {
        logger.info('Settings.json. the current mtime is: ' + curr.mtime);
        logger.info('Settings.json. the previous mtime was: ' + prev.mtime);
        parse_configs();
    });
}

function stopWatchSettings(){
    let settingsFile = Common.path.join(Common.rootDir,'Settings.json');
     Common.fs.unwatchFile(settingsFile);
}


Common.quit = function(exitCode) {
    if (Common.RedisClientModule) {
        Common.RedisClientModule.exit();
    }
    try {
        logger.clear();
    } catch(err) {}

    if(exitCode){
        process.exit(exitCode);
    }
    else {
         process.exit(0);
    }
};


Common.mkdirpCB = function(folder,opts,cb) {
    if (typeof(opts) === 'function') {
        cb = opts;
        opts = undefined;
    }
    mkdirp(folder,opts).then(made => {
        cb(null);
    }).catch(err => {
        cb(err);
    });
};

/**
 * Support code that call old sequalize complete method (now its promise only)
 */
Promise.prototype.complete = function(cb){
    this.then(results => {
        //logger.info("Promise.prototype.complete !!");
        cb(null,results);
    }).catch(err => {
        cb(err,null);
    });
};

module.exports = Common;

