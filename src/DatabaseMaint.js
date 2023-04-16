"use strict";

var async = require("async");

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('./session.js');
var User = require('./user.js');
var Sequelize = require('sequelize');
const Op = Sequelize.Op;

function databaseMaint(logger,callback) {
    require('./ControlPanel/recordings').deleteOldRecordings().then(() => {
        checkOrphanSessions(logger,callback);
    } ).catch (err => {
        logger.error(`databaseMaint error`,err);
    });

}
function checkOrphanSessions(logger,callback) {

    // check that all
    if (!Common.singleDataCenter) {
        callback();
        return;
    }
    Common.db.UserDevices.findAll({
        attributes: ['email', 'imei'],
        where: {
            platform: {
                [Op.ne]: null
            },
            gateway: {
                [Op.ne]: null
            }
        },
    }).complete(function(err, results) {
        if (!!err) {
            logger.error("Error find active sessions: "+err);
            callback(err);
            return;
        }
        if (!results || results == "") {
            //logger.info("Not found any active sessions");
            callback();
            return;
        }
        async.eachSeries(results,function(item,callback){
            let email = item.email;
            let imei = item.imei;
            sessionModule.getSessionOfUserDevice(email,imei,function(err,sess){
                if (!err && sess == null) {
                    // found orphan session in db
                    logger.error("Found orphan session. email: "+email+", imei: "+imei+". Delete session from db");
                    User.updateUserConnectedDevice(email, imei, null, null, null, logger, false, function(err) {
                        if (err) {
                            callback("failed removing platform/gateway assosiation of user device")
                            return;
                        }
                        callback();
                    });
                } else {
                    //logger.info("Session found. email: "+email+", imei: "+imei);
                    callback();
                }
            });
        },function(err){
            callback();
        });
    });

}


module.exports = {
    databaseMaint: databaseMaint
};