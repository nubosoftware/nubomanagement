"use strict";

/**
 *  sendEmail.js
 *
 */
var async = require('async');
var Common = require('../common.js');
var ThreadedLogger = require('../ThreadedLogger.js');
var UserUtils = require('../userUtils.js');
var platformModule = require('../platform.js');
var Platform = platformModule.Platform;

Common.loadCallback = function(err) {
    if (err) {
        console.log("Error: " + err);
        Common.quit();
        return;
    }

    var logger = new ThreadedLogger(Common.getLogger(__filename));

    //check if I am root (need to copy and change file under root permissons)
    var user = process.env.USER;
    if (user !== 'root') {
        console.error("the script must be executed as root");
        logger.info('');
        Common.quit();
    }

    var platid;
    if (process.argv.length >= 3) {
        platid = process.argv[2];
    }

    async.waterfall([
        function(callback) {
            logger.info("Getting platform");
            if (platid) {
                new Platform(platid, null, callback);
            } else {
                platformModule.getAvailablePlatform(null, null, "common", logger, function(err, platform, lock) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    if (lock && lock.isAquired()) {
                        lock.release(function(lockErr, replay) {
                            callback(null, platform);
                            return;
                        });
                    } else {
                        callback(null, platform);
}
                });
            }
        },
        function(platform, callback) {
            logger.info("platform " + platform.params.platid);
            logger.info("Creating newuser.tar.gz");
            UserUtils.createNewUserTar(platform, callback);
        }
    ], function(err) {
        if (err) {
            logger.error("createNewUserTar: " + err);
        }
        Common.quit();
    });
};
