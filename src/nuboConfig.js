"use strict"

var prompt = require('prompt');
var Menu = require('@nubosoftware/nubo-menu');
const SysConf = require('./sysConf.js');
const Config = require('./config.js');
const async = require('async');
const _ = require('underscore');
const fs = require('fs');

var Common;
var dcName;
var logger;

var mainMenu;
var dataCenterConfigMenu;
var globalConfigMenu;

Common = require('./common.js');
logger = Common.getLogger(__filename);


var orgsMenu;


function main() {

    Common.loadCallback = function (err, firstTime) {
        if (err) {
          console.log("Error: " + err);
          Common.quit();
          return;
        }
        if (!firstTime) return;

        mainMenu = createMainMenu();
        dataCenterConfigMenu = createDataCenterMenu();
        globalConfigMenu = createGlobalMenu();


        prompt.message = "nubo#";
        prompt.delimiter = " ";

        mainMenu.start();
    }

    process.on('SIGINT', function() {
        console.log('\n');
        if (Common) {
            Common.quit(0);
        } else {
            process.exit(0);
        }
    });
}

main();

function createMainMenu() {

    var menu = new Menu();
    menu.addDelimiter('-', 40, 'Main Menu')
        .addItem(
            'global config menu',
            function() {
                menu.resetMenu();
                loadCommon(function(err) {
                    globalConfigMenu.start(err);
                });
            })
        .addItem(
            'data center config menu',
            function() {
                menu.resetMenu();
                loadCommon(function(err) {
                    dataCenterConfigMenu.start(err);
                });
            })
        .addItem(
            'db/redis config',
            function() {
                menu.resetMenu();
                dbRedisSetParameters(function(err) {
                    menu.start(err);
                });
            });
        

        if (Common.isEnterpriseEdition()) {
            Common.getEnterprise().entConfig.configAddMainMenu(menu,loadCommon,prompt,Config,dcName);
        }

        menu.addItem(
                'Exit',
                function() {
                    const time = new Date();
                    
                    fs.utimesSync(Common.settingsFile, time, time);
                    process.exit();
                })
        .addDelimiter('-', 40);

    return menu;
}

function createDataCenterMenu() {

    var menu = new Menu();
    menu.addDelimiter('-', 40, 'Data Center Menu')
        .addItem(
            'update data center name',
            function() {
                menu.resetMenu();
                updateDataCenterConfigSetParamters(function(err) {
                    if (err) {
                        menu.start(err);
                    } else {
                        loadCommon(function(err) {
                            menu.start(err);
                        });
                    }
                });
            })
        .addItem(
            'general config',
            function() {
                menu.resetMenu();
                dataCenterConfigSetParameters(function(err) {
                    if (err) {
                        menu.start(err);
                    } else {
                        loadCommon(function(err) {
                            menu.start(err);
                        });
                    }
                });
            })
        .addItem(
            'platform pool config',
            function() {
                menu.resetMenu();
                platformConfigSetParameters(function(err) {
                    if (err) {
                        menu.start(err);
                    } else {
                        loadCommon(function(err) {
                            menu.start(err);
                        });
                    }
                });
            })
        .addItem(
            'nfs server config',
            function() {
                menu.resetMenu();
                NFSSetParamters(function(err) {
                    if (err) {
                        menu.start(err);
                    } else {
                        loadCommon(function(err) {
                            menu.start(err);
                        });
                    }
                });
            })
        .addItem(
            'web client network access',
            function() {
                menu.resetMenu();
                restricWebClientSubnetsSetParameters(function(err) {
                    if (err) {
                        menu.start(err);
                    } else {
                        loadCommon(function(err) {
                            menu.start(err);
                        });
                    }
                });
            })
        .addItem(
            'rsyslog config',
            function() {
                menu.resetMenu();
                rsyslogSetParameters(function(err) {
                    if (err) {
                        menu.start(err);
                    } else {
                        loadCommon(function(err) {
                            menu.start(err);
                        });
                    }
                });
            })
        .addItem(
            'back to main menu',
            function() {
                menu.resetMenu();
                mainMenu.start();
            })
        .addDelimiter('-', 40);

    return menu;
}

