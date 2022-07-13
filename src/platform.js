"use strict";

var fs = require("fs");
var _ = require('underscore');
var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var Lock = require('./lock.js');
var async = require('async');
var http = require('./http.js');
var TimeLog = require('./timeLog.js').TimeLog;
var sessionModule = require('./session.js');
var gatewayModule = require('./Gateway.js');
var Session = sessionModule.Session;
var Platform, DeleteAll, killPlatform, addOnlineRuleToPlatform;
var daemonTools = require('./daemonTools.js');
var commonUtils = require('./commonUtils.js');
var jwt = require('jsonwebtoken');
const { QueryTypes } = require('sequelize');
const Numbers = require("twilio/lib/rest/Numbers");
var platformSsl;
const { promisify } = require("util");



// hold all platform types that are registered
var platformTypeModules = {};

function registerPlatformType(platformType,platformModule) {
    logger.info(`Registering platform type: ${platformType}`);
    platformTypeModules[platformType] = platformModule;
}

function getStaticPlatformParams(platID) {
    return require('./ControlPanel/platformControl').getStaticPlatformParams(platID);
}

var Platform = function(platid, platType, callback, newplatid) {
    var self = this;
    this.params = {
        platid: platid,
        errorset: 'false'
    };
    this.adbpre = "";
    this.ssh = null;
    this.platType = platType;
    var prefix = (platType ? platType + "_" : "");
    var logger = Common.getLogger(__filename);

    this.appendAttributes = function(newParams) {
        for (var attrname in newParams) {
            this.params[attrname] = newParams[attrname];
        }
    }

    this.save = function(callback) {
        Common.redisClient.hmset('platform_' + self.params.platid, self.params, function(err, obj) {
            if (err) {
                logger.err("couldn't save platform:" + err);
                callback(err);
                return;
            }

            callback(null, self);
        });
    }; // save

    this.lock = function(retries, wait, specialLogger, callback) {
            var plat = this;
            var platid = plat.params.platid;
            var mylogger = (specialLogger ? specialLogger : logger);
            mylogger.info("Try to get lock on platform " + prefix + platid);
            Common.redisClient.setnx('lock_' + 'platform_' + platid, 1, function(err, reply) {
                if (err) {
                    mylogger.info("Error in the lock on platform " + prefix + platid + " ,err: " + err);
                    callback(err);
                    return;
                }
                if (reply == 1) {
                    mylogger.info("*********Successfull lock on platform " + prefix + platid);
                    callback(null); // sucessfull lock
                    return;
                }
                if (retries <= 0) {
                    mylogger.info("Timeout in lock on platform " + prefix + platid);
                    callback("Error in the lock on platform " + prefix + platid + ", Lock already exists");
                } else {
                    mylogger.info("Wait on lock on platform " + prefix + platid + ", retries: " + retries);
                    setTimeout(function() {
                        plat.lock(retries - 1, wait, specialLogger, callback);
                    }, wait);
                }
            }); // Common.redisClient.SETNX
        } //lockPlatform

    this.releaseLock = function(specialLogger, callback) {
            var mylogger = (specialLogger ? specialLogger : logger);
            var plat = this;
            var platid = plat.params.platid;
            mylogger.info("Try to release lock on platform " + prefix + platid);
            Common.redisClient.del('lock_' + 'platform_' + platid, function(err, reply) {
                if (err) {
                    mylogger.info("Error in release lock on platform " + prefix + platid + " ,err: " + err);
                    callback(err);
                    return;
                }
                if (reply == 1) {
                    mylogger.info("*********Lock Released on platform " + prefix + platid);
                } else {
                    mylogger.info("Lock not found on platform " + prefix + platid + ", reply: " + reply);
                }
                callback(null);
            }); // Common.redisClient.SETNX
        } //releaseLock

    this.addToRunningPlatforms = function(callback) {
        var platid = this.params.platid;
        var platDomain = this.params.domain;
        var platform = this;
        var multi = Common.getRedisMulti();

        multi.srem(prefix + 'platforms_idle_' + platDomain, platid);
        multi.zadd(prefix + 'platforms_' + platDomain, 0, platid);

        multi.srem(prefix + 'platforms_idle', platid);
        multi.zadd(prefix + 'platforms', 0, platid);
        multi.exec(function(err, replies) {
            if (err) {
                callback(err);
                return;
            }

            var mailOptions = {
                from: Common.emailSender.senderEmail, // sender address
                fromname: Common.emailSender.senderName,
                to: Common.adminEmail, // list of receivers
                toname: Common.adminName,
                subject: (Common.dcName != "" ? Common.dcName + " - " : "") + "Platform added to running platform list", // Subject line
                text: 'Platform details: ' + JSON.stringify(platform.params, null, 2)
            };
            Common.mailer.send(mailOptions, function(success, message) {}); //Common.mailer.send
            callback(null);
        });
    }; // this.addToRunningPlatforms

    this.addToErrorPlatforms = function(callback, silent, connectionError,revive) {
        var platid = this.params.platid;
        var platform = this;
        var platDomain = this.params.domain;
        var alreadyErr = false;

        async.waterfall([
            function(callback) {
                Common.redisClient.zscore('platforms', platid, function(err, reply) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    var score = reply ? reply : 0;
                    callback(null, score);
                });
            },
            function(score, callback) {
                var multi = Common.getRedisMulti();

                multi.srem('platforms_idle_' + platDomain, platid);
                multi.zrem('platforms_' + platDomain, platid);
                multi.zadd('platforms_errs_' + platDomain, score, platid);

                multi.srem('platforms_idle', platid);
                multi.zrem('platforms', platid);
                multi.zadd('platforms_errs', score, platid);

                multi.hset('platform_' + platid, 'errorset', 'true');
                if (connectionError) {
                    multi.hset('platform_' + platid, 'connection_error', 'true');
                }
                if (revive) {
                    multi.hset('platform_' + platid, 'revive', 'true');
                }

                multi.exec(function(err, replies) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    // check if redis operations actually change something
                    if (replies && replies[3] == 0 &&  replies[4] == 0 && replies[5] == 0) {
                        logger.info("Platform "+platid+" is already in error state.");
                        alreadyErr = true;
                    }
                    Common.redisClient.publish("platformChannel", "refresh");
                    callback(null);
                });
            }
        ], function(err) {


            if (!silent && !alreadyErr) {
                var mailOptions = {
                    from: Common.emailSender.senderEmail, // sender address
                    fromname: Common.emailSender.senderName,
                    to: Common.adminEmail, // list of receivers
                    toname: Common.adminName,
                    subject: (Common.dcName != "" ? Common.dcName + " - " : "") + "Platform "+platid+" removed from running platform list", // Subject line
                    text: 'Platform details: ' + JSON.stringify(platform.params, null, 2)
                };
                Common.mailer.send(mailOptions, function(success, message) {}); //Common.mailer.send
            }

            if (err) {
                logger.error("addToErrorPlatforms: " + err);
            } else if (!alreadyErr) {
                logger.info("addToErrorPlatforms: Platform " + platid + " moved to errs list");
                if (Common.immediatelyClosePlatformAfterError == true && !revive) {
                    logger.info("addToErrorPlatforms: immediately close platform after error.");
                    platform.addToClosePlatforms(callback);
                    return;
                }
            }

            callback(null);
            return;
        });
    }; // this.addToErrorPlatforms

    this.addToClosePlatforms = function(callback) {

        var platid = this.params.platid;
        var platDomain = this.params.domain;
        var multi = Common.getRedisMulti();

        multi.zrem('platforms_' + platDomain, platid);
        multi.zrem('platforms_errs_' + platDomain, platid);
        multi.srem('platforms_idle_' + platDomain, platid);

        multi.zrem('platforms', platid);
        multi.zrem('platforms_errs', platid);
        multi.srem('platforms_idle', platid);

        multi.sadd('platforms_close', platid);
        multi.exec(function(err, replies) {
            if (err) {
                logger.error("addToClosePlatforms: " + err);
                callback(err);
                return;
            }
            if (replies && replies[3] == 0 &&  replies[4] == 0 && replies[5] == 0 && replies[6] == 0) {
                logger.info("Platform "+platid+" is already in close state.");
            } else {
                logger.info("addToClosePlatforms: platform " + platid + " moved to close list");
                Common.redisClient.publish("platformChannel", "close");
            }
            callback(null);
            return;
        });
    };

    this.increaseFails = function(callback) {
        Common.redisClient.zincrby("platforms_fails", 1, this.params.platid, callback);
    }

    this.resetFails = function(callback) {
        Common.redisClient.zrem("platforms_fails", this.params.platid, callback);
    }

    // increase (decrece) refernce to number of sessions in platform
    this.increaseReference = function(inc, callback) {
        var platid = this.params.platid;
        var platDomain = this.params.domain;

        var platDomainList = (this.params.errorset === 'true') ? 'platforms_errs_' + platDomain : 'platforms_' + platDomain;
        var platList = (this.params.errorset === 'true') ? 'platforms_errs' : 'platforms';
        Common.redisClient.zincrby(platList, inc, platid, function(err) {
            if (err) {
                var msg = "Error on set updatePlatformReference: " + err;
                callback(msg);
                return;
            }

            Common.redisClient.zincrby(platDomainList, inc, platid, function(err) {
                if (err) {
                    var msg = "Error on set updatePlatformReference: " + err;
                    callback(msg);
                    return;
                }


                callback(null);
            });

        });
    }

    var doPlatformRequest = function(options, arg2, arg3) {
        options.host = self.params.platform_ip;
        if (Common.platformHttp) {
            options.port = 3333;
        } else {
            options.port = 3334;
            options._protocol = "https";
            options.rejectUnauthorized = false;
        }
        if (!options.headers) {
            options.headers = {};
        }
        options.headers['Jwt-Token'] = jwt.sign({ path: options.path }, Common.platformKey, { algorithm: 'RS256'});
        if (options.timeout === undefined) options.timeout = 25000; //ms
        if (Common.platformCred) {
            updateRequestOptionsWithCertsForPlatform(options);
        }
        //logger.info(`doPlatformRequest. options: ${JSON.stringify(options,null,2)}`);
        //console.log(new Error());
        if (options.method === "GET") {
            http.doGetRequest(options, function(err, data) {
                if (err) {
                    logger.error("Cannot connect to platform " + self.params.platid + ", err: " + err); // Keep this log

                }
                arg2(err, data);
            });
        } else if (options.method === "POST") {
            http.doPostRequest(options, arg2, function(err, data) {
                if (err) {
                    logger.error("Cannot connect to platform " + self.params.platid + ", err: " + err); // Keep this log
                }
                arg3(err, data);
            });
        } else {
            logger.error("Unsupport request type: " + JSON.stringify(options));
            return;
        }
    }

    this.testServiceRun = function(callback) {
        var options = {
            host: self.params.platform_ip,
            port: 3333,
            path: "/",
            method: "GET",
            dataTimeout: 10 * 1000
        };
        if (Common.platformCred) {
            updateRequestOptionsWithCertsForPlatform(options);
        }

        doPlatformRequest(options, function(err, resData) {
            if (err) {
                callback(err);
            } else {
                if (resData === "OK") {
                    logger.debug("service on linux running");
                    callback(null);
                } else {
                    callback("invalid response");
                }
            }
        });
    };

    this.waitServiceRun = function(timeout, callback) {
        var timeoutFlag = false;
        logger.debug("Waiting upto " + timeout + " seconds for service on linux...");
        var timeoutObj = setTimeout((function() {
            timeoutFlag = true;
        }), timeout * 1000); // setTimeout
        var connectionFlag = false;
        async.whilst(
            function() { return !(timeoutFlag || connectionFlag); },
            function(callback) {
                self.testServiceRun(function(err) {
                    if (err) {
                        setTimeout(callback, 1000);
                    } else {
                        clearTimeout(timeoutObj);
                        connectionFlag = true;
                        callback(null);
                    }
                });
            },
            function(err) {
                if (connectionFlag) {
                    callback(null);
                } else {
                    callback("timeout");
                }
            }
        );
    }

    this.startPlatform = function(descPlatform, callback) {
        var postData = JSON.stringify(descPlatform);
        var options = {
            path: "/startPlatform",
            method: "POST",
            dataTimeout: 10 * 60 * 1000, //10 minutes timeout for startPlatform request
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': postData.length
            }
        };

        console.log(`startPlatform: doPlatformRequest`);
        doPlatformRequest(options, postData, function(err, resData) {
            console.log(`startPlatform: doPlatformRequest response: ${err}`);
            if (err) {
                callback(err);
            } else {
                var resObj = {};
                try {
                    resObj = JSON.parse(resData);
                } catch (e) {
                    logger.error("startPlatform. Invalid responce from platform on startPlatform: " + resData+", postData: "+JSON.stringify(postData,null,2));
                }
                if (resObj.status === 1)
                    callback(null, resObj);
                else
                    callback("Request return error " + resData);
            }
        });
    };

    this.sendKillPlatform = function(descPlatform, callback) {

        let postData = JSON.stringify({
            platid: descPlatform.platid,
            platUID: descPlatform.platUID
        });
        var options = {
            path: "/killPlatform",
            method: "POST",
            dataTimeout: 1 * 60 * 1000, //1 minute timeout for startPlatform request
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': postData.length
            }
        };

        doPlatformRequest(options, postData, function(err, resData) {
            if (err) {
                callback(err);
            } else {
                var resObj = {};
                try {
                    resObj = JSON.parse(resData);
                } catch (e) {
                    logger.error(new Error("Invalid responce from platform on startPlatform: " + resData));
                }
                if (resObj.status === 1)
                    callback(null, resObj);
                else
                    callback(new Error("Request return error " + resData));
            }
        });
    };

    this.testStartPlatform = function(callback) {
        var options = {
            path: "/startPlatform",
            method: "GET",
            dataTimeout: 10 * 1000
        };

        doPlatformRequest(options, function(err, resData) {
            if (err) {
                logger.error('problem with request: ' + err);
                callback(err);
            } else {
                var resObj = {};
                try {
                    resObj = JSON.parse(resData);
                } catch (e) {
                    logger.error("testStartPlatform. Invalid responce from platform on startPlatform: " + resData);
                }
                if (resObj.status === 1)
                    callback(null, resObj);
                else
                    callback("Request return error", resObj);
            }
        });
    };

    this.attachUser = function(session, timeZone, callback) {
        var logger = session.logger;
        var nfs = session.nfs || {
            params: {
                nfs_ip: "192.168.122.1",
                nfs_path: Common.nfshomefolder
            }
        };
        logger.info("attachUser...");
        let firewall;

        async.waterfall([
            // install apps
            function(callback) {
                if (!Common.isMobile() || Common.platformType == "docker") {
                    callback(null);
                    return;
                }
                Common.getMobile().appMgmt.installUserAppsToPlatform(
                    session.login.loginParams.email,
                    session.login.loginParams.deviceID,
                    self,callback
                );
            },
            // get firewall rules
            function(callback) {
                if (!Common.isDesktop() || !Common.isEnterpriseEdition()) {
                    callback(null);
                    return;
                }
                Common.getEnterprise().firewall.getFirewallRulesForUser(session.login.loginParams.email,session.login.loginParams.mainDomain)
                    .then( firewallObj => {
                        firewall = firewallObj;
                        callback(null);
                    }). catch (err => {
                        logger.error(`getFirewallRulesForUser error: ${err}`,err);
                        callback(null);
                    })
            },
            // get mounts
            function(callback) {
                //logger.info("Starting get mounts...");
                if (Common.mounts) {
                    var UserUtilsModule = require('./userUtils.js');
                    //logger.info("attachUser. getUserPass... email: "+session.login.loginParams.email);
                    UserUtilsModule.getUserPass(session.login.loginParams.email , function(err,userObj){
                        if (err || !userObj) {
                            callback(null,[]);
                            return;
                        } else {
                            var mounts = [];
                            Common.mounts.forEach(function(mountsrc){
                                var mount = _.pick(mountsrc, "folder", "type" , "domain" , "serverIP" , "shareName","nomediaParent");
                                mount.orgUser = userObj.username;
                                mount.orgPassword = userObj.password;
                                mount.shareName =  mount.shareName.replace("$USER$", userObj.username);
                                mounts.push(mount);
                            });
                            callback(null,mounts);
                        }
                    });
                } else {
                    callback(null,[]);
                }
            },
            function(mounts,callback) {
                //logger.info("Starting doPlatformRequest...");
                var postObj = {
                    login: _.pick(session.login.loginParams, "userName", "email", "lang", "countrylang", "localevar", "deviceType"),
                    session: _.pick(session.params, "email", "deviceid","appName","docker_image","audioStreamParams","platid","recording","recording_path"),
                    nfs: _.pick(nfs.params, "nfs_ip", "nfs_path", "nfs_path_slow"),
                    timeZone: timeZone,
                    mounts: mounts,
                    firewall,
                    //xml_file_content: session.xml_file_content
                };
                if (Common.platformSettings && Common.isMobile() && Common.platformType == "docker") {
                    postObj.platformSettings = Common.platformSettings;
                }
                var postData = JSON.stringify(postObj);
                //logger.info(`attachUser. postData: ${postData}`);
                logger.info(`Attach user: ${session.params.email} ${session.params.deviceid}`);
                var options = {
                    path: "/attachUser",
                    method: "POST",
                    dataTimeout: 300 * 1000,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Content-Length': postData.length
                    },
                };
                doPlatformRequest(options, postData, function(err, resData) {
                    if (err) {
                        logger.error('problem with request: ' + err);
                        callback(err, {
                            addToErrorsPlatforms: true
                        });
                    } else {
                        var resObj = {};
                        try {
                            resObj = JSON.parse(resData);
                            logger.info(`resObj: ${JSON.stringify(resObj,null,2)}`);
                        } catch (e) {
                            logger.error("Invalid responce from platform on attachUser: " + resData);
                        }
                        if (resObj.status === 1)
                            callback(null, resObj);
                        else
                            callback("Request return error " + resData);
                    }
                });
            }
        ], function(err, result) {
            callback(err,result);
        });





    };

    this.detachUser = function(session, callback) {
        var UNum = session.params.localid;
        var logger = session.logger;

        var options = {
            path: "/detachUser?unum=" + UNum,
            method: "GET",
            dataTimeout: 10 * 30 * 1000 // 10 minutes
        };

        doPlatformRequest(options, function(err, resData) {
            if (err) {
                logger.error('problem with request: ' + err);
                callback(err, {
                    addToErrorsPlatforms: true
                });
            } else {
                var resObj = {};
                try {
                    resObj = JSON.parse(resData);
                } catch (e) {
                    logger.error("Invalid responce from platform on detachUser: " + resData);
                }
                if (resObj.status === 1)
                    callback(null);
                else
                    callback("Request return error " + resData);
            }
        });
    };



    this.installApk = function(obj, callback) {
        var options = {
            path: "/installApk?apk=" + encodeURIComponent(obj.path),
            method: "GET",
            dataTimeout: 90 * 1000
        };

        doPlatformRequest(options, function(err, resData) {
            if (err) {
                logger.error('problem with request: ' + err);
                callback(err, {
                    addToErrorsPlatforms: true
                });
            } else {
                var resObj = {};
                try {
                    resObj = JSON.parse(resData);
                } catch (e) {
                    logger.error("Invalid responce from platform on installApk: " + resData);
                }
                if (resObj.status === 1)
                    callback(null);
                else
                    callback("Request return error " + resData);
            }
        });
    };

    this.attachApps = function(tasks, callback) {
        let plat = this;
        var postData = JSON.stringify({
            tasks: tasks
        });
        var options = {
            path: "/attachApps",
            method: "POST",
            dataTimeout: 30 * 1000,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': postData.length
            },
        };

        doPlatformRequest(options, postData, function(err, resData) {
            if (err) {
                logger.error('problem with request: ' + err);
                callback(err, {
                    addToErrorsPlatforms: true
                });
            } else {
                var resObj = {};
                try {
                    resObj = JSON.parse(resData);
                } catch (e) {
                    logger.error("Invalid responce from platform on attachApps: " + resData);
                }
                if (resObj.status === 1)
                    callback(null, resObj);
                else {
                    if (typeof resData === 'string' && resData.indexOf("INSTALL_FAILED_INSUFFICIENT_STORAGE") >= 0) {
                        // mark the session so nubo will try to add storage after session close
                        if (tasks.length = 1) {
                            sessionModule.getSessionFromPlatformReference(plat.params.platid,tasks[0].unum,function(err,sess) {
                                if (!err && sess) {
                                    logger.info(`Mark session to increase storage. sessid: ${sess.params.sessid}`);
                                    sess.setParam("inc_storage","1",function(err) {});
                                }
                            });
                        }
                    }
                    callback("Request return error " + resData);
                }
            }
        });
    };

    this.receiveSMS = function(to,from,text,localid,callback) {

        var pdu = require('node-pdu');
        var Deliver = pdu.Deliver();
        Deliver.setAddress(from);
        Deliver.setData(text);
        var parts = Deliver.getParts();
        var pduStr = '';

        parts.forEach(function (part) {
            logger.info("Part: "+part.toString());
            pduStr += part.toString();
        });
        var postData = JSON.stringify({
            to: to,
            from: from,
            text: text,
            localid: localid,
            pdu: pduStr
        });
        var options = {
            path: "/receiveSMS",
            method: "POST",
            dataTimeout: 30 * 1000,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            },
        };
        logger.info("receiveSMS. postData: "+postData);
        doPlatformRequest(options, postData, function(err, resData) {
            if (err) {
                logger.error('problem with request: ' + err);
                callback(err);
            } else {
                var resObj = {};
                try {
                    resObj = JSON.parse(resData);
                } catch (e) {
                    logger.error("Invalid responce from platform on receiveSMS: " + resData);
                }
                if (resObj.status === 1)
                    callback(null);
                else
                    callback("Request return error: " + resData);
            }
        });
    };

    this.declineCall = function(localid,callback) {
        var postData = JSON.stringify({
            localid: localid
        });
        var options = {
            path: "/declineCall",
            method: "POST",
            dataTimeout: 30 * 1000,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            },
        };
        logger.info("declineCall. postData: "+postData);
        doPlatformRequest(options, postData, function(err, resData) {
            if (err) {
                logger.error('problem with request: ' + err);
                callback(err);
            } else {
                var resObj = {};
                try {
                    resObj = JSON.parse(resData);
                } catch (e) {
                    logger.error("Invalid responce from platform on declineCall: " + resData);
                }
                if (resObj.status === 1)
                    callback(null);
                else
                    callback("Request return error: " + resData);
            }
        });
    };

    this.getPackagesList = function(filter, callback) {
        var path = "/getPackagesList";
        if (typeof filter === 'function') callback = filter;
        else path += "?filter=" + encodeURIComponent(filter);
        var options = {
            path: path,
            method: "GET",
            dataTimeout: 30 * 1000
        };

        doPlatformRequest(options, function(err, resData) {
            if (err) {
                logger.error('problem with request: ' + err);
                callback(err, {
                    addToErrorsPlatforms: true
                });
            } else {
                var resObj = {};
                try {
                    //logger.info("getPackagesList: "+resData);
                    resObj = JSON.parse(resData);
                } catch (e) {
                    logger.error("Invalid responce from platform on getPackagesList: " + resData);
                }
                if (resObj.status === 1)
                    callback(null, resObj.data);
                else
                    callback("Request return error " + resData);
            }
        });
    };

    this.refreshMedia = function(unum, paths, callback) {
        var postObj = {
            unum: unum,
            paths: paths
        };
        var postData = JSON.stringify(postObj);
        var options = {
            path: "/refreshMedia",
            method: "POST",
            dataTimeout: 30 * 1000,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': postData.length
            },
        };

        doPlatformRequest(options, postData, function(err, resData) {
            if (err) {
                logger.error('problem with request: ' + err);
                callback(err, {
                    addToErrorsPlatforms: true
                });
            } else {
                var resObj = {};
                try {
                    resObj = JSON.parse(resData);
                } catch (e) {
                    logger.error("Invalid responce from platform on refreshMedia: " + resData);
                }
                if (resObj.status === 1)
                    callback(null, resObj);
                else
                    callback("Request return error " + resData);
            }
        });
    };

    this.applyFirewall = function(tasks, callback) {
        if (tasks.length === 0) {
            return callback(null);
        }

        var postData = JSON.stringify({
            tasks: tasks
        });
        var options = {
            path: "/applyFirewall",
            method: "POST",
            dataTimeout: 30 * 1000,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': postData.length
            },
        };

        doPlatformRequest(options, postData, function(err, resData) {
            var resObj;
            if (err) {
                logger.error('problem with request: ' + err);
                callback(err);
            } else {
                try {
                    resObj = JSON.parse(resData);
                } catch (e) {
                    logger.error("bad response on applyFirewall: " + resData);
                    resObj = {};
                }
                if (resObj.status === 1) {
                    callback(null, resObj);
                } else {
                    callback("Request return error: " + resData, resObj);
                }
            }
        });
    };

    this.createNewUserTarGz = function(callback) {
        var options = {
            path: "/createNewUserTarGz",
            method: "GET",
            dataTimeout: 30 * 1000
        };

        doPlatformRequest(options, function(err, resData) {
            var resObj;
            if (err) {
                callback(err);
                return;
            }

            try {
                resObj = JSON.parse(resData);
            } catch (e) {
                callback("bad response on createNewUserTarGz: " + resData);
                return;
            }

            if (resObj.status === 1) {
                callback(null, resObj);
            } else if (resObj.status === 0) {
                callback(resObj.message);
            } else {
                callback("unknown status code");
            }
        });
    };


    this.checkPlatform = function(callback) {
        var options = {
            path: "/checkPlatform",
            method: "GET",
            dataTimeout: 25 * 1000
        };
        let plat = this;

        doPlatformRequest(options, function(err, resData) {
            var resObj = null;
            var error = null;
            try {
                if (err) {
                    error = err;
                    return;
                }

                try {
                    resObj = JSON.parse(resData);
                } catch (e) {
                    //callback("bad response on checkPlatform: " + resData);
                    logger.error("Check platform error. bad response on checkPlatform: " + resData,e);
                    error = new Error("bad response on checkPlatform: " + resData);
                    return;
                }

                // logger.info(`checkPlatform: ${JSON.stringify(resObj,null,2)}`);

                if (resObj.status === 1) {
                    if (resObj.performance && resObj.performance.mem) {
                        plat.params.memTotal = resObj.performance.mem.total;
                        plat.params.memActive = resObj.performance.mem.active;
                        plat.params.memAvailable = resObj.performance.mem.available;
                    }
                    if (resObj.performance && resObj.performance.currentLoad) {
                        plat.params.currentLoad = resObj.performance.currentLoad.currentLoad;
                    }

                } else if (resObj.status === 0) {
                    logger.error("Check platform error. status: "+resObj.status+", msg: "+resObj.msg);
                    error = new Error(resObj.msg);
                    //callback(new Error(resObj.msg));
                } else {
                    logger.error("Check platform error. unknown status code. status: "+resObj.status+", msg: "+resObj.msg+", resData: "+resData);
                    error = new Error("unknown status code")
                    //callback("unknown status code");
                }
            } finally {
                plat.params.lastCheckTime = new Date().toISOString();
                plat.params.lastCheckStatus = (error ? "error" : "ok");
                plat.params.lastCheckMsg = (resObj ? resObj.msg : error.message);
                plat.save(err => {
                    if (resObj.sessions) {
                        require('./cleaner').checkAndCleanPlatformSessions(plat,resObj.sessions).then(() => {
                            // logger.info("checkAndCleanPlatformSessions finished");
                        }).catch(err => {
                            logger.error("checkAndCleanPlatformSessions error",err);
                        });
                    }
                    callback(error, resObj);
                });
            }
        });
    };

    this.connectToVpn = function(vpnType, userLocalId, callback) {
        var postData = JSON.stringify({
            vpnType: vpnType,
            userId: userLocalId
        });
        var options = {
            path: "/connectToVpn",
            method: "POST",
            dataTimeout: 30 * 1000,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': postData.length
            },
        };

        doPlatformRequest(options, postData, function(err, resData) {
            var resObj;
            if (err) {
                logger.error('connectToVpn: request failed: ' + err);
                callback(err);
            } else {
                try {
                    resObj = JSON.parse(resData);
                } catch (e) {
                    logger.error("connectToVpn: failed parsing response: " + resData);
                    callback("failed parsing response");
                    return;
                }

                if (resObj.status === 1) {
                    callback(null);
                } else {
                    logger.error("connectToVpn: got error response: " + resData);
                    callback("got error response");
                }
            }
        });
    };

    this.setVpnState = function(state, callback) {

        Common.redisClient.hset('platform_' + this.params.platid, "vpn_state", state, function(err, obj) {
            if (err) {
                logger.err("setVpnState: " + err);
                callback(err);
                return;
            }

            callback(null);
        });
    }


    // this.configLegacyVpnRules = function(callback) {

    //     var options = {
    //         path: "/configLegacyVpnRules",
    //         method: "GET"
    //     };

    // };

    if (platid == null) { // generate new platform
        (function(plat) {

            function getPlatID(callback) {
                if (newplatid) {
                    callback(null, newplatid);
                    return;
                } else {
                    Common.redisClient.incr(prefix + 'platformseq', function(err, reply) {
                        if (err) {
                            logger.info("err:" + err);
                            if (callback) callback(err, 0);
                            return;
                        }
                        callback(null, reply);
                        return;
                    }); // INCR
                }
            }
            getPlatID(function(err, reply) {
                if (err) {
                    if (callback) callback(err, plat);
                    return;
                }
                console.log('platid=' + reply);
                //Common.redisClient.ZADD('platforms',0,reply,function(err,reply){
                //});
                plat.params.platid = reply;
                var buf = Common.crypto.randomBytes(48);
                plat.params.platUID = buf.toString('hex');
                plat.save(callback);
            });


        })(this); //function (plat)


    } else { // load an existing platform
        (function(plat) {
            var reply = Common.redisClient.hgetall('platform_' + plat.params.platid, function(err, obj) {
                //console.dir(obj);
                if (err) {
                    logger.info("err:" + err);
                    callback(err, plat);
                    return;
                }
                if (obj != null) {
                    plat.params = obj;
                    callback(err, plat);
                    return;
                } else {
                    logger.info("Cannot find platform " + plat.params.platid);
                    callback("Cannot find platform " + plat.params.platid, null);
                    return;
                }
            }); //hgetall
        })(this); // function (sess)
    } // else // load an existing session
};

