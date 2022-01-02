/**
 *  killPlatform.js
 *  Kill platform by platform id
 *  Usage: node killPlatform.js [platid]
 */

"use strict";
var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var PlatformModule = require('../platform.js');
var Platform = PlatformModule.Platform;
var PlatformPool = require('../platformPool.js').PlatformPool;
var async = require('async');
var myArgs = require('yargs/yargs')(process.argv.slice(2))
        .usage('\nUsage: $0 [platform ID | all]')
        .demandCommand(1)
        .argv;


Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;

    //kill specfic platform
    if (isInt(myArgs._[0]) && myArgs._[0] >= 1) {
        movePlatformToClosing(myArgs._[0],function(){
            Common.redisClient.publish("platformChannel", "close");
            Common.quit();
        });
    //kill all platforms
    } else if (myArgs._[0] === 'all') {
        // Sequence:
        // 1. move all errs platfroms to close platforms.
        // 2. move all idle platfroms to close platforms.
        // 3. move all from platforms to close platforms.
        // at the end refresh platforms pool
        async.series([
            // Kill all platforms from platforms_errs list
            function(callback) {
                Common.redisClient.zrange('platforms_errs', 0, -1, function(err, replies) {
                    console.log("in platforms_errs exist " + replies.length + " platforms");
                    async.each(replies, function(platid, cb) {
                        movePlatformToClosing(platid,function(){
                            cb(null);
                        });
                    }, callback);
                });
            },
            // Kill all platforms from platforms_idle list
            function(callback) {
                Common.redisClient.smembers('platforms_idle', function(err, replies) {
                    console.log("in platforms_idle exist " + replies.length + " platforms");
                    async.each(replies, function(platid, cb) {
                        movePlatformToClosing(platid,function(){
                            cb(null);
                        });
                    }, callback);
                });
            },
            // Kill all platforms from platforms list
            function(callback) {
                Common.redisClient.zrange('platforms', 0, -1, function(err, replies) {
                    console.log("in platforms exist " + replies.length + " platforms");
                    async.each(replies, function(platid, cb) {
                        movePlatformToClosing(platid,function(){
                            cb(null);
                        });
                    }, callback);
                }); //ZRANGE
            }
            // At the end refresh pool (start new platforms if necessary)
        ], function(err, results) {
            //Common.redisClient.publish("platformChannel", "close");
            Common.quit();
        });

    } else {
        
        console.log(`Invalid option: ${myArgs._[0]}`);
        Common.quit();
        
    }
}


function isInt(value) {
    var x = parseFloat(value);
    return !isNaN(value) && (x | 0) === x;
}

function movePlatformToClosing(platID, callback) {
    new Platform(platID, null, function(err, platform) {
        if (err || !platform) {
            var msg = "platform " + platID + " does not exist. err: " + err;
            console.error(msg);
            callback(null);
            return;
        }
        if(platform.params.platid === undefined) platform.params.platid = platID;
        if(platform.params.domain === undefined) platform.params.domain = "common";

        platform.addToClosePlatforms(function(err) {
            if (err) {
                console.error("failed adding platform " + platID + " to platforms_close");
            }
            console.log("platform " + platID + " moved to close list");
            callback(null);
        });
    });
}
