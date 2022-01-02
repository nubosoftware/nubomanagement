"use strict";

var async = require('async');
var _ = require('underscore');
var updateSecurityPolicy = require('./ControlPanel/updateSecurityPolicy.js');

var globalParams = {
    activateBySMS: 'bool',
    activationTimeoutPeriod: 'int',
    disableIPBlockMechanism: 'bool',
    externalMountsSrc: 'string',
    fastConnection: 'bool',
    hideControlPanel: 'bool',
    isHandlingMediaStreams: 'bool',
    sendTrackData: 'bool',
    sessionTimeout: 'int',
    streams: 'string',
    dataCenterUpdateTimeout: 'int',
    restrictWebClientAccess: 'bool',
    sysVersion: 'int',
    
};

function getGlobalParamsSchema(Common, prompt) {
    var globalParamsSchema = {
        properties: {
            activateBySMS: {
                description: 'activate by SMS?',
                default: Common.activateBySMS
            },
            activationTimeoutPeriod: {
                description: 'activation timeout period:',
                default: Common.activationTimeoutPeriod
            },            
            disableIPBlockMechanism: {
                description: 'disable IP block mechanism?',
                default: Common.disableIPBlockMechanism
            },
            fastConnection: {
                description: 'allow fast connection?',
                default: Common.fastConnection
            },
            sessionTimeout: {
                description: 'session timeout in seconds:',
                default: Common.sessionTimeout
            }
        }
    }
    if (Common.isEnterpriseEdition()) {
        globalParamsSchema = Common.getEnterprise().entConfig.addToGlobalParamsSchema(globalParamsSchema,Common,prompt);
    }
    

    return globalParamsSchema;
}

var dcParams = {
    publicurl: 'string',
    internalurl: 'string',
    nfsId: 'int',
    dcURL: 'string',
    dcInternalURL: 'string',
    defaultTimeZone: 'string',
    platformType: 'string',
    platformVersionCode: 'int',
    
    dcVersion: 'int'
};

function getDataCenterParamsSchema(Common) {
    var schema = {
        properties: {
            // dcName: {
            //     description: 'enter data center name:',
            //     required: true,
            //     default: Common.dcName
            // },
            dcURL: {
                description: 'enter data center URL:',
                required: true,
                default: Common.dcURL
            },
            dcInternalURL: {
                description: 'enter data center internal URL:',
                default: Common.dcInternalURL,
                ask: function() {
                    return Common.withService;
                }
            },
            internalurl: {
                description: 'data center back end address:',
                default: Common.internalurl
            },
            defaultTimeZone: {
                description: 'default time zone:',
                default: Common.defaultTimeZone
            },
            platformType: {
                description: 'platform type:',
                default: Common.platformType
            },
            platformVersionCode: {
                description: 'platform version code:',
                default: Common.platformVersionCode
            }

        }
    }

    return schema;
}



var platParams = {
    concurrency: 'int',
    concurrencyDelay: 'int',
    platformPoolSize: 'int',
    explatformPoolSize: 'int', // ?????????????
    upperCapacityLevel: 'float',
    bottomCapacityLevel: 'float',
    maxCapacity: 'int',
    usersPerPlatform: 'int',
    choosePool: 'int',
    maxFailed: 'int',
    maxFails: 'int',
    fixedPool: 'bool',
    restartPlatformSessionsThreshold: 'int',
    cleanPlatformsMode: 'bool',
    rsyslog: 'string'
};

