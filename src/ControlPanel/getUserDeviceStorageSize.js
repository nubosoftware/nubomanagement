"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var async = require('async');
var userUtils = require('../userUtils.js');

function get(req, res) {
    logger.info("getUserDeviceStorageSize");
    
    var email = req.params.email;
    var deviceId = req.params.deviceId;
    
    // Validate parameters
    if (!email || !deviceId) {
        logger.error("getUserDeviceStorageSize: Missing required parameters");
        res.send({
            status: Common.STATUS_ERROR,
            message: "Missing required parameters: email and deviceId"
        });
        return;
    }

    // Validate email format
    if (!require('../nubo_regex.js').emailRegex.test(email)) {
        logger.error("getUserDeviceStorageSize: Invalid email format: " + email);
        res.send({
            status: Common.STATUS_ERROR,
            message: "Invalid email format"
        });
        return;
    }

    logger.info(`getUserDeviceStorageSize: Calculating size for email: ${email}, deviceId: ${deviceId}`);

    async.series([
        // Verify user exists
        function(callback) {
            Common.db.User.findOne({
                attributes: ['email'],
                where: {
                    email: email
                }
            }).then(function(user) {
                if (!user) {
                    callback("User not found: " + email);
                    return;
                }
                callback(null);
            }).catch(function(err) {
                logger.error("getUserDeviceStorageSize: Error checking user existence: " + err);
                callback("Error checking user existence");
            });
        },
        // Calculate the storage size
        function(callback) {
            userUtils.getUserDeviceStorageSize(email, deviceId, function(err, sizeInKB) {
                if (err) {
                    logger.error("getUserDeviceStorageSize: Size calculation failed: " + err);
                    callback("Size calculation failed: " + err);
                    return;
                }
                logger.info(`getUserDeviceStorageSize: Successfully calculated size for ${email}:${deviceId} = ${sizeInKB} KB`);
                callback(null, sizeInKB);
            });
        }
    ], function(err, results) {
        if (err) {
            logger.error("getUserDeviceStorageSize: " + err);
            res.send({
                status: Common.STATUS_ERROR,
                message: err
            });
        } else {
            var sizeInKB = results[1];
            var sizeInMB = Math.round((sizeInKB / 1024) * 100) / 100;
            var sizeInGB = Math.round((sizeInKB / 1024 / 1024) * 100) / 100;
            
            res.send({
                status: Common.STATUS_OK,
                message: `Successfully calculated device storage size for ${email}:${deviceId}`,
                data: {
                    email: email,
                    deviceId: deviceId,
                    sizeKB: sizeInKB,
                    sizeMB: sizeInMB,
                    sizeGB: sizeInGB
                }
            });
        }
    });
}

module.exports = {
    get: get
};
