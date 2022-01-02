"use strict";

var Common = require( '../common.js' );
var logger = Common.getLogger(__filename);
var sessionModule = require( '../session.js' );
var Session = sessionModule.Session;
var setting = require( '../settings.js' );
var async = require( 'async' );
var generateReports = require( './generateReports.js' );

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession( req, res, callback );
}

/*
 * getAppUsageWeeklyDashboard req@param session req@res status, message
 */
function getAppUsageWeeklyDashboard(req, res, next) {

    // https://login.nubosoftware.com/getAppUsageWeeklyDashboard

    res.contentType = 'json';
    var msg = "";

    loadAdminParamsFromSession( req, res, function(err, login) {

        if (!setting.getDebugMode()) {
            if (err) {
                res.send( {
                    status : '0',
                    message : err
                } );
                return;
            }
            var domain = login.loginParams.mainDomain;
        } else {
            var domain = "nubosoftware.com";
        }

        getAppUsageWeeklyDashboardFromDB( res, domain, function(err, obj) {
            if (err) {
                res.send( {
                    status : '0',
                    message : err
                } );
                return;
            }
            obj["status"] = "1";
            obj["message"] = "sent dashboard details for tablet ", res.end( JSON.stringify( obj ) );
            return;
        } );

    } );

}

function getAppUsageWeeklyDashboardFromDB(res, domain, callback) {

    var params = {};
    var values = [];
    var total = "";

    // this call (async) is to perform this in a synchronic way
    async.series( [
        function(callback) {
            generateReports.generateAppUsage( res, domain, function(err, obj, totalUsage) {
                if (err) {
                    callback( err );
                    return;
                }

                values = obj;
                total = totalUsage;
                callback( null );
                return;
            } );
        }
    ], function(err, results) {
        if (err) {
            callback( err, null );
            return;
        }
        params["values"] = values;
        params["totalUsage"] = total;
        callback( null, params );
        return;
    } );
}

var GetAppUsageWeeklyDashboard = {
    get : getAppUsageWeeklyDashboard
};

module.exports = GetAppUsageWeeklyDashboard;
