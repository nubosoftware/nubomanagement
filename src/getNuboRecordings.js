"use strict";

/*
 * @autor Ori Sharon in this class we get all nubo recorded videos.
 */

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('./session.js');
var Session = sessionModule.Session;
var async = require('async');
var setting = require('./settings.js');
const { QueryTypes } = require('sequelize');

// first call goes to here
function getNuboRecordings(req, res, next) {

    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var displayname = req.params.name;
    if (!displayname || displayname == undefined) {
        displayname = "";
    }

    var startdate = req.params.from;
    if (!startdate || startdate == undefined) {
        startdate = "";
    }

    var enddate = req.params.to;
    if (!enddate || enddate == undefined) {
        enddate = "";
    }

    if (status != 1) {
        res.send({
            status : status,
            message : msg
        });
        return;
    }
    getRecordings(res, displayname, startdate, enddate);

}

function getRecordings(res, displayname, startdate, enddate) {

    var query = ' select recordings.sessionid as sessionid, ' +
                ' recordings.displayname as displayname, ' +
                ' recordings.filename as filename, ' +
                ' recordings.startdate as startdate, ' +
                ' recordings.duration as duration, ' +
                ' recordings.devicename as devicename, ' +
                ' recordings.height as height, ' +
                ' recordings.width as width ' +
                ' from recordings ';


    var queryWhereClause;
    var queryParams;
    var subscribtionIDForLogger;
    var records = [];

    if (displayname != null && displayname.length > 0 && startdate != null && startdate.length > 0 && enddate != null && enddate.length > 0) {
        queryWhereClause = ' where recordings.displayname like :displayname AND recordings.startdate > :startdate AND recordings.startdate < :enddate order by recordings.id desc limit 100;';
        queryParams = {displayname: displayname+'%', startdate: startdate+'%', enddate: enddate+'%'};

    } else if (startdate != null && startdate.length > 0 && enddate != null && enddate.length > 0) {
        queryWhereClause = ' where recordings.startdate > :startdate AND recordings.startdate < :enddate order by recordings.id desc limit 100;';
        queryParams = {startdate: startdate+'%', enddate: enddate+'%'};

    } else if (displayname.length > 0) {
        queryWhereClause = ' where recordings.displayname like :displayname order by recordings.id desc limit 100';
        queryParams = {displayname: displayname+'%'};
    }

    if (queryWhereClause && queryWhereClause.length > 0) {
        query = query + queryWhereClause;
    } else {
        query = query + "order by recordings.id desc limit 100";
    }

    async.series([
    // get user apps details
    function(callback) {

     // same logic to get details and build return object
        Common.sequelize.query(query, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {
            if (!results || results == "" || results.length <= 0) {
                callback(' No Results. Unable to find Records details for user: ' + displayname);
            } else {
                results.forEach(function(row) {

                    var sessionid = row.sessionid != null ? row.sessionid : '';
                    var displayname = row.displayname != null ? row.displayname : '';
                    var filename = row.filename != null ? row.filename : '';
                    var startdate = row.startdate != null ? row.startdate : '';
                    var enddate = row.enddate != null ? row.enddate : '';
                    var duration = row.duration != null ? row.duration : '';
                    var devicename = row.devicename != null ? row.devicename : '';
                    var height = row.height != null ? row.height : '';
                    var width = row.width != null ? row.width : '';

                    var jsonRecord = {
                        sessionid : sessionid,
                        displayname : displayname,
                        filename : filename,
                        startdate : startdate,
                        enddate : enddate,
                        duration : duration,
                        devicename : devicename,
                        height : height,
                        width : width
                    };
                    records.push(jsonRecord);

                });
                callback(null);
            }
        }).catch(function(err) {
            callback(err);
        });

    } ], function(err, results) {
        if (err) {
            console.log('err: ' + err);
            res.send({
                status : '0',
                message : err
            });
            return;
        }

        // response back all details once finish
        var json = JSON.stringify({
            status : "1",
            message : "import records succedded",
            records : records
        });
        res.end(json);
        return;
    });
}

var getNuboRecordings = {
    func : getNuboRecordings
};

module.exports = getNuboRecordings;