var DeleteAll = function(platType) {
    var prefix = (platType ? platType + "_" : "");
    Common.redisClient.zrange(prefix + 'platforms', 0, -1, function(err, replies) {
        console.log(replies.length + " replies:");
        replies.forEach(function(reply, i) {
            console.log("    " + i + ": " + reply);
            new Platform(reply, platType, function(err, platObj) {
                if (err) {
                    console.log("Error: " + err);
                    return;
                }
                console.log('Platform: ' + JSON.stringify(platObj.params, null, 2));
                deletePlatform(platObj, function(err, obj) {
                    if (err) {
                        console.log("Error: " + err);
                        return;
                    }
                });
            });
        });
    });
};

/**
 *  getAvailablePlatform
 *	Found the least loaded platform to start a new session in
 * @returns {}
 */
var getAvailablePlatform = function(platType, dedicatedPlatID, domain, logger, callback) {
    var prefix = (platType ? platType + "_" : "");
    var lock = null;
    var platid = null;

    if (!dedicatedPlatID) {
        async.waterfall([
            function(callback) {
                Common.redisClient.zcard(prefix + 'platforms_' + domain, callback);
            },
            function(nPlatfrorms, callback) {
                // Connect to platforms with less users.
                // Choose platform from half of exist platforms with less users, but no more that 10 possible platforms
                var front = Math.min(Common.platformParams.choosePool, Math.ceil(nPlatfrorms / 2));
                var method;
                if (Common.platformParams.cleanPlatformsMode) {
                    Common.redisClient.zrevrangebyscore(
                        prefix + 'platforms_' + domain, '(' + Common.platformParams.usersPerPlatform, '-inf',
                        "LIMIT", 0, front,
                        function(err, replies) {
                            callback(err, replies)
                        }
                    );
                } else {
                    Common.redisClient.zrangebyscore(
                        prefix + 'platforms_' + domain, '-inf', '(' + Common.platformParams.usersPerPlatform,
                        "LIMIT", 0, front,
                        function(err, replies) {
                            callback(err, replies)
                        }
                    );
                }
            },
            function(platIds, callback) {
                if (!platIds.length) {
                    callback("Empty pool");
                    return;
                }
                if (platType === "ex") {
                    var platId = platIds[Math.floor(Math.random() * platIds.length)];
                    callback(null, platId);
                } else {
                    // Pass platform one-by-one and try lock some
                    async.detectSeries(platIds, function(platId, callback) {
                        lock = new Lock({
                            key: 'lock_platform_' + platId,
                            logger: logger,
                            numOfRetries: 60, // wait for 30 seconds max
                            waitInterval: 500,
                            lockTimeout: 1000 * 60 * 5 // 5 minutes
                        });

                        lock.acquire(function(err, replay) {
                            if (err || !replay) {
                                callback(false);
                                return;
                            }
                            platid = platId;
                            callback(true);
                        });
                    }, function(found) {
                        if (found)
                            callback(null, platid);
                        else
                            callback("cannot lock any platform");
                    });
                }
            },
            function(platId, callback) {
                new Platform(platId, platType, function(err, obj) {
                    if (err) {
                        callback("Platform load error", null);
                        return;
                    }
                    callback(null, obj);
                });
            },
            function(platobj, callback) {
                platobj.increaseReference(1, function(err) {
                    callback(err, platobj);
                });
            }
        ], function(err, platobj) {
            if (err) {
                logger.error("getAvailablePlatform: " + err);
                if (lock && lock.isAquired()) {
                    lock.release(function(lockErr, replay) {
                        callback(err);
                    });
                } else {
                    callback(err);
                }
            } else {
                callback(null, platobj, lock);
            }
        });
    } else {
        async.waterfall([
            function(callback) {
                lock = new Lock({
                    key: 'lock_platform_' + dedicatedPlatID,
                    logger: logger,
                    numberOfRetries: 60,
                    waitInterval: 500,
                    lockTimeout: 1000 * 60 * 5 // 5 minutes
                });

                lock.acquire(function(err, replay) {
                    if (err) {
                        callback(err);
                    } else if (!replay) {
                        callback('couldn\'t lock dedicated platform ID');
                    } else {
                        callback(null, dedicatedPlatID);
                    }
                });
            },
            function(platId, callback) {
                new Platform(platId, platType, function(err, obj) {
                    if (err) {
                        callback("Platform load error", null);
                        return;
                    }
                    callback(null, obj);
                });
            }
        ], function(err, platobj) {
            if (err) {
                logger.error("getAvailablePlatform: " + err);
                if (lock && lock.isAquired()) {
                    lock.release(function(lockErr, replay) {
                        callback(err);
                        return;
                    });
                }
                callback(err);
            } else {
                callback(null, platobj, lock);
            }
        });
    }
}
let killInProcess = {};
var killPlatform = function(platid, platType, callback) {
    var platform = null;
    var timeLog = new TimeLog(logger);
    var errorToMail = "";
    if (killInProcess[platid] == true) {
        logger.info("killPlatform. Platform "+platid+" kill is already in process");
        if (callback) callback(null);
        return;
    }
    killInProcess[platid] = 1;
    logger.info("killPlatform. Starting to kill platform "+platid);

    async.series([
        // load platform
        function(callback) {
            new Platform(platid, platType, function(err, obj) {
                if (err || !obj) {
                    var msg = "killPlatform: Platform " + platid + " does not exist. err: " + err;
                    errorToMail = msg + "\n";
                    logger.error(msg);
                    callback(null);
                    return;
                }

                platform = obj;
                callback(null);
            });
        },
        // move all sessions of this platform to suspend
        function(callback) {
            var sessionsExist = true;
            async.whilst(
                function() {
                    return (sessionsExist);
                },
                function(callback) {
                    Common.redisClient.smembers('platsesslist_' + platid, function(err, sessions) {
                        if (err) {
                            var msg = "killPlatform: couldn't get session list of platform " + platid + " err: " + err;
                            errorToMail += msg + "\n";
                            logger.error(msg);
                            callback(err);
                            return;
                        }
                        if (!sessions || sessions.length == 0) {
                            sessionsExist = false;
                            callback(null);
                            return;
                        }
                        logger.info("killPlatform. Waiting for "+sessions.length+" session to end.");

                        async.eachSeries(sessions, function(sessionID, cb) {
                            new Session(sessionID, function(err, session) {
                                if (err) {
                                    logger.error("killPlatform. load Session error. sessionID: "+ sessionID+", err: "+ err);
                                    cb(err);
                                    return;
                                }
                                if (session.params.forceExit == 1 || session.params.deleteFlag == 1 || session.params.deleteError == 1) {
                                    logger.error("killPlatform. session is already in forceExit/deleteFlag/deleteError. sessionID: "+ sessionID);
                                    //cb(null);
                                    //return;
                                }

                                session.forceExit(function(err) {
                                    if (err) {
                                        logger.error("killPlatform: " + err);
                                        cb(err);
                                        return;
                                    }

                                    cb(null);
                                });
                            });
                        }, function(err) {
                            if (err) {
                                callback(err);
                                return;
                            }
                            setTimeout(function() {
                                //waiting for all sessions to exit gracefully
                                callback(null);
                            }, 10000);
                        });
                    });
                }, function(err) {
                    logger.info("Finished waiting for session");
                    callback(err);
                });
        },
        // function(callback) {

        //     var lock = new Lock({
        //         key: 'lock_gateway_' + platform.params.gatewayid,
        //         logger: logger,
        //         numberOfRetries: 30,
        //         waitInterval: 500,
        //         lockTimeout: 1000 * 60 // 1 minute
        //     });

        //     lock.cs(function(callback) {
        //         gatewayModule.removePlatFromGW({
        //             index: platform.params.gatewayid
        //         }, platid, callback);
        //     }, function(err) {
        //         if (err) {
        //             logger.warn("killPlatform: " + err);
        //         }
        //         callback(null);
        //     });
        // },
        // kill emulator process
        function(callback) {
            if (!platformTypeModules[Common.platformType]) {
                var msg = "Platform type not found: "+Common.platformType;
                errorToMail += msg + "\n";
                logger.error(msg);
                callback(null);
                return;
            }

            if (platform != null) {
                logger.info("Running stop_platform....");
                platformTypeModules[Common.platformType].stop_platform(
                    platform, platType,
                    function(err, obj) {
                        if (err) {
                            var msg = "killPlatform: couldn't stop platform " + platid + " err: " + err;
                            errorToMail += msg + "\n";
                            logger.error(msg);
                            callback(null);

                        } else {
                            platform = obj;
                            callback(null);
                        }
                    }
                );
            } else {
                callback(null);
            }
        },
        // delete platform
        function(callback) {
            var plat = platform;
            if(!plat || typeof platform !== "object") plat = {};
            if(typeof plat.params !== "object") plat.params = {};
            if(plat.params.platid === undefined) plat.params.platid = platid;
            if(plat.params.domain === undefined) plat.params.domain = "common";
            deletePlatform(plat, function(err) {
                if (err) {
                    var msg = "killPlatform: error deleting platform " + platid;
                    errorToMail += msg + "\n";
                    callback(null);
                    return;
                }
                callback(null);
            });
        }
    ], function(err, results) {
        timeLog.logTime("killPlatform");
        killInProcess[platid] = 0;
        if (errorToMail) {
            logger.error("killPlatform: error removing platform " + platid);
        } else {
            logger.info("killPlatform: platform " + platid + " removed successfully");
        }

        if (platform != null && Common.sendPlatformStatusToAdmin) {
            var mailOptions = {
                from: Common.emailSender.senderEmail, // sender address
                fromname: Common.emailSender.senderName,
                to: Common.adminEmail, // list of receivers
                toname: Common.adminName,
                subject: (Common.dcName != "" ? Common.dcName + " - " : "") + (!errorToMail ? "Platform " + platid + " deleted successfully" : "Platform " + platid + " deleted "), // Subject line
                text: (errorToMail ? 'Platform delete error: ' + errorToMail : '') + '\nPlatform details: ' + JSON.stringify(platform.params, null, 2)
            }
            Common.mailer.send(mailOptions, function(success, message) {}); //Common.mailer.send
        }
        if (callback)
            callback(errorToMail);
    });
}

