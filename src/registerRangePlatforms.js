"use strict";

/**
 *	registerPlatform.js
 *	Register new platform usign the default hostline and default gatway
 *  You can call this script mutiple times to add multiple platforms
 */
var async = require('async');
var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var platformModule = require('./platform.js');
var ThreadedLogger = require('./ThreadedLogger.js');

Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;

    var platType, arg2, arg3;
    if (process.argv.length>=3) {
  	    arg2 = process.argv[2];
    }
    if (process.argv.length>=4) {
        arg3 = process.argv[3] || process.argv[2];
    }
    if (isNaN(arg2) || isNaN(arg3) || (arg3 < arg2)) {
        logger.error("Error: bag arguments");
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
                var opts = {
                    min: platId,
                    max: platId,
                    logger: logger
                }
                platformModule.registerPlatformNum(opts, function(err){
	                if (err) {
	                    logger.error("##################");
	                    logger.error("# Cannot start platform " + platId);
		                logger.error("# Error: "+err);
		                logger.error("##################");
             	    } else {
	                    logger.info("registration of platform " + platId + " done");
	                }
	                callback(null);
                });
            },
            function(err) {
                if (err) {
		            logger.error("Error: "+err);
		            process.exit(1);
             	} else {
	                logger.info("Done");
	                process.exit(0);
	            }
            }
        );


    }
};
