"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var async = require('async');
var userUtils = require('../userUtils.js');

function get(req, res) {
    logger.info("deleteAllUserStorage");
    
    var email = req.params.email;
    
    // Validate parameters
    if (!email) {
        logger.error("deleteAllUserStorage: Missing required parameter: email");
        res.send({
            status: Common.STATUS_ERROR,
            message: "Missing required parameter: email"
        });
        return;
    }

    // Validate email format
    if (!require('../nubo_regex.js').emailRegex.test(email)) {
        logger.error("deleteAllUserStorage: Invalid email format: " + email);
        res.send({
            status: Common.STATUS_ERROR,
            message: "Invalid email format"
        });
        return;
    }

    logger.info(`deleteAllUserStorage: Starting deletion for email: ${email}`);

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
                logger.error("deleteAllUserStorage: Error checking user existence: " + err);
                callback("Error checking user existence");
            });
        },
        // Perform the deletion
        function(callback) {
            userUtils.deleteAllUserStorage(email, function(err) {
                if (err) {
                    logger.error("deleteAllUserStorage: Deletion failed: " + err);
                    callback("Storage deletion failed: " + err);
                    return;
                }
                logger.info(`deleteAllUserStorage: Successfully deleted all storage for ${email}`);
                callback(null);
            });
        }
    ], function(err) {
        if (err) {
            logger.error("deleteAllUserStorage: " + err);
            res.send({
                status: Common.STATUS_ERROR,
                message: err
            });
        } else {
            res.send({
                status: Common.STATUS_OK,
                message: `Successfully deleted all storage for ${email}`
            });
        }
    });
}

module.exports = {
    get: get
};
