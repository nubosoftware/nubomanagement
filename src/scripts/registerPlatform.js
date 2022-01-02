"use strict";

/**
 * registerPlatform.js
 * Register new platform usign the default hostline and default gatway
 * You can call this script mutiple times to add multiple platforms
 */
var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var platformModule = require('../platform.js');

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
        arg3 = process.argv[3];
    }
    if (isNaN(arg2)) {
        var opts = {
            platType: platType,
            logger: logger,
            domain: arg2
        };
        platformModule.registerPlatformNum(opts, function(err){
            if (err) {
                logger.error("Error: "+err);
            } else {
                logger.info("No error.");
            }
            Common.quit();
        });
    } else {
        var opts = {
            min: arg2,
            max: arg3 || arg2,
            logger: logger
        }
        platformModule.registerPlatformNum(opts, function(err){
            if (err) {
                logger.error("Error: "+err);
                process.exit(1);
            } else {
                logger.info("Done");
                process.exit(0);
            }
        });
    }
};
