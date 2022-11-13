"use strict";

/*
 * Platform operations
 */

var Common = require('../common.js');
var setting = require('../settings.js');
var Login = require('../login.js');
var util = require('util');
var async = require('async');
var logger = Common.getLogger(__filename);
var PlatformModule = require('../platform.js');
var Platform = PlatformModule.Platform;
const LongOperationNotif = require('../longOperationsNotif.js');
var _ = require('underscore');
var execFile = require('child_process').execFile;



function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}


async function updateStaticPlatform(req,res) {
    res.contentType = 'json';
    var status = 0;
    var msg = "";
    try {
        let adminLogin = req.nubodata.adminLogin;
        if (adminLogin == undefined || adminLogin.getAdminConsoleLogin() != 1) {
            throw new Error("Invalid credentials");
        }
        let platID = req.params.platID;
        if (!platID) {
            throw new Error("Invalid parameters");
        }
        let ip = req.params.ip;
        let vmname = req.params.vmname;

        await Common.db.StaticPlatforms.upsert({
            platid: platID,
            ip: ip,
            vmname: vmname
        });
        logger.info(`Updated platform ${platID}. ip: ${ip}, vmname: ${vmname}`);
        status = 1;
        msg = "Updated";
    } catch (err) {
        logger.error(`updateStaticPlatform error: ${err}`);
        status = 0;
        msg = `Error: ${err}`;
    }
    res.send({
        status : status,
        message : msg
    });
}

// first call goes to here
function platformCommand(req, res, next) {
    // https://login.nubosoftware.com/removeAdmins?session=[]&email=[]&email=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var platID = req.params.platID;
    if (!platID || platID == "" ) {
        logger.info("platformCommand. Invalid platform id " + platID);
        status = 0;
        msg = "Invalid parameters";
    }
    var cmd = req.params.cmd;
    if (cmd != "start" && cmd != "stop" && cmd != "disable" && cmd != "enable") {
        logger.info("platformCommand. Invalid cmd " + cmd);
        status = 0;
        msg = "Invalid parameters";
    }

    if (status != 1) {
        res.send({
            status : status,
            message : msg
        });
        return;
    }

    loadAdminParamsFromSession(req, res, function(err, login) {
        if (err) {
            res.send({
                status : '0',
                message : err
            });
            return;
        }

        if (login.getSiteAdmin() != 1) {
            res.send({
                status : '0',
                message : "Invalid credentials"
            });
            return;
        }
        var domain = login.getPlatformDomain();
        let notif = new LongOperationNotif();
        //logger.info("Notif token: "+notif.getToken());
        if (cmd == "stop") {
            let isGracefullyStr = req.params.gracefully;

            let isGracefully = false;
            if (isGracefullyStr && (isGracefullyStr == "Y" || isGracefullyStr == "y")) {
                isGracefully = true;
            }
            logger.info("stopPlatform. gracefully: "+isGracefullyStr+", isGracefully: "+isGracefully);
            stopPlatform(platID,domain,notif,isGracefully,function(err){
                if (err) {
                    res.send({
                        status : '0',
                        message : "Error: "+err
                    });
                    return;
                }
                res.send({
                    status : '1',
                    message : "Request was fulfilled",
                    notifToken: notif.getToken()
                });
            });
        } else if (cmd == "start") {
            startPlatform(platID,domain,notif,function(err){
                if (err) {
                    res.send({
                        status : '0',
                        message : "Error: "+err
                    });
                    return;
                }
                res.send({
                    status : '1',
                    message : "Request was fulfilled",
                    notifToken: notif.getToken()
                });
            });
        } else if (cmd == "disable") {
            disablePlatform(platID).then(() => {
                res.send({
                    status : '1',
                    message : "Request was fulfilled",
                });
            }).catch(err => {
                res.send({
                    status : '0',
                    message : "Error: "+err
                });
            });
        } else if (cmd == "enable") {
            enablePlatform(platID).then(() => {
                res.send({
                    status : '1',
                    message : "Request was fulfilled",
                });
            }).catch(err => {
                res.send({
                    status : '0',
                    message : "Error: "+err
                });
            });
        }

    });
}

async function disablePlatform(platID) {
    const redis = Common.redisClient;
    await redis.zadd("platforms_fails",Common.platformParams.maxFails,platID);
}

async function enablePlatform(platID) {
    const redis = Common.redisClient;
    await redis.zrem("platforms_fails",platID);
}


function startPlatform(platID,domain,notif,cb) {
    var opts = {
        logger: logger,
        domain: domain,
        min: platID,
        max: platID,
        runInBackground: true,
        onFinish: function(err) {
            let res;
            if (err) {
                res = {
                    status: Common.STATUS_ERROR,
                    message: "Error starting platform: "+err
                }
            } else {
                res = {
                    status : Common.STATUS_OK,
                    message: "Platform was started successfully"
                }
            }
            notif.set(res).then(() => {
                logger.info("Notifiation has been saved");
            }).catch((err) => {
                logger.error("Error saving notif",err);
            });
        }
    };
    PlatformModule.registerPlatformNum(opts, function(err){
        if (err) {
            logger.error("startPlatform error: "+err);
        }
        cb(err);
    });
}


