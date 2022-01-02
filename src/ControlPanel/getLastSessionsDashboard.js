"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var moment = require('moment-timezone');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

function getLastSessionsDashboardFromDB(domain, callback) {

    var errormsg = "";
    var sessions = [];

    Common.db.LastSessions.findAll({
        attributes : ['count', 'time'],
        limit : 12,
        where : {
            maindomain: domain
        },
        order: [['id', 'DESC']],
    }).complete(function(err, results) {
        if (!!err) {
            errormsg = 'Error on get last sessions : ' + err;
            logger.error(errormsg);
            callback(err, null);
            return;
        }

        // goes here if we don't find this profile in the database
        if (results.length == 0) {
            errormsg = 'results on get user_devices is null: ';
            logger.error(errormsg);
            callback(null, sessions);
            return;
        } else {
            results.forEach(function(row) {
                // gets all data of the required profile
                var count = row.count != null ? row.count : '';
                var time = row.time != null ? row.time : '';
                var zone = moment.tz.guess();
                var formattedTime = moment.tz(time, zone).format();

                var jsonSessionItem = {
                        count : count,
                        time : formattedTime
                };
                sessions.push(jsonSessionItem);
            });
            callback(null, sessions);
            return;
        }
    });
}

var GetLastSessionsDashboard = {
        getLastSessionsDashboardFromDB : getLastSessionsDashboardFromDB
};

module.exports = GetLastSessionsDashboard;