var registerPlatformNum = function(_opts, callbackMain) {

    var opts = {};
    var maxFailed = isNaN(Common.platformParams.maxFailed) ? 10 : Common.platformParams.maxFailed;
    opts.min = _opts.min || Common.startPlatformNum;
    opts.max = _opts.max || (Common.startPlatformNum + Common.platformParams.maxCapacity / Common.platformParams.usersPerPlatform - 1 + maxFailed);
    //opts.min//allow upto 10 in bad states
    opts.hostline = (_opts.hostline === undefined) ? Common.hostline : _opts.hostline;
    opts.platType = _opts.platType || "";
    var logger = _opts.logger || Common.logger;
    var dedicatedDomain;
    var platID;
    let callbackCalled = false;

    if (_opts.domain) {
        dedicatedDomain = _opts.domain;
    } else {
        dedicatedDomain = 'common';
    }

    async.series([
        function(callback) {
            if (dedicatedDomain === 'common') {
                callback(null);
                return;
            }

            Common.db.Orgs.findAll({
                attributes: ['maindomain'],
                where: {
                    maindomain: dedicatedDomain,
                    dedicatedplatform: 1
                }
            }).complete(function(err, results) {
                if (!!err) {
                    callback(err);
                    return;
                }

                if (results.length === 0) {
                    callback("dedicated platform for domain \'" + dedicatedDomain + "\' isn\'t allowed");
                    return;
                }

                callback(null);
            });
        },
        function(callback) {
            findAvaliblePlatform(opts, dedicatedDomain, function(err, platId) {
                if (err) {
                    callback(err);
                    return;
                }

                platID = platId;
                callback(null);
            });
        },
        function(callback) {
            if (_opts.runInBackground) {
                callbackCalled = true;
                callbackMain();
            }
            registerPlatform(platID, opts.hostline, opts.platType, dedicatedDomain, callback);
        }
    ], function(err) {
        if (_opts.onFinish) {
            _opts.onFinish(err);
        }
        if (err) {
            logger.error("registerPlatformNum: " + err);
            if (!callbackCalled) {
                callbackMain(err);
            }
            return;
        }
        if (!callbackCalled) {
            callbackMain(null);
        }
    });

}

