"use strict";

/**
 *  killRangePlatforms.js
 *  Kill platform by platform id
 *  Usage: node killRangePlatforms.js <start platid> <end platid>
 */
var async = require('async');
var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var platformModule = require('./platform.js');
var ThreadedLogger = require('./ThreadedLogger.js');
var spawn = require('child_process').spawn;

Common.loadCallback = function(err) {
    if (err) {
      	console.log("Error: "+err);
      	Common.quit();
      	return;
    }
    var platType, arg2, arg3;
    if (process.argv.length>=3) {
  	    arg2 = process.argv[2];
    }
    if (process.argv.length>=4) {
  	    arg3 = process.argv[3];
    }
    if (isNaN(arg2) || isNaN(arg3) || (arg3 < arg2)) {
        console.err("Error: bag arguments");
      	Common.quit();
      	return;
    } else {
        var platIds = [];
        for (var i = arg2; i <= arg3; i++) {
            platIds.push(i);
        }
        async.eachLimit(
            platIds, 10,
            function(platId, callback) {
                var logger = new ThreadedLogger(Common.getLogger(__filename));
                var proc = require('child_process').spawn(
                    "/usr/bin/node",
                    ['killPlatform.js', platId],
                    {stdio: [ 'ignore', process.stdout, process.stderr ]}
                );
                proc.on('close', function (code) {
                    logger.info("request to kill platform " + platId + " done, exit code=" + code);
                    callback(null);
                })
            },
            function(err) {
                if (err) {
		            console.log("Error: "+err);
		            process.exit(1);
             	} else {
	                console.log("No error.");
	                process.exit(0);
	            }
            }
        );


    }
};
