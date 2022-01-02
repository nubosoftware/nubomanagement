"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var util = require('util');
var User = require('../user.js');
var async = require('async');
var CERTIFICATE_FILE = 'cert.pfx';
var CERTIFICATE_DIRECTORY = 'certificate/';
var commonUtils = require('../commonUtils.js');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

function checkCertificate(req, res, next) {
    // https://login.nubosoftware.com/checkCertificate?session=[]&email[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var email = req.params.email;
    if (!email || email == "") {
        logger.info("checkCertificate. Invalid email");
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

        if (!setting.getDebugMode()) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }
        }

        getDevicesFromDB(res, email);

    });
}

function getDevicesFromDB(res, email) {

    var devices = [];

    async.series([
    // get user details
    function(callback) {
        Common.db.UserDevices.findAll({
            attributes : [ 'imei' ],
            where : {
                email : email
            },
        }).complete(function(err, results) {

            if (!!err) {
                logger.info(err);
                res.send({
                    status : '0',
                    message : "Internal error: " + err
                });
                return;

            } else if (!results || results == "") {
                res.send({
                    status : '0',
                    message : "no user device found"
                });
                return;

            } else {
                async.each(results, function(row, callback) {
                    var imei = row.imei != null ? row.imei : '';
                    var isExists;

                    checkIfCertificateIsInNFS(email, imei, true, function(exists) {
                        isExists = exists;

                        var jsonProfileDevice = {
                            IMEI : imei,
                            isCertExists : isExists
                        };
                        devices.push(jsonProfileDevice);
                        callback(null);
                    });
                }, function(err) {
                    callback(null);
                });
            }
        });
    } ], function(err) {
        if (err) {
            res.send({
                status : '0',
                message : err
            });
            return;
        }

        // response back all details once finish
        var json = JSON.stringify({
            status : "1",
            message : "delete cert successfully",
            devices : devices
        });
        res.end(json);
        return;
    });

}

function checkIfCertificateIsInNFS(email, deviceid, isDelete, callback) {

    if (!deviceid || deviceid == "") {
        var url = commonUtils.buildPath(Common.nfshomefolder, User.getUserHomeFolder(email), CERTIFICATE_DIRECTORY);
    } else {
        var url = commonUtils.buildPath(Common.nfshomefolder, User.getUserDeviceDataFolder(email, deviceid), Common.settingsfolder);
    }
    var certFile = commonUtils.buildPath(url, CERTIFICATE_FILE);

    Common.fs.exists(certFile, function(exists) {

        if (exists) {
            if (isDelete) {
                Common.fs.unlink(certFile, function() {
                    // think of adding another exists check
                    callback(0);
                });
            } else {
                callback(1);
            }
        } else {
            callback(0);
        }
    });
}

var CheckCertificate = {
    get : checkCertificate,
    checkIfCertificateIsInNFS : checkIfCertificateIsInNFS
};

module.exports = CheckCertificate;