function createGlobalMenu() {

    var menu = new Menu();
    menu.addDelimiter('-', 40, 'global settings Menu')
        .addItem(
            'general config',
            function() {
                menu.resetMenu();
                loadCommon(function(err) {
                    globalConfigSetParameters(function(err) {
                        if (err) {
                            menu.start(err);
                        } else {
                            loadCommon(function(err) {
                                menu.start(err);
                            });
                        }
                    });
                })
            })
        
        
        .addItem(
            'restrict web client access',
            function() {
                menu.resetMenu();
                restrictWebClientSetParameters(function(err) {
                    if (err) {
                        menu.start(err);
                    } else {
                        loadCommon(function(err) {
                            menu.start(err);
                        });
                    }
                });
            })
            .addItem(
            'update invite URL for organization',
            function() {
                menu.resetMenu();
                loadCommon(function(err) {
                    orgsMenu = createOrgsMenu();
                    orgsMenu.start(err);
                });
            });

        if (Common.isEnterpriseEdition()) {
            Common.getEnterprise().entConfig.configAddGlobalMenu(menu,loadCommon,prompt,Config);
        }

        menu.addItem(
            'back to main menu',
            function() {
                menu.resetMenu();
                mainMenu.start();
            })
        .addDelimiter('-', 40);

    return menu;
}

function createOrgsMenu() {

    var menu = new Menu();
    menu.addDelimiter('-', 40, 'update invite URL for organization').addDelimiter('-', 40);

    for (var i = 0; i < Common.orgList.length; i++) {
        var org = Common.orgList[i];
        menu.addItem(
            org.maindomain,
            helper(menu, org)
        )
    }

    menu.addItem('back to main menu',
            function() {
                menu.resetMenu();
                mainMenu.start();
            })

    return menu;


    function helper(menu, org){
        function item () {
            menu.resetMenu();
            loadCommon(function(err) {
                orgSetParameters(org, function(err) {
                    if (err) {
                        menu.start(err);
                    } else {
                        loadCommon(function(err) {
                            logger.info("return from set")
                            orgsMenu = createOrgsMenu();
                            orgsMenu.start(err);
                        });
                    }
                });
            })
        }
        return item;
    }
}

function orgSetParameters(org, callback) {
    prompt.get(Config.getInviteUrlParamsScema(org, logger), function(err, result) {
        if (err) {
            if (err.message === 'canceled') {
                logger.info('orgSetParameters. user canceled configuration');
                return callback(null);
            } else {
                logger.error('orgSetParameters. ' + err);
                return callback(err);
            }
        }
        Config.setInviteUrlConfig(Common, org.maindomain, result.organizationInviteURL, callback);
    });
}

function dbRedisSetParameters(callback) {


    async.waterfall([
        function(callback) {
            SysConf.getSchema(function(err, schema) {
                if (err) {
                    callback(err);
                    return;
                }

                callback(null, schema);
            })
        },
        function(schema, callback) {
            prompt.get(schema, function(err, result) {
                if (err) {
                    return callback(err);
                }

                var conf = {
                    redisConf: result.redisConf,
                    dbConf: result.dbConf
                };

                SysConf.saveSysConf(conf, callback);
            });
        }
    ], function(err) {
        if (err) {
            if (err.message === 'canceled') {
                if (logger) {
                    logger.info('dbRedisSetParameters: user canceled configuration');
                }
                return callback(null);
            } else {
                if (logger) {
                    logger.error('dbRedisSetParameters: ' + err);
                }
                return callback(err);
            }
        }

        callback(null);
    });
}