function getPlatParamsSchema(Common) {
    var schema = {
        properties: {
            concurrency: {
                description: 'max platforms loaded in parallel:',
                default: Common.platformParams.concurrency
            },
            concurrencyDelay: {
                description: 'wait internval between platform load:',
                default: Common.platformParams.concurrencyDelay
            },
            platformPoolSize: {
                description: 'platform pool size:',
                default: Common.platformParams.platformPoolSize
            },
            upperCapacityLevel: {
                description: 'max ratio of users per platform before loading new platform:',
                default: Common.platformParams.upperCapacityLevel
            },
            bottomCapacityLevel: {
                description: 'min ratio of users per platform before removeing platform:',
                default: Common.platformParams.bottomCapacityLevel
            },
            maxCapacity: {
                description: 'maximum users on data center:',
                default: Common.platformParams.maxCapacity
            },
            usersPerPlatform: {
                description: 'number of users on platform:',
                default: Common.platformParams.usersPerPlatform
            },
            maxFailed: {
                description: 'maximum platforms in error state before mgmt stops loading new platforms:',
                default: Common.platformParams.maxFailed
            },
            maxFails: {
                description: 'number of max fails before stoping loading specific platform:',
                default: Common.platformParams.maxFails
            },
            fixedPool: {
                description: 'include platforms in error state for calculation of capacity level?',
                default: Common.platformParams.fixedPool
            },
            restartPlatformSessionsThreshold: {
                description: 'Revive Platform Session Threshold',
                default: Common.platformParams.restartPlatformSessionsThreshold ? Common.platformParams.restartPlatformSessionsThreshold : 0
            },
            cleanPlatformsMode: {
                description: 'clean platforms?',
                default: Common.platformParams.cleanPlatformsMode
            }
        }
    }

    return schema;
}

function loadConfig(settingsFile, db, decryptor, logger, callback) {

    async.waterfall([
        function(callback) {
            joinSettingsWithDBConfig(db, settingsFile, decryptor, logger, callback);
        },
        function(results, callback) {
            callback(null, results);
        }
    ], function(err, results) {
        callback(err, results);
    });

}