function notifyOnPlatformClose(curPlatID,notif) {
    var multi = Common.getRedisMulti();
    multi.zscore('platforms', curPlatID); // [0]
    multi.zscore('platforms_errs', curPlatID); // [1]
    multi.sismember('platforms_idle', curPlatID); // [2]
    multi.sismember('platforms_close', curPlatID); // [3]
    multi.zscore('platforms_fails', curPlatID); // [4]
    multi.exec(function(err, r) {
        if (err) {
            var errMsg = "cannot get data from redis err: " + err;
            notif.set({
                status: Common.STATUS_ERROR,
                message: errMsg
            });
            return;
        }

        if ( (!r[0] || r[0] == 0) && (!r[1] || r[1] == 0) && (!r[2] || r[2] == 0) && (!r[3] || r[3] == 0) /*&& (r[4] < Common.platformParams.maxFails || !r[4] ) */) {
            //status = "available";
            notif.set({
                status: Common.STATUS_OK,
                message: "Platform was stopped successfully"
            });
        } else if(r[3] != 0 || r[1] != 0) {
            logger.info("Platform still in closing state. keep checking");
            setTimeout(notifyOnPlatformClose,1000,curPlatID,notif);
        } else {
            logger.info(`Error during platform stop. redis results: ${r}, !r[0]: ${!r[0]}, !r[1]: ${!r[1]}`);
            notif.set({
                status: Common.STATUS_ERROR,
                message: "Error during platform stop"
            });
        }
    });
}

function stopPlatform(platID,domain,notif,isGracefully,cb) {

    new Platform(platID, null, function(err, platform) {
        if (err || !platform) {
            var msg = "platform " + platID + " does not exist. err: " + err;
            logger.error(msg);
            cb(msg);
            return;
        }
        if(platform.params.platid === undefined) platform.params.platid = platID;
        if(platform.params.domain === undefined) platform.params.domain = "common";

        if (platform.params.domain != domain) {
            var msg = "platform " + platID + " domain does not match." ;
            logger.error(msg);
            cb(msg);
            return;
        }
        if (isGracefully) {
            platform.addToErrorPlatforms(function(err) {
                if (err) {
                    logger.error("failed adding platform " + platID + " to platforms_error");
                    logger.error(err);
                    cb(err);
                    return;
                }
                logger.info("platform " + platID + " moved to error list due to revive request");
                cb(null);
                setTimeout(notifyOnPlatformClose,1000,platID,notif);
            },false,false,true);
        } else {
            platform.addToClosePlatforms(function(err) {
                if (err) {
                    logger.error("failed adding platform " + platID + " to platforms_close");
                    logger.error(err);
                    cb(err);
                    return;
                }
                logger.info("platform " + platID + " moved to close list");
                cb(null);
                //notifyOnPlatformClose(platID,notif);
                setTimeout(notifyOnPlatformClose,1000,platID,notif);
            });
        }
    });
}


function getSiteAdminDetails(req,res) {
    return new Promise((resolve,reject) => {
        setting.loadAdminParamsFromSession(req, res, function(err, login) {
            if (err) {
                reject(err);
                return;
            }
            if (login.getSiteAdmin() != 1) {
                reject(new Error("Invalid credentials"));
                return;
            }
            resolve(login);
        });
    });
}

function getStaticParamsFromMachinesFile(platID) {
    return new Promise((resolve, reject) => {
        try {
            var file = Common.vmwareParams.staticMachinesFile || "machines.csv";
            var args = ["^" + platID + ",", file];
            execFile(Common.globals.GREP, args, function (err, stdout, stderr) {
                if (err) {
                    let cmd = Common.globals.GREP + args.join(" ");
                    logger.error("Cannot find machine in file, err: " + err + ", stdout: " + stdout + ", stderr: " + stderr + ", cmd: " + cmd);
                    reject(err);
                    return;
                }
                var lines = stdout.toString().split('\n');
                if (lines.length === 2) {
                    var elements = lines[0].split(",");
                    var obj;
                    if (elements.length >= 4) {
                        obj = {
                            platid: Number(elements[0].trim()),
                            ip: elements[1].trim(),
                            //version: Number(elements[2].trim()),
                            vmname: elements[3].trim()
                        };
                        if (elements.length >= 5) {
                            obj.ssh_port = elements[4].trim();
                        } else {
                            obj.ssh_port = 22;
                        }

                        logger.debug("obj:", obj);
                        resolve(obj);
                    } else {
                        reject(new Error("bad output"));
                    }
                } else {
                    reject(new Error("bad output"));
                }
            });
        } catch(err) {
            reject(err);
        }
    });
}

