"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var async = require('async');
var userUtils = require('../userUtils.js');

function get(req, res) {
    logger.info("getUserGeneralStorageSize");
    
    var email = req.params.email;
    
    // Validate parameters
    if (!email) {
        logger.error("getUserGeneralStorageSize: Missing required parameter: email");
        res.send({
            status: Common.STATUS_ERROR,
            message: "Missing required parameter: email"
        });
        return;
    }

    // Validate email format
    if (!require('../nubo_regex.js').emailRegex.test(email)) {
        logger.error("getUserGeneralStorageSize: Invalid email format: " + email);
        res.send({
            status: Common.STATUS_ERROR,
            message: "Invalid email format"
        });
        return;
    }

    logger.info(`getUserGeneralStorageSize: Calculating size for email: ${email}`);

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
                logger.error("getUserGeneralStorageSize: Error checking user existence: " + err);
                callback("Error checking user existence");
            });
        },
        // Calculate the storage size
        function(callback) {
            userUtils.getUserGeneralStorageSize(email, function(err, sizeInKB) {
                if (err) {
                    logger.error("getUserGeneralStorageSize: Size calculation failed: " + err);
                    callback("Size calculation failed: " + err);
                    return;
                }
                logger.info(`getUserGeneralStorageSize: Successfully calculated general storage size for ${email} = ${sizeInKB} KB`);
                callback(null, sizeInKB);
            });
        }
    ], function(err, results) {
        if (err) {
            logger.error("getUserGeneralStorageSize: " + err);
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
                message: `Successfully calculated general storage size for ${email}`,
                data: {
                    email: email,
                    type: "general",
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