/**
 * Get array of all avaialble platform numbers
 */
async function getAllPlatformNumbers() {

    if (Common.platformParams['poolStrategy'] == "calculated" || !Common.platformParams['poolStrategy']) {
        let nums = [];
        let maxFailed = isNaN(Common.platformParams.maxFailed) ? 10 : Common.platformParams.maxFailed;
        let min = Common.startPlatformNum;
        let max = Common.startPlatformNum + Common.platformParams.maxCapacity / Common.platformParams.usersPerPlatform - 1 + maxFailed;
        //console.log(`listAllPlatforms. min: ${min}, max: ${max}`);
        for (let i=min; i<=max; i++){
            nums.push(i);
        }
        return nums;
    } else {
        const redisSmembers = promisify(Common.redisClient.smembers).bind(Common.redisClient);
        let arr = await redisSmembers('platform_regs');
        for (let i = 0; i < arr.length; i++) {
            arr[i] = Number(arr[i]);
        }
        arr.sort();
        return arr;
    }

}

function listAllPlatforms(domain,cb) {
    getAllPlatformNumbers().then(nums => {
        let plats = [];
        async.eachSeries(nums, (curPlatID, cb) => {
            //logger.info("Getting info for plat: "+curPlatID);
            var multi = Common.getRedisMulti();
            multi.zscore('platforms', curPlatID); // [0]
            multi.zscore('platforms_errs', curPlatID); // [1]
            multi.sismember('platforms_idle', curPlatID); // [2]
            multi.sismember('platforms_close', curPlatID); // [3]
            multi.zscore('platforms_fails', curPlatID); // [4]
            multi.hgetall('platform_' + curPlatID); // [5]
            multi.zscore('platforms_' + domain, curPlatID); //[6]
            multi.zscore('platforms_errs_' + domain, curPlatID); // [7]
            multi.sismember('platforms_idle_' + domain, curPlatID); // [8]


            multi.exec(function (err, r) {
                if (err) {
                    var errMsg = "cannot get data from redis err: " + err;
                    cb(errMsg);
                    return;
                }
                let status;
                let sessions = 0;
                if (r[0] == null && r[1] == null && r[2] == 0 && r[3] == 0 && r[4] < Common.platformParams.maxFails) {
                    status = "available";
                } else if (r[6] != null) {
                    status = "running"
                    sessions = r[6];
                } else if (r[7] != null) {
                    status = "error"
                    sessions = r[7];
                } else if (r[8] != 0) {
                    status = "starting"
                } else if (r[3] != 0) {
                    status = "stopping"
                } else {
                    status = "not_available";
                }
                let platform_ip = "";
                if (status != "not_available" && r[5] && r[5].domain == domain) {
                    platform_ip = r[5].platform_ip;
                }
                if (status == "error" && r[5] && r[5].revive == "true") {
                    status = "revive";
                }
                let params;
                if (r[5]) {
                    params = _.pick(r[5], "created_sessions_cnt", "startTime", "lastCheckStatus", "lastCheckTime", "lastCheckMsg", "currentLoad", "memActive", "memTotal", "memAvailable");
                } else {
                    params = {};
                }
                plats.push({
                    platID: curPlatID,
                    status,
                    sessions,
                    platform_ip,
                    params
                })

                cb(null);
                return;
            });
        }, (err) => {
            //logger.info("plats: "+JSON.stringify(plats,null,2));
            cb(err, plats);
        });
    }).catch(err => {
        cb(err);
    });


}

