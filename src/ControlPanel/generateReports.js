"use strict";

/*
 * @author Ori Sharon update updateDeviceApproval for organization
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var REPORT_APPS_BY_USER_ID  = "1";
var REPORT_CONNECTED_USERS_PER_PLATFORM  = "2";
var REPORT_ACTIVATED_USERS_AND_DEVICE_DETAILS = "3";
var REPORT_APP_USAGE_BY_USER = "4";
const { QueryTypes } = require('sequelize');

// first call goes to here
function generateReports(req, res, domain) {
// http://login.nubosoftware.com/generateReports?session=[]&reportID=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var reportID = req.params.reportId;
    if (!reportID || reportID == "") {
        status = 0;
        msg = "Invalid reportID";
    }

    if (status != 1) {
        res.send({
            status : status,
            message : msg
        });
        return;
    }

    switch(reportID) {
        case REPORT_APPS_BY_USER_ID:
            generateAppsByUserReport(res, domain);
            break;

        case REPORT_CONNECTED_USERS_PER_PLATFORM:
            generateConnectedUsersPerPlatform(res, domain);
            break;

        case REPORT_ACTIVATED_USERS_AND_DEVICE_DETAILS:
            generateActivatedUsersAndDeviceDetails(res, domain);
            break;

        case REPORT_APP_USAGE_BY_USER:
            generateAppUsageByUser(res, domain);
            break;

        default:
            res.send({
                status : 0,
                message : "Invalid reportID"
            });
    }

}

function generateAppsByUserReport(res, domain) {

    var headers = [];
    var headersSize = [];
    var values = [];

    var query = 'select u2.email, a1.packagename, a1.appname, a1.versionname, a1.versioncode FROM apps AS a1 INNER JOIN user_apps AS u2' +
         ' ON (a1.packagename=u2.packagename AND a1.maindomain=u2.maindomain)';

    var queryWhereClause = "AND a1.maindomain= :domain order by u2.email";
    var queryParams = {domain:domain};

    Common.sequelize.query(query + queryWhereClause, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

        headers.push("Email");
        headers.push("Package Name");
        headers.push("App Name");
        headers.push("Version Name");
        headers.push("Version Code");

        headersSize.push("25");
        headersSize.push("25");
        headersSize.push("20");
        headersSize.push("15");
        headersSize.push("15");

        results.forEach(function(row) {

            // get all values of current row
            var email = row.email != null ? row.email : '';
            var packagename = row.packagename != null ? row.packagename : '';
            var appname = row.appname != null ? row.appname : '';
            var versionname = row.versionname != null ? row.versionname : '';
            var versioncode = row.versioncode != null ? row.versioncode : '';

            var item = [];

            item.push(email);
            item.push(packagename);
            item.push(appname);
            item.push(versionname);
            item.push(versioncode);

            values.push(item);
        });

        res.send({
            status : "1",
            message : "generated report successfully",
            headers : headers,
            headersSize : headersSize,
            values : values
        });
        return;

    }).catch(function(err) {
        res.send({
            status : "0",
            message : err
        });
        return;
    });

}

function generateConnectedUsersPerPlatform(res, domain) {

    var headers = [];
    var headersSize = [];
    var values = [];

    var query = 'select platform, count(*) AS users from user_devices';

    var queryWhereClause = " where gateway IS NOT NULL AND platform IS NOT NULL AND maindomain= :domain GROUP BY platform";
    var queryParams = {domain:domain};

    Common.sequelize.query(query + queryWhereClause, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

        headers.push("Platform");
        headers.push("Connected Users");

        headersSize.push("50");
        headersSize.push("50");

        if (!results || results == "") {
            var msg = "can't find connected users";
            res.send({
                status : "0",
                message : msg
            });
            return;
        }

        results.forEach(function(row) {

            // get all values of current row
            var platform = row.platform != null ? row.platform : '';
            var users = row.users != null ? row.users : '';

            var item = [];

            item.push(platform);
            item.push(users);

            values.push(item);

        });

        res.send({
            status : "1",
            message : "generated report successfully",
            headers : headers,
            headersSize : headersSize,
            values : values
        });
        return;

    }).catch(function(err) {
        res.send({
            status : "0",
            message : err
        });
        return;
    });

}

function generateActivatedUsersAndDeviceDetails(res, domain) {

    var headers = [];
    var headersSize = [];
    var values = [];

    var query = 'select u1.email, ud2.devicename, ud2.imei, ud2.inserttime FROM users AS u1 INNER JOIN user_devices AS ud2 ON'
        + '(u1.email=ud2.email AND u1.orgdomain=ud2.maindomain)';

    var queryWhereClause = " where ud2.inserttime IS NOT NULL AND u1.orgdomain= :domain";
    var queryParams = {domain:domain};

    Common.sequelize.query(query + queryWhereClause, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

        headers.push("Email");
        headers.push("Device Name");
        headers.push("IMEI");
        headers.push("Insert Time");

        headersSize.push("25");
        headersSize.push("25");
        headersSize.push("25");
        headersSize.push("25");

        results.forEach(function(row) {

            // get all values of current row
            var email = row.email != null ? row.email : '';
            var devicename = row.devicename != null ? row.devicename : '';
            var inserttime = row.inserttime != null ? row.inserttime : '';
            var imei = row.imei != null ? row.imei : '';

            var item = [];

            item.push(email);
            item.push(devicename);
            item.push(imei);
            item.push(inserttime);

            values.push(item);

        });

        res.send({
            status : "1",
            message : "generated report successfully",
            headers : headers,
            headersSize : headersSize,
            values : values
        });
        return;

    }).catch(function(err) {
        res.send({
            status : "0",
            message : err
        });
        return;
    });

}

function generateAppUsageByUser(res, domain) {

    var headers = [];
    var headersSize = [];
    var values = [];

    var query = 'select u1.email, a1.packagename, a1.count, a1.day, a2.appname from app_usages AS a1 INNER JOIN apps AS a2 ON '
        + '(a1.packagename=a2.packagename) INNER JOIN users as u1 ON(u1.email=a1.email) ';

    var queryWhereClause = " AND u1.orgdomain= :domain ORDER BY count DESC";
    var queryParams = {domain:domain};

    Common.sequelize.query(query + queryWhereClause, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

        headers.push("email");
        headers.push("app name");
        headers.push("time");
        headers.push("count");

        headersSize.push("30");
        headersSize.push("30");
        headersSize.push("25");
        headersSize.push("10");

        results.forEach(function(row) {

            // get all values of current row
            var email = row.email != null ? row.email : '';
            var appname = row.appname != null ? row.appname : '';
            var time = row.day != null ? row.day : '';
            var count = row.count != null ? row.count : '';

            var item = [];

            item.push(email);
            item.push(appname);
            item.push(time);
            item.push(count);

            values.push(item);

        });
        res.send({
            status : "1",
            message : "generated report successfully",
            headers : headers,
            headersSize : headersSize,
            values : values
        });
        logger.info("generateAppUsageByUser: "+JSON.stringify({
            status : "1",
            message : "generated report successfully",
            headers : headers,
            headersSize : headersSize,
            valuesCnt : values.length
        },null,2));
        return;

    }).catch(function(err) {
        logger.error("generateAppUsageByUser: "+err);
        res.send({
            status : "0",
            message : err
        });
        return;
    });

}

function generateAppUsage(res, domain, callback) {

    var total = 0;
    var values = [];

    var query = 'select appname, sum(count) as count from'
        + ' (select a1.email, a2.appname, count, a1.packagename from app_usages AS a1 INNER JOIN apps AS a2 ON'
        + ' (a1.packagename=a2.packagename AND a2.maindomain= :domain) where a1.day > DATE_SUB(now(), INTERVAL 7 DAY) GROUP BY email, appname , count , packagename) AS t1'
        + ' GROUP BY appname ORDER by count DESC';

    var queryWhereClause = "";
    var queryParams = {domain:domain};

    Common.sequelize.query(query + queryWhereClause, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

        results.forEach(function(row) {

            // get all values of current row
            var appname = row.appname != null ? row.appname : '';
            var count = row.count != null ? parseInt(row.count) : 0;
            if (isNaN(count)) {
                count = 0;
            }


            total += count;

            var item = [];
            item.push(appname);
            item.push(count);
            values.push(item);

        });

        callback(null, values, total);
        return;

    }).catch(function(err) {
        callback(err);
        return;
    });

}

var GetGenerateReports = {
    get : generateReports,
    generateAppUsage : generateAppUsage
};

module.exports = GetGenerateReports;