function joinSettingsWithDBConfig(db, settingsFile, decryptor, logger, callback) {

    async.waterfall([
        function(callback) {
            const enterpriseLoader = require('./enterpriseLoader');
            if (enterpriseLoader.isPresent()) {
                require('./enterpriseLoader').get().entConfig.initConfigParams(globalParams,dcParams,settingsFile);
            }
            getGlobalConfig(db, logger, function(err, globalConfig) {
                if (err) {
                    callback(err);
                    return;
                }

                var newSettings = addSettingsConfFromDB(globalConfig, settingsFile, logger);
                //console.log(`addSettingsConfFromDB. newSettings: ${JSON.stringify(newSettings,null,2)}`);
                callback(null, newSettings);
            });
        },
        function(settings, callback) {
            getDataCenterConfig(db, settings.dcName, logger, function(err, dcConfig) {
                if (err) {
                    callback(err);
                    return;
                }

                var newSettings = addSettingsConfFromDB(dcConfig, settings, logger);

                callback(null, newSettings);
            });
        },
        function(settings, callback) {
            if (settings.nfshomefolder) {
                return callback(null, settings);
            }

            db.NfsServers.findOne({
                where: {
                    id: settings.nfsId
                },
            }).then(function(nfs) {

                if (!nfs) {
                    return callback("joinSettingsWithDBConfig: cannot find nfs server " + settings.nfsId);
                }

                settings.nfshomefolder = nfs.nfspath;

                callback(null, settings);
            }).catch(err => {
                callback(err);
            });
        },
        function(settings, callback) {

            getPlatformConfig(db, settings.dcName, logger, function(err, platConfig) {
                if (err) {
                    callback(err);
                    return;
                }

                if (_.isEmpty(platConfig)) {
                    callback(null, settings);
                    return;
                }

                if (settings.platformParams === undefined) {
                    settings.platformParams = platConfig;
                } else {
                    logger.warn("config.js::joinSettingsWithDBConfig: overriding platformParams");
                }

                callback(null, settings);
            });
        },
        function(settings, callback) {
            getAllowedOrigins(db, logger, function(err, allowedOrigns) {
                if (err) {
                    callback(err);
                    return;
                }

                if (settings.allowedOrigns === undefined) {
                    settings.allowedOrigns = allowedOrigns;
                } else {
                    logger.warn("config.js::joinSettingsWithDBConfig: overriding allowedOrigns");
                }

                callback(null, settings);
            });
        },
        function(settings, callback) {
            getOrgRedirectionMap(db, logger, function(err, redirectionMap) {
                if (err) {
                    callback(err);
                    return;
                }

                if (settings.orgRedirectionMap === undefined) {
                    if (!_.isEmpty(redirectionMap)) {
                        settings.orgRedirectionMap = redirectionMap;
                    }
                } else {
                    logger.warn("config.js::joinSettingsWithDBConfig: overriding orgRedirectionMap");
                }

                callback(null, settings);
            });
        },
        function(settings, callback) {
            getVersionRedirectionMap(db, logger, function(err, redirectionMap) {
                if (err) {
                    callback(err);
                    return;
                }

                //console.log(redirectionMap)
                if (settings.versionRedirectionMap === undefined) {
                    if (!_.isEmpty(redirectionMap)) {
                        settings.versionRedirectionMap = redirectionMap;
                    }
                } else {
                    logger.warn("config.js::joinSettingsWithDBConfig: overriding versionRedirectionMap");
                }

                callback(null, settings);
            });
        },
        function(settings, callback) {
            getAllowedFrontEndServer(db, settings.dcName, decryptor, logger, function(err, servers) {
                if (err) {
                    callback(err);
                    return;
                }

                if (settings.allowedFE === undefined) {
                    settings.allowedFE = servers;
                } else {
                    logger.warn("config.js::joinSettingsWithDBConfig: overriding allowedFE");
                }

                callback(null, settings);
            });
        },
        function(settings, callback) {
            getRemoteServers(db, decryptor, logger, function(err, servers) {
                if (err) {
                    callback(err);
                    return;
                }

                if (settings.RemoteServers === undefined) {
                    settings.RemoteServers = servers;
                } else {
                    logger.warn("config.js::joinSettingsWithDBConfig: overriding RemoteServers");
                }

                callback(null, settings);
            });
        },
        function(settings, callback) {
            getWebclientAllowedSubnets(db, settings.dcName, logger, function(err, subnets) {
                if (err) {
                    callback(err);
                    return;
                }

                if (settings.webClientSubnets === undefined) {
                    settings.webClientSubnets = subnets;
                } else {
                    logger.warn("config.js::joinSettingsWithDBConfig: overriding webClientSubnets");
                }

                callback(null, settings);
            });
        }
    ], function(err, newSettings) {
        if (err) {
            logger.error("config.js::joinSettingsWithDBConfig: " + err);
            callback(err);
            return;
        }

        callback(null, newSettings);
    });
}

function getGlobalConfig(db, logger, callback) {

    
    db.globalConfig.findAll({}).then(function(results) {

        var conf = {};
        _.each(results, function(parameter) {            
            if (globalParams[parameter.name] == 'string') {
                conf[parameter.name] = parameter.value;
            } else if (globalParams[parameter.name] == 'bool') {
                conf[parameter.name] = (parameter.value == 'true');
            } else if (globalParams[parameter.name] == 'int') {
                conf[parameter.name] = parseInt(parameter.value)
            } else {
                //console.log(`Ignore unknown param: ${parameter.name}`);
                // logger.error("config.js::getGlobalConfig: unknown paramter type");
                // callback(`unknown paramter type. parameter.name: ${parameter.name}, type: ${globalParams[parameter.name]}` );
                // return;
            }


        });
        // console.log(conf);
        callback(null, conf);
    }).catch(err => {
        logger.error("config.js::getGlobalConfig: " + err);
        callback(err);
    });

}

