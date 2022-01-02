"use strict";

/*
 * @author Ori Sharon In this class we add a profile
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');

var ERROR = -1;
var FINISHED = 0;
var COPYING = 1;
var INSTALLING = 2;

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

function checkApkStatus(req, res, next) {

    // https://login.nubosoftware.com/checkApkStatus?session=[]&packageName=[]

    res.contentType = 'json';
    var status = 1;
    var apkStatus = ERROR;
    var msg = "";

    var packageName = req.params.packageName;

    if (!packageName || packageName == "") {
        status = 0;
        msg = "Invalid packageName";
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
                    message : err,
                });
                return;
            }
            var domain = login.loginParams.mainDomain;
        } else {
            var domain = "nubosoftware.com";
        }

        checkApkStatusInDB(res, packageName, domain);

    });

}

function checkApkStatusInDB(res, packageName, domain) {

    var errormsg;

    Common.db.Apps.findAll({
        attributes : ['status', 'err'],
        where : {
            packagename : packageName,
            maindomain: domain
        },
    }).complete(function(err, results) {

        if (!!err) {
            res.send({
                status : '0',
                message : err,
            });
            return;
        }

        // goes here if we don't find this profile in the database
        if (!results || results == "") {
            errormsg = 'Cannot find app: ' + packageName;
            res.send({
                status : '1',
                message : errormsg,
                apkStatus : '-1'
            });
            return;
        }

        var row = results[0];
        var apkStatus = row.status != null ? row.status : ERROR;
        var apkStatusMsg = row.err != null ? row.err : '';

        res.send({
            status : '1',
            message : apkStatusMsg,
            apkStatus : apkStatus
        });

    });

}

var CheckApkStatus = {
    get : checkApkStatus
};

module.exports = CheckApkStatus;
