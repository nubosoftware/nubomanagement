"use strict";
var Common = require('./common.js');
var async = require('async');
var logger = Common.getLogger(__filename);
var sub;
var recordingChannelName = "recording_msgs";

// subscribe to availbe channels
function subscribeToChannels() {
    logger.info("Subscribe to channels");
    sub = Common.redis.createClient( Common.redisConf);
    if (Common.redisdb > 0) {
        sub.select(Common.redisdb, function(err) {
        });
    }

    sub.on("error", function(err) {
        logger.error("Error in redis " + err);
    });

    sub.on("message", function(channel, message) {
        logger.info("sub channel " + channel + ": " + message);
        if (channel == recordingChannelName) {
            var doc = JSON.parse(message);
            readRecordingMsg(doc);
        }
    });

    sub.subscribe(recordingChannelName);
}
// read only journal from gateway and report to DB
var readRecordingMsg = function(doc) {
    logger.info("readRecordingMsg: " + JSON.stringify(doc, null, 2));
    var devicename;
    var displayname;

    async.series([

    function(callback) {
        // get user details
        Common.db.User.findAll({
            attributes : ['firstname', 'lastname'],
            where : {
                email : doc.email
            },
        }).complete(function(err, results) {

            if (!!err) {
                errormsg = 'Error on get user first / last name, err: ' + err;
                callback(errormsg);
                return;

            } else if (results.length > 0) {
                var row = results[0];
                var firstname = row.firstname != null ? row.firstname : '';
                var lastname = row.lastname != null ? row.lastname : '';
                displayname = firstname + " " + lastname;
                callback(null);
            } else {
                callback(null);
            }
        });

    },
    // get user devices
    function(callback) {
        Common.db.UserDevices.findAll({
            attributes : ['devicename'],
            where : {
                imei : doc.deviceid
            },
        }).complete(function(err, results) {

            if (!!err) {
                errormsg = 'Error on get user device imei: ' + err;
                console.log(errormsg);
                callback(errormsg);
                return;

            } else if (results.length > 0) {
                var row = results[0];
                devicename = row.devicename != null ? row.devicename : '';
                callback(null);
            } else {
                callback(null);
            }
        });
    },

    function(callback) {

        Common.db.Recordings.create({
            sessionid : doc.sessid,
            displayname : displayname,
            filename : doc.fileName,
            startdate : doc.startTime,
            devicename : devicename,
            width: doc.mWidth,
            height : doc.mHeight,
            duration : doc.duration
        }).then(function(results) {

            callback(null);
        }).catch(function(err) {
            callback(err);
        });

    } ], function(err, results) {
        if (err) {
            logger.info('cant create recording in db, err: ' + err);
        }
        return;

    });

}

subscribeToChannels();