function getDataCenterConfig(db, dcName, logger, callback) {

    db.dataCenterConfig.findAll({
        where: {
            dcName: dcName
        }
    }).then(function(results) {
        if (results == null) {
            callback(null, {});
            return;
        }

        var conf = {};
        _.each(results, function(parameter) {
            if (dcParams[parameter.name] == 'string') {
                conf[parameter.name] = parameter.value;
            } else if (dcParams[parameter.name] == 'bool') {
                conf[parameter.name] = (parameter.value == 'true');
            } else if (dcParams[parameter.name] == 'int') {
                conf[parameter.name] = parseInt(parameter.value)
            } else {
                // logger.error("config.js::getDataCenterConfig: unknown paramter type");
                // callback("unknown paramter type " + dcParams[parameter.name]);
                // return;
            }
        });
        // console.log(conf);
        callback(null, conf);
    }).catch(err => {
        logger.error("config.js::getDataCenterConfig: " + err);
        callback(err);
    });

}

function getPlatformConfig(db, dcName, logger, callback) {

    db.platformConfig.findOne({
        where: {
            dcName: dcName
        }
    }).then(function(platformConfig) {

        if (platformConfig == null) {
            callback(null, {});
            return;
        }

        var conf = {};
        _.each(platParams, function(type, name) {
            if (type == 'bool') {
                conf[name] = (platformConfig[name] == 'true');
            } else {
                conf[name] = platformConfig[name];
            }
            //
        });
        // console.log(conf);
        callback(null, conf);
    }).catch(err => {
        logger.error("config.js::getPlatformConfig: " + err);
        callback(null,{}); // ignore error - mgmt will use default settings
        //callback(err);
    });

}

function getAllowedOrigins(db, logger, callback) {

    db.dataCenterConfig.findAll({}).then(function(results) {

        var allowedOriginsList = [];
        _.each(results, function(row) {
            if (row.name == 'dcURL') {
                allowedOriginsList.push(row.value);
            }
        });

        // var conf = {
        //     allowedOrigns: allowedOriginsList
        // };
        // console.log(allowedOriginsList);
        callback(null, allowedOriginsList);
    }).catch(err => {
        logger.error("config.js::getAllowedOrigins: " + err);
        callback(err);
    });
}

function getOrgRedirectionMap(db, logger, callback) {

    db.orgRedirectionMap.findAll({}).then(function(results) {

        var conf = {};
        _.each(results, function(row) {
            conf[row.domain] = row.url;
        });

        // console.log(conf);
        callback(null, conf);
    }).catch(err => {
        logger.error("config.js::getOrgRedirectionMap: " + err);
        callback(err);
    });
}

function addSettingsConfFromDB(DBConfig, settings, logger) {

    _.each(DBConfig, function(value, name) {
        if (settings[name] === undefined) {
            settings[name] = value;
            // console.log(name + ":"+value)
        } else {
            //logger.warn("config.js::addSettingsConfFromDB: overriding parameter \'" + name + "\'");

        }
    });

    return settings;
}

function getVersionRedirectionMap(db, logger, callback) {

    db.versionRedirectionMap.findAll({}).then(function(results) {

        var conf = {};
        _.each(results, function(row) {
            conf[row.version] = row.url;
        });

        // console.log(conf);
        callback(null, conf);
    }).catch(err => {
        logger.error("config.js::getVersionRedirectionMap: " + err);
        callback(err);
    });
}

function getAllowedFrontEndServer(db, dcName, decryptor, logger, callback) {

    db.AllowedFrontEndServers.findAll({
        where: {
            dcName: dcName
        }
    }).then(function(results) {

        var conf = {};
        _.each(results, function(row) {
            conf[row.servername] = decryptor(row.serverkey);
        });

        // console.log(conf);
        callback(null, conf);
    }).catch(err => {
        logger.error("config.js::getAllowedFrontEndServer: " + err);
        callback(err);
    });
}

