"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var async = require('async');
var getOnlineUsersGroupDashboardFromDB = require('./getOnlineUsersGroupDashboard.js');
var getMainDashboardFromDB  = require('./getMainDashboard.js');
var generateReports  = require('./generateReports.js');
var getLastSessionsDashboardFromDB  = require('./getLastSessionsDashboard.js');
const AdminPermissions = require('../adminPermissions');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

/*
 * getTabletDashboard req@param session req@res status, message, {rules}
 */
function getTabletDashboard(req, res, next) {

    // https://login.nubosoftware.com/getTabletDashboard?
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

        let adminLogin = req.nubodata.adminLogin;
        let isNewCP = (adminLogin != null);
        let siteAdmin = true;
        if (isNewCP) {
            let perms = new AdminPermissions(adminLogin.getAdminPermissions());
            siteAdmin = perms.checkPermission('@/','rw');
        }
        getTabletDashboardFromDB(res, domain, isNewCP, siteAdmin, function(err, obj) {
            if (err) {
                logger.info("getTabletDashboard. err: "+JSON.stringify(err,null,2));
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }
            obj["status"] = "1";
            obj["message"] = "sent dashboard details for tablet ";
            //logger.info("getTabletDashboard: "+JSON.stringify(obj,null,2));

            res.end(JSON.stringify(obj));
            return;
        });

    });

}

function getTabletDashboardFromDB(res, domain, isNewCP, siteAdmin, callback) {

    var onlineGroups = [];
    var lastSessions = [];
    var params;
    var values = [];
    var total = "";

    //this call (async) is to perform this in a synchronic way
    async.series([
        function(callback) {
            getMainDashboardFromDB.getMainDashboardFromDB(domain, isNewCP, siteAdmin, function(err, obj) {
                if (err) {
                    callback(err);
                    return;
                }
                params = obj;
                callback(null);
                return;
            });
        },
        function(callback) {
            generateReports.generateAppUsage(res, domain, function(err, obj, totalUsage) {
                if (err) {
                    callback(err);
                    return;
                }

                values = obj;
                total = totalUsage;
                callback(null);
                return;
            });
        },
        function(callback) {
            getLastSessionsDashboardFromDB.getLastSessionsDashboardFromDB(domain, function(err, sessions) {
                if (err) {
                    callback(err);
                    return;
                }
                lastSessions = sessions;
                callback(null);
                return;
            });
        },
        function(callback) {
            getOnlineUsersGroupDashboardFromDB.getOnlineUsersGroupDashboardFromDB(domain, function(err, groups) {
                if (err) {
                    callback(err);
                    return;
                }
                onlineGroups = groups;
                callback(null);
                return;
            });
        }], function(err, results) {
            if (err) {
                logger.info("getTabletDashboardFromDB err: "+JSON.stringify(err,null,2));
                console.error(err);
                callback(err, null);
                return;
            }
            params["onlineGroups"] = onlineGroups;
            params["lastSessions"] = lastSessions;
            params["values"] = values;
            params["totalUsage"] = total;
            //logger.info("dashboard: "+JSON.stringify(params,null,2));
            callback(null, params);
            return;
        });
}

var GetTabletDashboard = {
    get : getTabletDashboard
};

module.exports = GetTabletDashboard;