function install(callback) {

    async.waterfall([
            function(callback) {
                var schema = {
                    properties: {
                        encKey: {
                            description: 'choose encryption key for passwords',
                            required: true
                        }
                    }
                }
                prompt.get(schema, callback);
            },
            function(userInput, callback) {
                callback(null);
                // SysConf.writeKey(userInput.encKey, callback);
            },
            function(callback) {
                prompt.get(SysConf.confSchema, callback);
            },
            function(userInput, callback) {
                var conf = {
                    redisConf: userInput.redisConf,
                    sysConf: userInput.dbConf
                };

                callback(null);
                // SysConf.saveSysConf(conf, callback);
            },
            function(callback) {
                loadCommon(callback);
            },
            function(callback) {
                globalConfigSetParameters(callback);
            },
            function(callback) {
                dataCenterConfigSetParameters(callback);
            },
            function(callback) {
                NFSSetParamters(callback);
            },
            function(callback) {
                var schema = {
                    properties: {
                        confEWS: {
                            description: 'configure EWS?',
                            validator: /y[es]*|n[o]?/,
                            default: 'no'
                        }
                    }
                };

                prompt.get(schema, function(err, result) {
                    if (err) {
                        return callback(err);
                    }

                    if (result.confEWS.indexOf("y") == 0) {
                        EWSSetParameters(callback);
                    } else {
                        callback(null);
                    }
                });
            }
        ],
        function(err) {
            if (err) {
                if (err.message === 'canceled') {
                    logger.info('install: user canceled installation');
                    return callback(null);
                } else {
                    logger.error('install: ' + err);
                    return callback(err);
                }
            }

            callback(null);
        });
}

function globalConfigSetParameters(callback) {

    prompt.get(Config.getGlobalParamsSchema(Common, prompt), function(err, result) {
        if (err) {
            if (err.message === 'canceled') {
                logger.info('globalConfigSetParameters: user canceled configuration');
                return callback(null);
            } else {
                logger.error('globalConfigSetParameters: ' + err);
                return callback(err);
            }
        }

        Config.setGlobalConfig(result, Common.db, Common.logger, callback);
    });

}

function dataCenterConfigSetParameters(callback) {

    prompt.get(Config.getDataCenterParamsSchema(Common), function(err, result) {
        if (err) {
            if (err.message === 'canceled') {
                logger.info('dataCenterConfigSetParameters: user canceled configuration');
                return callback(null);
            } else {
                logger.error('dataCenterConfigSetParameters: ' + err);
                return callback(err);
            }
        }

        result.dcName = dcName;
        Config.setDataCenterConfig(result, Common.db, Common.logger, callback);

    });

}

function platformConfigSetParameters(callback) {

    prompt.get(Config.getPlatParamsSchema(Common,prompt), function(err, result) {
        if (err) {
            if (err.message === 'canceled') {
                logger.info('platformConfigSetParameters: user canceled configuration');
                return callback(null);
            } else {
                logger.error('platformConfigSetParameters: ' + err);
                return callback(err);
            }
        }

        var settings = {
            platformParams: result,
            dcName: dcName
        }

        Config.setPlatformParamsConfig(settings, Common.db, Common.logger, function(err) {
            callback(err);
        });

    });

}



function NFSSetParamters(callback) {

    async.waterfall([
        function(callback) {
            Common.db.NfsServers.findOne({
                where: {
                    dcname: dcName
                },
            }).complete(callback);
        },
        function(nfs, callback) {
            if (!nfs) {
                var schema = getNFSParamsSchema(nfsSchemaDefault);
            } else {
                var schema = getNFSParamsSchema(nfs);
            }

            prompt.get(schema, function(err, result) {
                callback(err, result, nfs)
            });
        },
        function(userInput, nfs, callback) {
            if (nfs) {
                Common.db.NfsServers.update({
                    nfsip: userInput.nfsip,
                    sship: userInput.sship,
                    sshuser: userInput.sshuser,
                    keypath: userInput.keypath,
                    nfspath: userInput.nfspath
                }, {
                    where: {
                        id: nfs.id
                    }
                }).then(function() {
                    callback(null);
                }).catch(function(err) {
                    callback(err);
                });
            } else {
                Common.db.NfsServers.create({
                    nfsip: userInput.nfsip,
                    sship: userInput.sship,
                    sshuser: userInput.sshuser,
                    keypath: userInput.keypath,
                    nfspath: userInput.nfspath,
                    dcname: dcName
                }).then(function(results) {
                    logger.error(results)
                    var dcConf = {
                        nfsId: results.id,
                        dcName: dcName
                    }
                    Config.setDataCenterConfig(dcConf, Common.db, Common.logger, callback);
                }).catch(function(err) {
                    callback(err);
                });
            }
        }
    ], function(err) {
        if (err) {
            if (err.message === 'canceled') {
                logger.info('NFSSetParamters: user canceled configuration');
                return callback(null);
            } else {
                logger.error('NFSSetParamters: ' + err);
                return callback(err);
            }
        }

        callback(null);
    });
}