function getRemoteServers(db, decryptor, logger, callback) {

    db.RemoteServers.findAll({}).then(function(results) {

        var conf = {};
        _.each(results, function(row) {
            conf[row.servername] = decryptor(row.serverkey);
        });

        // console.log(conf);
        callback(null, conf);
    }).catch(err => {
        logger.error("config.js::getRemoteServers: " + err);
        callback(err);
    });
}

function setGlobalConfig(settings, db, logger, callback) {

    async.eachSeries(Object.keys(globalParams), function(param, callback) {

        if (settings[param] === undefined) {
            callback(null);
            return;
        }

        var paramValue;
        if (globalParams[param] === 'bool') {
            paramValue = (settings[param] == true || settings[param] === 'true') ? 'true' : 'false';
        } else {
            paramValue = settings[param];
        }

        updateGlobalParam(param, paramValue, db, logger, function(err) {
            if (err) {
                callback(err);
                return;
            }

            logger.info("setGlobalConfig: parameter \'" + param + "\' updated to: " + paramValue);
            delete settings[param];
            callback(null);
        });

    }, function(err) {
        if (err) {
            logger.error('setGlobalConfig: ' + err);
            callback(err);
            return;
        }
        callback(null);
    });
}


function updateGlobalParam(paramName, paramValue, db, logger, callback) {

    var param = {
        name: paramName,
        value: paramValue
    };

    //console.log(`updateGlobalParam: param: ${JSON.stringify(param)}.`);
    db.globalConfig.upsert(param)//
        .then(function() {
            //console.log(`updateGlobalParam: paramValue: ${paramValue}.`);
            callback(null);
        }).catch(function(err) {
            console.log(`updateGlobalParam: paramValue: ${paramValue}, err: ${err}`,err);
            callback(err);
        });


}

function setDataCenterConfig(settings, db, logger, callback) {

    if (settings.dcName === undefined) {
        var err = "missing dcName cannot set data center params without dcName";
        callback(err);
        return;
    }
    // logger.info("settings: " , settings);
    async.eachSeries(Object.keys(dcParams), function(param, callback) {

        // logger.error(param + "." + settings[param])
        if (settings[param] === undefined) {
            callback(null);
            return;
        }

        var paramValue;
        if (dcParams[param] === 'bool') {
            paramValue = (settings[param] == true || settings[param] === 'true') ? 'true' : 'false';
        } else {
            paramValue = settings[param];
        }
        updateDataCenterParam(settings.dcName, param, paramValue, db, logger, function(err) {
            if (err) {
                callback(err);
                return;
            }

            // logger.info("setDataCenterConfig: parameter \'" + param + "\' updated to: " + paramValue);
            delete settings[param];
            callback(null);
        });

    }, function(err) {
        if (err) {
            logger.error('setDataCenterConfig: ' + err);
            callback(err);
            return;
        }

        setPlatformParamsConfig(settings, db, logger, callback);
    });
}

function updateDataCenterParam(dcName, paramName, paramValue, db, logger, callback) {

    var param = {
        value: paramValue
    };

    db.dataCenterConfig.findOrCreate({
        where: {
            dcName: dcName,
            name: paramName
        },
        defaults: {
            value: paramValue
        }
    }).then(function(row, created) {
        if (created) {
            logger.info("updateDataCenterParam: added param: " + paramName + " with value: " + paramValue);
            callback(null);
            return;
        }

        db.dataCenterConfig.update(param, {
            where: {
                dcName: dcName,
                name: paramName
            }
        }).then(function() {
            logger.info("updateDataCenterParam: updated param: " + paramName + " with value: " + paramValue);
            callback(null);
        }).catch(function(err) {
            logger.error('updateDataCenterParam: ' + err);
            callback(err);
        });
    }).catch(function(err) {
        logger.error('updateDataCenterParam: ' + err);
        callback(err);
    });
}

