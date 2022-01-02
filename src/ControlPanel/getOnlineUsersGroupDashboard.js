"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
const { QueryTypes } = require('sequelize');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

/*
 * getOnlineUsersGroupDashboard req@param session req@res status, message, {rules}
 */
function getOnlineUsersGroupDashboard(req, res, next) {

    // https://login.nubosoftware.com/getOnlineUsersGroupDashboard?

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

        getOnlineUsersGroupDashboardFromDB(domain, function(err, groups) {
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
                message : "imported groups",
                onlineGroups : groups
            });
            res.end(json);
            return;
        });

    });

}

/*
 * The 'getRulesFromDB' function shall receive res and domain; return all organization rule
 */
function getOnlineUsersGroupDashboardFromDB(domain, callback) {

    var groups = [];
    var query = 'select count as groupname, count(count) as count from (select distinct(ud1.email), ug2.groupname as count FROM'
        + ' user_devices AS ud1 INNER JOIN user_groups AS ug2 ON (ud1.email=ug2.email AND ud1.maindomain=ug2.maindomain'
        + ' AND ug2.maindomain= :domain) where ud1.platform is not null) as t1 GROUP BY count ORDER BY count';

    var queryWhereClause = "";
    var queryParams = {domain:domain};

    Common.sequelize.query(query + queryWhereClause, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

        results.forEach(function(row) {
            var groupname = row.groupname != null ? row.groupname : '';
            var count = row.count != null ? row.count : '';

            var jsonGroupItem = {
                    groupName : groupname,
                    count : count
            };
            groups.push(jsonGroupItem);
        });
        callback(null, groups);
        return;

    }).catch(function(err) {
        callback(err, null);
        return;
    });
}

var GetOnlineUsersGroupDashboard = {
    get : getOnlineUsersGroupDashboard,
    getOnlineUsersGroupDashboardFromDB : getOnlineUsersGroupDashboardFromDB
};

module.exports = GetOnlineUsersGroupDashboard;
