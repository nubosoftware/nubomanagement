"use strict";

var async = require('async');
var _ = require('underscore');
var Common = require('../common.js');
var DBProcessModule = require('../ControlPanel/syslog/DBProcess.js');

console.log("Set common");

Common.loadCallback = function(err, firstTime) {
    var LogsArr;

    console.log("Start test");
    async.series([
            function(callback) {
                DBProcessModule.init(
                    function(err,obj) {
                        callback(err);
                    }
                 );
            },
            function(callback) {
                var filter = {
                    limit : 10,
                    offset: 20
                };
                DBProcessModule.getLogs(filter, function(err, results) {
                    console.log("unittest: after getLogs");
                    console.log("getLogs: results=", _.map(results.rows, function(item) { return item.ID}));
                    console.log("getLogs: length=" + results.rows.length);
                    console.log("getLogs: count=" + results.count);
                    LogsArr = results.rows;
                    callback(null);
                });
            },
            function(callback) {
                async.eachSeries(
                    LogsArr, //_.sortBy(LogsArr, function(item){ return item.Time; }),
                    function(item, callback) {
                        //console.log("item: ID:" + item.ID + " t:" + item.Time + " m:" + item.Message);
                        callback(null);
                    },
                    function(err) {
                        callback(null);
                    }
                );
            }
        ], function(err) {
            console.log("status: " + (err ? " error: " + err : "Done"));
            Common.quit();
        }
    );
}