function setPlatformParamsConfig(settings, db, logger, callback) {

    if (settings.platformParams === undefined) {
        callback(null);
        return;
    }

    if (settings.dcName === undefined) {
        var err = "missing dcName. cannot set platform params without dcName.";
        callback(err);
        return;
    }

    async.eachSeries(Object.keys(platParams), function(param, callback) {

        if (settings.platformParams[param] === undefined) {
            callback(null);
            return;
        }

        var paramValue;
        if (platParams[param] === 'bool') {
            paramValue = settings.platformParams[param] == true ? 'true' : 'false';
        } else {
            paramValue = settings.platformParams[param];
        }



        updatePlatformParam(settings.dcName, param, paramValue, db, logger, function(err) {
            if (err) {
                callback(err);
                return;
            }

            logger.info("setPlatformParamsConfig: parameter \'" + param + "\' updated to: " + paramValue);
            callback(null);
        });

    }, function(err) {
        if (err) {
            logger.error('setPlatformParamsConfig: ' + err);
            callback(err);
            return;
        }

        delete settings.platformParams;
        callback(null);
    });
}

function updatePlatformParam(dcName, paramName, paramValue, db, logger, callback) {
    var param = {};
    param[paramName] = paramValue;

    db.platformConfig.findOrCreate({
        where: {
            dcName: dcName
        }
    }).then(function(result) {
        db.platformConfig.update(param, {
            where: {
                dcName: dcName
            }
        }).then(function() {
            callback(null);
        }).catch(function(err) {
            logger.error('updatePlatformParam: ' + err);
            callback(err);
        });
    }).catch(err => {
        logger.error('updatePlatformParam: ' + err);
        callback(err);
    });
}

function setOrgRedirectionMap(settings, db, logger, callback) {
    if (settings.orgRedirectionMap === undefined) {
        logger.info("setOrgRedirectionMap: setOrgRedirectionMap doesn\'t exsist in settings");
        callback(null);
        return;
    }

    async.eachSeries(Object.keys(settings.orgRedirectionMap), function(domain, callback) {

        db.orgRedirectionMap.findOrCreate({
            where: {
                domain: domain
            },
            defaults: {
                url: settings.orgRedirectionMap[domain]
            }
        }).then(function(row, created) {
            if (created) {
                logger.info("setOrgRedirectionMap: added org: " + domain + " with url: " + settings.orgRedirectionMap[domain]);
                callback(null);
                return;
            }

            db.orgRedirectionMap.update({
                url: settings.orgRedirectionMap[domain]
            }, {
                where: {
                    domain: domain
                }
            }).then(function() {
                logger.info("setOrgRedirectionMap: updated org: " + domain + " with url: " + settings.orgRedirectionMap[domain])
                callback(null);
            }).catch(function(err) {
                logger.error('setOrgRedirectionMap: ' + err);
                callback(err);
            });
        }).catch(function(err) {
            logger.error('setOrgRedirectionMap: ' + err);
            callback(err);
        });

    }, function(err) {
        if (err) {
            callback(err);
            return;
        }

        delete settings.orgRedirectionMap;
        callback(null);
    });
}

function setVersionRedirectionMap(settings, db, logger, callback) {
    if (settings.versionRedirectionMap === undefined) {
        logger.info("setVersionRedirectionMap: versionRedirectionMap doesn\'t exsist in settings");
        callback(null);
        return;
    }

    async.eachSeries(Object.keys(settings.versionRedirectionMap), function(version, callback) {

        db.versionRedirectionMap.findOrCreate({
            where: {
                version: version
            },
            defaults: {
                url: settings.versionRedirectionMap[version]
            }
        }).then(function(row, created) {
            if (created) {
                logger.info("setVersionRedirectionMap: added version: " + version + " with url: " + settings.versionRedirectionMap[version]);
                callback(null);
                return;
            }

            db.versionRedirectionMap.update({
                url: settings.versionRedirectionMap[version]
            }, {
                where: {
                    version: version
                }
            }).then(function() {
                logger.info("setVersionRedirectionMap: updated version: " + version + " with url: " + settings.versionRedirectionMap[version])
                callback(null);
            }).catch(function(err) {
                logger.error('setVersionRedirectionMap: ' + err);
                callback(err);
            });
        }).catch(function(err) {
            logger.error('setOrgRedirectionMap: ' + err);
            callback(err);
        });

    }, function(err) {
        if (err) {
            callback(err);
            return;
        }

        delete settings.versionRedirectionMap;
        callback(null);
    });
}