function findAvaliblePlatform(opts, dedicatedDomain, callback) {

    var lock = new Lock({
        key: "lock_find_avalible_platform_id",
        logger: logger,
        numberOfRetries: 20,
        waitInterval: 500,
        lockTimeout: 1000 * 60 // one minute max lock
    });

    lock.cs(
        //critical section function
        function(callback) {
            var curPlatID = opts.min;
            var maxPlatID = opts.max;
            var foundAvaliblePlatID = false;

            async.whilst(
                //loop until avalible platform ID found or until reached MAX.
                function() {
                    var notFound = (!foundAvaliblePlatID && curPlatID <= maxPlatID);
                    return notFound;
                },
                //check in all platforms lists (working, idle and errs) if avaliblePlatID used
                function(callback) {
                    var multi = Common.getRedisMulti();

                    multi.zscore('platforms', curPlatID);
                    multi.zscore('platforms_errs', curPlatID);
                    multi.sismember('platforms_idle', curPlatID);
                    multi.sismember('platforms_close', curPlatID);
                    multi.zscore('platforms_fails', curPlatID);

                    multi.exec(function(err, replies) {
                        if (err) {
                            var errMsg = "cannot get data from redis err: " + err;
                            callback(errMsg);
                            return;
                        }
                        if (replies[0] === null && replies[1] === null && replies[2] === 0 && replies[3] === 0 && (replies[4] < Common.platformParams.maxFails))
                            foundAvaliblePlatID = true;
                        else
                            curPlatID++;

                        callback(null);
                        return;
                    });
                },
                //finish on error or if avalible platform ID found
                function(err) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    if (foundAvaliblePlatID) {
                        Common.redisClient.sadd('platforms_idle', curPlatID, function(err, reply) {
                            if (err) {
                                callback(err);
                                return;
                            }
                            Common.redisClient.sadd('platforms_idle_' + dedicatedDomain, curPlatID, function(err, reply) {
                                if (err) {
                                    callback(err);
                                    return;
                                }
                                logger.info("findAvaliblePlatform: found avalible ID for platform --> ", curPlatID);
                                callback(null, curPlatID);
                            });
                        });
                    } else {
                        var errMsg = "Cannot allocate platform index in range [" + opts.min + ", " + opts.max + "]";
                        callback(errMsg);
                    }
                }
            );
        },
        //callback when critical section finished
        function(err, platID) {
            if (err) {
                var errMsg = "findAvaliblePlatform: " + (err ? err : '');
                logger.error(errMsg);
                callback(err);
            } else {
                callback(null, platID)
            }
        }
    );
}