var nfsSchemaDefault = {
    nfsip: '127.0.0.1',
    sship: '127.0.0.1',
    sshuser: 'fima',
    keypath: '/home/nubo/.ssh/id_rsa',
    nfspath: '/srv/nfs/homes'
}

function getNFSParamsSchema(defaults) {
    var schema = {
        properties: {
            nfsip: {
                description: 'enter nfs ip:',
                default: defaults.nfsip
            },
            sship: {
                description: 'enter ssh ip:',
                default: defaults.sship
            },
            sshuser: {
                description: 'enter ssh user:',
                default: defaults.sshuser
            },
            keypath: {
                description: 'key path:',
                default: defaults.keypath
            },
            nfspath: {
                description: 'nfs path:',
                default: defaults.nfspath
            }
        }
    }

    return schema;
}

function loadCommon(callback) {
    Common.reloadSettings(function(err) {
        if (err) {
            return callback(err);
        }

        dcName = Common.dcName;
        callback(null);
    });

}

function updateDataCenterConfigSchema(nfs, common) {
    var schema = {
        properties: {
            dcName: {
                description: 'enter data center new name:',
                required: true,
                default: common.dcName
            },
            // dcURL: {
            //     description: 'update data center URL:',
            //     required: true,
            //     default: common.dcURL
            // },
            // dcInternalURL: {
            //     description: 'update data center internal URL:',
            //     default: common.dcInternalURL,
            //     ask: function() {
            //         return common.withService;
            //     }
            // },
            // internalurl: {
            //     description: 'update data center back end address:',
            //     default: common.internalurl
            // },
            // nfsip: {
            //     description: 'update nfs ip:',
            //     default: nfs.nfsip
            // },
            // sship: {
            //     description: 'update ssh ip:',
            //     default: nfs.sship
            // }
        }
    }

    return schema;
}