function setAllowedFrontEndServer(settings, db, logger, enc, dec, callback) {
    if (settings.allowedFE === undefined) {
        callback(null, settings);
        return;
    }

    if (settings.dcName === undefined) {
        var err = "missing dcName. cannot set platform params without dcName.";
        callback(err);
        return;
    }

    async.eachSeries(Object.keys(settings.allowedFE), function(servername, callback) {

        var decServerKey = dec(settings.allowedFE[servername])
        db.AllowedFrontEndServers.findOrCreate({
            where: {
                dcName: settings.dcName,
                servername: servername
            },
            defaults: {
                serverkey: enc(decServerKey)
            }
        }).then(function(row, created) {
            if (created) {
                logger.info("setAllowedFrontEndServer: added server: " + servername + " with key: " + decServerKey);
                callback(null);
                return;
            }

            db.AllowedFrontEndServers.update({
                serverkey: enc(decServerKey)
            }, {
                where: {
                    dcName: settings.dcName,
                    servername: servername
                }
            }).then(function() {
                logger.info("setAllowedFrontEndServer: updated server: " + servername + " with key: " + decServerKey);
                callback(null);
            }).catch(function(err) {
                logger.error('setAllowedFrontEndServer: ' + err);
                callback(err);
            });
        }).catch(function(err) {
            logger.error('setAllowedFrontEndServer: ' + err);
            callback(err);
        });

    }, function(err) {
        if (err) {
            callback(err);
            return;
        }

        delete settings.allowedFE;
        callback(null);
    });
}

function setRemoteServers(settings, db, logger, enc, dec, callback) {
    if (settings.RemoteServers === undefined) {
        callback(null);
        return;
    }

    async.eachSeries(Object.keys(settings.RemoteServers), function(servername, callback) {

        var decServerKey = dec(settings.RemoteServers[servername])
        db.RemoteServers.findOrCreate({
            where: {
                servername: servername
            },
            defaults: {
                serverkey: enc(decServerKey)
            }
        }).then(function(row, created) {
            if (created) {
                logger.info("setRemoteServers: added server: " + servername + " with key: " + decServerKey);
                callback(null);
                return;
            }

            db.RemoteServers.update({
                serverkey: enc(decServerKey)
            }, {
                where: {
                    servername: servername
                }
            }).then(function() {
                logger.info("setRemoteServers: updated server: " + servername + " with key: " + decServerKey);
                callback(null);
            }).catch(function(err) {
                logger.error('setRemoteServers: ' + err);
                callback(err);
            });
        }).catch(function(err) {
            logger.error('setAllowedFrontEndServer: ' + err);
            callback(err);
        });

    }, function(err) {
        if (err) {
            callback(err);
            return;
        }

        delete settings.RemoteServers;
        callback(null);
    });
}





function getWebclientAllowedSubnets(db, dcName, logger, callback) {

    db.WebclientAllowedSubnets.findAll({
        attributes: ['subnet'],
        where: {
            dcname: dcName
        }
    }).then(function(results) {
        var conf = [];
        _.each(results, function(row) {
            conf.push(row.subnet);
        });

        // console.log(conf);
        callback(null, conf);
    }).catch(err => {
        logger.error("config.js::getWebclientAllowedSubnets: " + err,err);
            callback(err);
    });
}

