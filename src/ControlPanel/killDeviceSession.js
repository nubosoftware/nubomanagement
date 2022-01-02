var StartSession = require('../StartSession.js');
var sessionModule = require('../session.js');
var Common = require('../common.js');
var Lock = require('../lock.js');
var async = require('async');
var User = require('../user.js');
var setting = require('../settings.js');
var logger = Common.getLogger(__filename);

var KillDeviceSession = {
		get : killDeviceSession,
        killDeviceSessionImp
};

module.exports = KillDeviceSession;

function removeLock(sessionID, userName, deviceid, callback) {

    async.waterfall([
    function(callback) {
        var lockName = 'lock_' + userName + '_' + deviceid;
        Common.redisClient.del(lockName, function(err, reply) {
            if (err) {
                var errMsg = "removeLock: error removing lock on \'" + lockName + "\' err: " + err;
                callback(errMsg);
                return;
            }

            if (reply == 1)
                logger.info("Kill session: removed lock: " + lockName);

            callback(null);

        });
    }], callback);
}


function killDeviceSessionImp(email,imei,domain, callback) {
    let sessId;
    let removeReference = false;


    async.series([
        // check that doamin is valid
        function(callback) {
            logger.info(`killDeviceSessionImp. domain: ${domain}`);
            if (!domain) {
                callback(null);
                return;
            }
            User.getUserDomain(email, function(orgDomainFromDB) {
                if (orgDomainFromDB != domain) {
                    callback(new Error("Invalid user domain"));
                    return;
                }
                callback(null);
            });
        },
        // get session id
        function(callback) {
            removeReference = true;
            Common.redisClient.get(`usersess_${email}_${imei}`, function(err, reply) {
                if (err) {
                    callback(err);
                    return;
                }
                if (!reply) {
                    callback(new Error("Session not found for device"));
                }
                sessId = reply;
                callback(null);
            });
        },
        // remove lock if exists
        function(callback) {
            removeLock(sessId, email, imei, callback);
        },
        // end sessions
        function(callback) {
            StartSession.endSession(sessId, function(err) {
                if (err) {
                    callback(err);
                } else {
                    logger.info("killDeviceSession. Killed session: " + sessId);
                    removeReference = false;
                    callback(null);
                }
            });
        }
    ],function(err) {
        if (err) {
            let msg = (err.message ? err.message : err);
            logger.info("killSession error",err);
            callback({
                status : '0',
                message : "killSession error: " + msg
            });
            if (removeReference) {
                // delete session from database
                logger.info("Session not found for user/device. Remove platform/gateway assosiation of user device");
                User.updateUserConnectedDevice(email, imei, null, null, logger, function(err) {
                    if (err) {
                        logger.info("failed removing platform/gateway assosiation of user device",err)
                        return;
                    }
                });
            }

        } else {
            callback({
                status : 1,
                message : "Session killed successfully"
            });
        }
    });
}

function killDeviceSession(req, res,domain) {
    // http://???.nubosoftware.com/ControlPanel/killDeviceSession?session=&email=?&imei=?

    var status = 1;
    var msg = "";

    var email = req.params.email;
    if (!email || email == "") {
        logger.error("killDeviceSession. Invalid email");
        status = 0;
        msg = "Invalid parameters";
    }

    var imei = req.params.imei;
    if (!imei || imei == "") {
        logger.error("killDeviceSession. Invalid imei");
        status = 0;
        msg = "Invalid parameters";
    }
    if (!domain || domain == "") {
        logger.error("killDeviceSession. Invalid domain");
        status = 0;
        msg = "Invalid parameters";
    }

    logger.info(`killDeviceSession. domain: ${domain}, email: ${email}, imei: ${imei}`);
    if (status != 1) {
        res.send({
            status : status,
            message : msg
        });
        return;
    }


    setting.loadAdminParamsFromSession(req, res, function(err, login) {
        if (err) {
            res.send({
                status : '0',
                message : err
            });
            return;
        }

        let mainDomain = login.loginParams.mainDomain;
        if (login.getSiteAdmin() == 1) {
            mainDomain = null;
        }
        killDeviceSessionImp(email,imei,mainDomain,function(sendObj){
            res.send(sendObj);
        });
    });





}