function updateDataCenterConfigSetParamters(callback) {

    var updatedConfig;
    var settings;
    var nfs;
    var sysConf;

    async.series([
        // function(callback) {
        //     Common.db.NfsServers.findOne({
        //         where: {
        //             dcname: Common.dcName
        //         },
        //     }).complete(function(err, result) {
        //         if (err) {
        //             return callback(err);
        //         }

        //         nfs = result;
        //         callback(null);
        //     });
        // },
        function(callback) {
            prompt.get(updateDataCenterConfigSchema(nfs, Common), function(err, result) {
                if (err) {
                    if (err.message === 'canceled') {
                        logger.info('updateDataCenterConfigSetParamters: user canceled configuration');
                        return callback('canceled');
                    } else {
                        return callback(err);
                    }
                }

                updatedConfig = result;
                callback(null);
            });
        },
        function(callback) {
            Common.db.dataCenterConfig.update({
                dcName: updatedConfig.dcName
            }, {
                where: {
                    dcName: Common.dcName
                }
            }).then(function() {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        },
        // function(callback) {
        //     var dcConfig = {
        //         dcName: updatedConfig.dcName,
        //         dcURL: updatedConfig.dcURL,
        //         internalurl: updatedConfig.internalurl
        //     }

        //     if (Common.withService) {
        //         dcConfig.dcInternalURL = updatedConfig.dcInternalURL;
        //     }

        //     Config.setDataCenterConfig(dcConfig, Common.db, Common.logger, callback);
        // },
        function(callback) {
            Common.db.DataCenters.update({
                dcname: updatedConfig.dcName
            }, {
                where: {
                    dcname: Common.dcName
                }
            }).then(function() {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        },
        function(callback) {
            Common.db.AllowedFrontEndServers.update({
                dcName: updatedConfig.dcName
            }, {
                where: {
                    dcName: Common.dcName
                }
            }).then(function() {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        },
        function(callback) {
            Common.db.NfsServers.update({
                dcname: updatedConfig.dcName
                    // nfsip: updatedConfig.nfsip,
                    // sship: updatedConfig.sship
            }, {
                where: {
                    dcname: Common.dcName
                }
            }).then(function() {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        },
        function(callback) {
            Common.db.platformConfig.update({
                dcName: updatedConfig.dcName
            }, {
                where: {
                    dcName: Common.dcName
                }
            }).then(function() {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        },
        function(callback) {
            SysConf.loadSysConf(function(err,sysConfResult){
                sysConf = sysConfResult;
                callback(err);
            });
        },
        function(callback) {
            Common.loadSettings(sysConf,function(err, replay) {
                if (err) {
                    return callback(err);
                }

                settings = replay;
                callback(null);
            });
        },
        function(callback) {
            settings.dcName = updatedConfig.dcName;

            var settingsToString = JSON.stringify(settings, null, 4);

            fs.writeFile(Common.settingsFile, settingsToString, callback);
        }
    ], function(err) {
        if (err && err !== "canceled") {
            logger.error("updateDataCenterConfigSetParamters: " + err);
            return callback(err);
        }

        return callback(null);
    });
}






function restrictWebClientSetParameters(callback) {
    prompt.get(Config.getWebClientRestrictParamsSchema(Common, prompt), function(err, result) {
        if (err) {
            if (err.message === 'canceled') {
                logger.info('restrictWebClientSetParameters: user canceled configuration');
                return callback(null);
            } else {
                logger.error('restrictWebClientSetParameters: ' + err);
                return callback(err);
            }
        }

        if (result.enablebWebClientAccess === 'yes') {
            result.restrictWebClientAccess = false;
        } else if (result.restrictWebClientAccess === 'yes') {
            result.restrictWebClientAccess = true;
        } else {
            return callback(null);
        }


        Config.setGlobalConfig(result, Common.db, Common.logger, callback);
    });
}

function restricWebClientSubnetsSetParameters(callback) {

    // var newSubnets = [];

    function helper() {
        prompt.get(Config.getWebClientRestrictSubnetParamsSchema(Common, prompt), function(err, result) {
            if (err) {
                if (err.message === 'canceled') {
                    logger.info('restricWebClientSubnetsSetParameters: user canceled configuration');
                    return callback(null);
                } else {
                    logger.error('restricWebClientSubnetsSetParameters: ' + err);
                    return callback(err);
                }
            }

            Config.addWebclientAllowedSubnet(Common.db, Common.dcName, result.subnet, logger, function(err) {
                if (err) {
                    return callback(err);
                }
            })

            if (result.addSubnet === 'yes') {
                helper();
            } else {
                callback(null);
            }
        });

    }

    helper();
}

function rsyslogSetParameters(callback) {

    prompt.get(Config.getRsyslogParamsSchema(Common, prompt), function(err, result) {
        if (err) {
            if (err.message === 'canceled') {
                logger.info('rsyslogSetParameters: user canceled configuration');
                return callback(null);
            } else {
                logger.error('rsyslogSetParameters: ' + err);
                return callback(err);
            }
        }

        if (result.rsyslog == "" || result.rsyslog == " ") {
            result.rsyslog = null;
        }

        var settings = {
            platformParams: result,
            dcName: dcName
        }


        Config.setPlatformParamsConfig(settings, Common.db, Common.logger, callback);
    });
}