//python register_platform.py --host='nubodev@172.16.2.108' --gateway='172.16.2.108' -p 5560 -t tun2 --ip='192.168.122.12' --top=/home/nubodev/Android/nubo-production/nuboplatform
var registerPlatform = function(platid, hostline, platType, domain, callback) {
    var prefix = (platType ? platType + "_" : "");
    var platfromCreated = false;
    var platform = null;
    var timeLog = new TimeLog(logger);
    var re = new RegExp('(.*)@(.*)');
    var m = re.exec(hostline);
    var sshhost = null;
    var sshuser = null;
    if (m != null && m.length >= 3) {
        sshhost = m[2];
        sshuser = m[1];
    }

    var instanceID = "";

    async.series([
            // step 4 create platform
            function(callback) {
                new Platform(null, platType, function(err, plat) {
                    if (err) {
                        callback("Unable to create platform in DB: " + err);
                        return;
                    }
                    console.log('Platform: ' + JSON.stringify(plat.params, null, 2));
                    platform = plat;
                    timeLog.logTime("new Platform");
                    callback(null);
                }, platid); // new Platform
            },
            function(callback) {
                platform.params.domain = domain;
                platform.save(function(err) {
                    callback(err);
                });
            },
            function(callback) {
                if (!Common.isMobile()) {
                    callback(null);
                    return;
                }
                Common.getMobile().appMgmt.createApksPath(callback);
            },
            // step start platform
            function(callback) {
                if (Common.platformType.indexOf('kvm') === 0) {
                    platform.appendAttributes({
                        'sshhost': sshhost,
                        'sshuser': sshuser
                    });
                }
                if (!platformTypeModules[Common.platformType]) {
                    callback("Platform type not found: "+Common.platformType);
                } else {
                    try {
                        platformTypeModules[Common.platformType].start_platform(
                            platform, platType,
                            function(err, obj) {
                                if (err) {
                                    platform.increaseFails(function() {});
                                    callback(err);
                                } else {
                                    platform = obj;
                                    callback(null);
                                }
                            }
                        );
                    } catch (err) {
                        logger.info(`Error starting platform type: ${Common.platformType}`,err);
                        callback(err);
                    }
                }
            },
            // step upload platform params to db
            function(callback) {
                platform.params.startTime = new Date().toISOString();
                platform.save(callback);
            },
            // add apks that in image to redis
            function(callback) {
                if (!Common.isMobile() || Common.platformType == "docker") {
                    callback(null);
                    return;
                }
                Common.getMobile().appMgmt.addImageApksToPlatform(platid,callback);
            },
            function(callback) {
                if (!Common.isMobile() || Common.platformType == "docker") {
                    callback(null);
                    return;
                }
                Common.getMobile().firewall.generatePlatformRules(null, function(err, tasks) {
                    if (!err && tasks && tasks.length > 0) {
                        platform.applyFirewall(tasks, function(err) {
                            callback(err);
                        });
                    } else {
                        callback(err);
                    }
                });
            },
            function(callback) {
                platform.addToRunningPlatforms(function(err) {
                    callback(err);
                });
            }
        ],
        function(err, results) {
            logger.info("Finished all. results.length: " + results.length + ", err: " + err);
            timeLog.logTime("finish start platform");
            if (platform.ssh != null)
                platform.ssh.end();

            if (err && platform != null) {
                async.series([
                    function(callback) {
                        platform.addToErrorPlatforms(function(err) {
                            if (err) {
                                logger.error("registerPlatform: error while removing platform from platforms_errs list: " + err);
                            }
                            callback(null);
                        });
                    },
                    function(callback) {
                        Common.redisClient.srem(prefix + 'platforms_idle', platid, function(err, reply) {
                            if (err) {
                                logger.error("registerPlatform: error while removing platform from platforms_idle list: " + err);
                                callback(err);
                                return;
                            }
                            callback(null);
                        });
                    },
                    function(callback) {
                        Common.redisClient.srem(prefix + 'platforms_idle_' + domain, platid, function(err, reply) {
                            if (err) {
                                logger.error("registerPlatform: error while removing platform from platforms_idle_" + domain + " list: " + err);
                                callback(err);
                                return;
                            }
                            callback(null);
                        });
                    }
                ], callback);
            } else {
                platform.resetFails(function() {});
                callback(null);
            }
        }); //async.series([

}












