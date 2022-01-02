"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var async = require('async');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

/*
 * getRules
 * req@param
 *          session
 * req@res
 *          status, message, {rules}
 */
function getRules(req, res, next) {

    // https://login.nubosoftware.com/getRules?session=[]

    res.contentType = 'json';
    var msg = "";

    loadAdminParamsFromSession(req, res, function(err, login) {

        if (!setting.getDebugMode()) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }
            var domain = login.loginParams.mainDomain;
        } else {
            var domain = "nubosoftware.com";
        }

        getRulesFromDB(res, domain);

    });

}

/*
 * The 'getRulesFromDB' function shall receive res and domain;
 * return all organization rule
 */
function getRulesFromDB(res, domain) {
    var rules = [];
    Common.db.AppRules.findAll({
        attributes : ['packagename', 'ip', 'port', 'protocol', 'mask', 'ruleid', 'ipversion'],
        where : {
            maindomain : domain,
        },
    }).complete(function(err, results) {

        if (!!err) {
            res.send({
                status : '0',
                message : "Error while reading rules from database"
            });
        } else {
            async.eachSeries(results, function(row, callback) {
                var packageName = row.packagename != null ? row.packagename : '';
                Common.db.Apps.findAll({
                    attributes : ['appname'],
                    where : {
                        maindomain : domain,
                        packagename : packageName,
                    },
                }).complete(function(err, result) {
                    var appName;
                    if (!!err) {
                        appName = '';
                    } else if (!results || results == "" || result.length <= 0) {
                        if (packageName == "com.android.email") {
                            appName = 'email';
                        } else if (packageName == "com.android.calendar") {
                            appName = 'calendar';
                        } else if (packageName == "com.mobisystems.editor.office_with_reg") {
                            appName = 'OfficeSuite';
                        } else if (packageName == "com.android.contacts") {
                            appName = 'Contacts';
                        } else if (packageName == "com.nubo.nubosettings") {
                            appName = 'Settings';
                        } else if (packageName == "com.android.calculator2") {
                            appName = 'Calculator';
                        } else if (packageName == "com.android.gallery") {
                            appName = 'Gallery';
                        } else if (packageName == "com.android.camera") {
                            appName = 'Camera';
                        }

                    } else {
                        appName = result[0].appname;
                    }

                    var ip = row.ip != null ? row.ip : '';
                    var port = row.port != null ? row.port : '';
                    var protocol = row.protocol != null ? row.protocol : '';
                    var mask = row.mask != null ? row.mask : '';
                    var ruleid = row.ruleid != null ? row.ruleid : '';
                    var ipversion = row.ipversion != null ? row.ipversion : '';
                    var ruleObj = {
                        packageName : packageName,
                        ip : ip,
                        port : port,
                        protocol : protocol,
                        mask : mask,
                        ruleid : ruleid,
                        appName : appName,
                        ipVersion : ipversion,
                    };
                    rules.push(ruleObj);
                    callback(null);

                });

            }, function(err) {
                if (err) {
                    logger.error(err);
                    //callback(err);
                    return;
                } else {
                    var json = JSON.stringify({
                        status : "1",
                        message : "done",
                        rules : rules
                    });
                    res.end(json);
                    return;
                }
            });

        }

    });
}

var GetRules = {
    get : getRules
};

module.exports = GetRules;
