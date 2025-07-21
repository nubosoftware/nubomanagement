"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var async = require('async');
var userUtils = require('../userUtils.js');

function get(req, res) {
    logger.info("deleteUserDeviceStorage");
    
    var email = req.params.email;
    var deviceId = req.params.deviceId;
    
    // Validate parameters
    if (!email || !deviceId) {
        logger.error("deleteUserDeviceStorage: Missing required parameters");
        res.send({
            status: Common.STATUS_ERROR,
            message: "Missing required parameters: email and deviceId"
        });
        return;
    }

    // Validate email format
    if (!require('../nubo_regex.js').emailRegex.test(email)) {
        logger.error("deleteUserDeviceStorage: Invalid email format: " + email);
        res.send({
            status: Common.STATUS_ERROR,
            message: "Invalid email format"
        });
        return;
    }

    logger.info(`deleteUserDeviceStorage: Starting deletion for email: ${email}, deviceId: ${deviceId}`);

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
                logger.error("deleteUserDeviceStorage: Error checking user existence: " + err);
                callback("Error checking user existence");
            });
        },
        // Verify device exists for this user
        function(callback) {
            Common.db.UserDevices.findOne({
                attributes: ['imei'],
                where: {
                    email: email,
                    imei: deviceId
                }
            }).then(function(device) {
                if (!device) {
                    logger.warn(`deleteUserDeviceStorage: Device ${deviceId} not found for user ${email}, proceeding anyway`);
                }
                callback(null);
            }).catch(function(err) {
                logger.error("deleteUserDeviceStorage: Error checking device existence: " + err);
                callback(null); // Continue anyway
            });
        },
        // Perform the deletion
        function(callback) {
            userUtils.deleteUserDeviceStorage(email, deviceId, function(err) {
                if (err) {
                    logger.error("deleteUserDeviceStorage: Deletion failed: " + err);
                    callback("Storage deletion failed: " + err);
                    return;
                }
                logger.info(`deleteUserDeviceStorage: Successfully deleted storage for ${email}:${deviceId}`);
                callback(null);
            });
        }
    ], function(err) {
        if (err) {
            logger.error("deleteUserDeviceStorage: " + err);
            res.send({
                status: Common.STATUS_ERROR,
                message: err
            });
        } else {
            res.send({
                status: Common.STATUS_OK,
                message: `Successfully deleted device storage for ${email}:${deviceId}`
            });
        }
    });
}

module.exports = {
    get: get
};