//update platform with a new rule for online users
var addOnlineRuleToPlatform = function(platid, platType, tasks, callback) {
    async.waterfall(
        [
            // load platform
            function(callback) {
                new Platform(platid, platType, function(err, obj) {
                    if (err || !obj) {
                        var msg = "Platform does not exist. err:" + err;
                        logger.error(msg);
                        callback(msg);
                    } else {
                        callback(null, obj);
                    }
                });
            },
            function(platform, callback) {
                platform.applyFirewall(tasks, function(err) {
                    callback(err);
                });
            }
        ],
        function(err) {
            if (err) {
                logger.error('Error during update online rule : ' + err);
            } else {
                logger.info("Successfully updated online rule");
            }

            if (callback)
                callback(err);
        }
    );

}

var deletePlatform = function(platObj, callback) {

    var platid = platObj.params.platid;
    var platDomain = platObj.params.domain;
    var multi = Common.getRedisMulti();

    multi.del('platform_' + platid + '_packagesUID');
    multi.del('platform_' + platid);
    multi.del('platform_packages_' + platid);


    multi.zrem('platforms', platid);
    multi.zrem('platforms_errs', platid);
    multi.srem('platforms_idle', platid);

    multi.zrem('platforms_' + platDomain, platid);
    multi.zrem('platforms_errs_' + platDomain, platid);
    multi.srem('platforms_idle_' + platDomain, platid);

    multi.srem('platforms_close', platid);

    // multi.srem("platforms_disconneted", platid);

    multi.exec(function(err, replies) {
        if (err) {
            logger.error("deletePlatform: error while deleting platform " + platid + ". err: " + err);
            callback(err);
            return;
        }

        callback(null);
        return;
    });
}