async function getStaticPlatformParams(platID) {

    let selfRegisterIP = await require('../platformSelfReg').getSelfRegisterPlatformIP(platID);

    let staticPlatform = await Common.db.StaticPlatforms.findByPk(platID);
    let params;
    if (!staticPlatform || (selfRegisterIP && selfRegisterIP != staticPlatform.ip) ) {
        if (!selfRegisterIP) {
            try {
                // try to get paramter from old file
                params = await getStaticParamsFromMachinesFile(platID);
            } catch (err) {
                logger.info(`Error getting platform parameters from machines file: ${err}`);
                params = {
                    platid: platID,
                    ip: "",
                    vmname: "",
                    ssh_port: 22
                }
            }
        } else {
            logger.info(`Update self register platform in DB. platID: ${platID}, IP: ${selfRegisterIP}`);
            params = {
                platid: platID,
                ip: selfRegisterIP,
                vmname: "",
                ssh_port: 22
            }
        }
        // in case we dont have params in database but only in file - update db
        await Common.db.StaticPlatforms.upsert({
            platid: platID,
            ip: params.ip,
            vmname: params.vmname,
            ssh_port: params.ssh_port
        });
        logger.info(`Updated static platform params from machines file: ${platID}. ip: ${ params.ip}, vmname: ${params.vmname}`);
    } else {
        params = {
            platid: platID,
            ip: staticPlatform.ip,
            vmname: staticPlatform.vmname,
            ssh_port: staticPlatform.ssh_port
        }
    }
    return params;

}

async function getPlatformDetails(req, res) {
    try {
        let login = await getSiteAdminDetails(req,res);
        var domain = login.getPlatformDomain();
        if (!domain || domain == "") {
            domain = "common";
        }
        var platID = req.params.platID;
        if (!platID || platID == "" ) {
            logger.info("getOnlineUsersInPlatform. Invalid platform id " + platID);
            res.send({
                status : '0',
                message : "Invalid parameters"
            });
        }
        let results = await Common.db.UserDevices.findAll({
            attributes: ['email','imei','devicename','gateway','platform','localid'],
            where : {
                platform : platID
            },
            include: [
                {
                    model: Common.db.User,
                    attributes : ['firstname', 'lastname']
                }
            ]
        });

        //logger.info("Getting info for plat: "+platID);
        var multi = Common.getRedisMulti();
        multi.zscore('platforms', platID); // [0]
        multi.zscore('platforms_errs', platID); // [1]
        multi.sismember('platforms_idle', platID); // [2]
        multi.sismember('platforms_close', platID); // [3]
        multi.zscore('platforms_fails', platID); // [4]
        multi.hgetall('platform_'+platID); // [5]
        multi.zscore('platforms_'+domain, platID); //[6]
        multi.zscore('platforms_errs_'+domain, platID); // [7]
        multi.sismember('platforms_idle_'+domain, platID); // [8]
        let r = await multi.exec();
        let status;
        let sessions = 0;
        if (r[0] == null && r[1] == null && r[2] == 0 && r[3] == 0 && r[4] < Common.platformParams.maxFails ) {
            status = "available";
        } else if(r[6] != null) {
            status = "running"
            sessions = r[6];
        } else if(r[7] != null) {
            status = "error"
            sessions = r[7];
        } else if(r[8] != 0) {
            status = "starting"
        } else if(r[3] != 0) {
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
        let created_sessions_cnt = (r[5] ? r[5]['created_sessions_cnt'] : 0);
        if (!created_sessions_cnt) {
            created_sessions_cnt = 0;
        }
        let params;
        if (r[5]) {
            params = _.pick(r[5], "startTime","lastCheckStatus", "lastCheckTime" , "lastCheckMsg", "currentLoad" , "memActive" , "memTotal","memAvailable");
        } else {
            params = {};
        }


        let staticParams = await getStaticPlatformParams(platID);
        params = _.extend(params,staticParams);


        res.send({
            status : 1,
            message : "Request was fulfilled",
            platform_status: status,
            platform_ip,
            sessions_cnt: sessions,
            created_sessions_cnt,
            sessions: results,
            platform_type: Common.platformType,
            params
        });
    } catch (err) {
        logger.error("getOnlineUsersInPlatform error: ",err);
        res.send({
            status : '0',
            message : (err.message ? err.message : err)
        });
    }
}

function getPlatformList(req, res) {
    res.contentType = 'json';

    loadAdminParamsFromSession(req, res, function(err, login) {
        if (err) {
            res.send({
                status : '0',
                message : err
            });
            return;
        }

        var domain = login.getPlatformDomain();
        if (!domain || domain == "") {
            domain = "common";
        }
        if (login.getSiteAdmin() != 1 && domain == "common") {
            res.send({
                status : '0',
                message : "Error: Only site admin can list platforms"
            });
            return;
        }


        PlatformModule.listAllPlatforms(domain,function(err,list){
            if (err) {
                res.send({
                    status : '0',
                    message : "Internal error"
                });
                logger.error("listAllPlatforms error: "+err);
                return;
            }
            res.send({
                status : '1',
                message: "Request was fulfilled",
                platforms : list
            });
        });

    });
}



var PlatformControl = {
    platformCommand : platformCommand,
    getPlatformList,
    getPlatformDetails,
    updateStaticPlatform,
    getStaticPlatformParams
};

module.exports = PlatformControl;