function addWebclientAllowedSubnet(db, dcName, newSubnet, logger, callback) {

    // logger.error(dcName + " " + newSubnet)
    db.WebclientAllowedSubnets.create({
        dcname: dcName,
        subnet: newSubnet
    }).then(function() {
        callback(null);
    }).catch(function(err) {
        logger.error("addWebclientAllowedSubnet: " + err);
        callback(err);
    });
}

function getWebClientRestrictParamsSchema(Common, prompt) {

    // Common.logger.error("getVirtualKeyboardParamsSchema: " + Common.virtualKeyboardPasswordExpirationDays)
    var schema = {
        properties: {
            enablebWebClientAccess: {
                validator: /yes|no/,
                // description: 'enable fido auth?',
                required: true,
                default: "no",
                message: 'disable web client restriction?',
                ask: function() {
                    return (Common.restrictWebClientAccess == true);
                }
            },
            restrictWebClientAccess: {
                validator: /yes|no/,
                // description: 'enable fido auth?',
                required: true,
                default: "no",
                message: 'restrict web client access?',
                ask: function() {
                    return (Common.restrictWebClientAccess == false);
                }
            }
        }
    }

    return schema;
}

function getWebClientRestrictSubnetParamsSchema(Common, prompt) {

    var schema = {
        properties: {
            subnet: {
                description: 'enter subnet to access web player in CIDR format:',
                type: 'string',
                required: true,
                default: Common.webClientSubnets
            },
            addSubnet: {
                validator: /yes|no/,
                // description: 'enable fido auth?',
                required: true,
                default: "no",
                message: 'add another subnet?',
            }
        }
    }

    return schema;
}

function getRsyslogParamsSchema(Common, prompt) {

    var schema = {
        properties: {
            rsyslog: {
                description: 'please enter rsyslog address:',
                type: 'string',
                default: Common.platformParams.rsyslog ? Common.platformParams.rsyslog : ""
            }
        }
    }

    return schema;
}

function getInviteUrlParamsScema(org, logger) {
    var schema = {
        properties: {
            organizationInviteURL: {
                description: "organization \'" + org.maindomain + "\' invite URL:",
                default: org.inviteurl,
            },
        }
    }

    return schema;
}

function setInviteUrlConfig(Common, domain, inviteurl, callback) {
    Common.db.Orgs.update({
        inviteurl: inviteurl
    }, {
        where: {
            maindomain: domain
        }
    }).then(function() {
        callback(null);

    }).catch(function(err) {
        Common.logger.error("setInviteUrlConfig. update orgs error  " + err);
        callback(err);
    });
}

module.exports = {
    loadConfig: loadConfig,
    getPlatformConfig: getPlatformConfig,
    getDataCenterConfig: getDataCenterConfig,
    getAllowedOrigins: getAllowedOrigins,
    globalParams: globalParams,
    dcParams: dcParams,
    platParams: platParams,
    setGlobalConfig: setGlobalConfig,
    setDataCenterConfig: setDataCenterConfig,
    setPlatformParamsConfig: setPlatformParamsConfig,
    setOrgRedirectionMap: setOrgRedirectionMap,
    setVersionRedirectionMap: setVersionRedirectionMap,
    setAllowedFrontEndServer: setAllowedFrontEndServer,
    setRemoteServers: setRemoteServers,
    getGlobalParamsSchema: getGlobalParamsSchema,
    getDataCenterParamsSchema: getDataCenterParamsSchema,
    getPlatParamsSchema: getPlatParamsSchema,
    getWebClientRestrictParamsSchema: getWebClientRestrictParamsSchema,
    getWebClientRestrictSubnetParamsSchema: getWebClientRestrictSubnetParamsSchema,
    addWebclientAllowedSubnet: addWebclientAllowedSubnet,
    getRsyslogParamsSchema: getRsyslogParamsSchema,
    getInviteUrlParamsScema: getInviteUrlParamsScema,
    setInviteUrlConfig: setInviteUrlConfig,
    updateDataCenterParam
};