var updateRequestOptionsWithCertsForPlatform = function(options) {
    if (!platformSsl) {
        Common.logger.info("Load certificates for access to platforms");
        platformSsl = {
            ca: fs.readFileSync(Common.platformCred.ca),
            key: fs.readFileSync(Common.platformCred.key),
            cert: fs.readFileSync(Common.platformCred.cert),
            port: 3334,
            servername: 'self.platforms.local',
            rejectUnauthorized: true
        }
    }
    _.extend(options, platformSsl);
};

var checkPlatforms = function(callback) {
    //logger.info("Starting checkPlatforms");
    Common.redisClient.zrange('platforms', '0', '-1', function(err, platIds) {
        if (err) {
            logger.error("Cannot list platforms", err);
            callback(err);
            return;
        }
        async.each(platIds, function(platid, callback) {
            new Platform(platid, null, function(err, platform) {
                if (err || !platform) {
                    var msg = "Platform does not exist. err:" + err;
                    logger.info(msg);
                    callback(msg);
                    return;
                }
                //logger.info('Platform found: ' + JSON.stringify(platform.params, null, 2));
                platform.checkPlatform(function(err, resObj) {
                    if (err) {
                        logger.info("checkPlatform. Platform " + platid + " error. Move it to error list");
                        platform.addToErrorPlatforms(function(err) {
                            if (err) logger.info("ERROR: Cannot move platform to platforms_errs, err: " + err);
                            callback(null);
                        },false,true);
                    } else {
                        //logger.info("Platform " + platid + " is running: "+JSON.stringify(resObj,null,2));
                        callback(null);
                    }
                });
            });
        }, function(err) {
            //logger.info("Finished checkPlatforms. Checked " + platIds.length + " platform.");
            callback(null);
        });
    });
}

module.exports = {
    Platform: Platform,
    DeleteAll: DeleteAll,
    getAvailablePlatform: getAvailablePlatform,
    registerPlatform: registerPlatform,
    killPlatform: killPlatform,
    registerPlatformNum: registerPlatformNum,
    addOnlineRuleToPlatform: addOnlineRuleToPlatform,
    checkPlatforms: checkPlatforms,
    listAllPlatforms,
    registerPlatformType,
    getStaticPlatformParams,
};
