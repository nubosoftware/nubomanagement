"use strict";

/* @author Ori Sharon
 *  In this class we would reset the loginAttempts attribute under users table to 0
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var User = require('../user.js');
var userUtils = require('../userUtils.js');
var eventLog = require('../eventLog.js');
var EV_CONST = eventLog.EV_CONST;

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

function resetLoginAttemptsToUser(req, res, next) {

    // https://login.nubosoftware.com/resetLoginAttemptsToUser?session=[]&email=[email]

    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var email = req.params.email;
    if (!email || email == "") {
        logger.info("resetLoginAttemptsToUser. Invalid email");
        status = 0;
        msg = "Invalid parameters";
    }

    if (status != 1) {
        res.send({
            status : status,
            message : msg
        });
        return;
    }

    loadAdminParamsFromSession(req, res, function(err, login) {

        if (!setting.getDebugMode()) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }
            var domain = login.loginParams.mainDomain;
        } else {
            var domain = "nubosoftware.com";
        }

        resetLoginAttemptsToUserInDB(res, email, domain, function(err) {

            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }

            res.send({
                status : '1',
                message : 'reset login attempts successfully'
            });
            return;
        });

    });

}

function resetLoginAttemptsToUserInDB(res, email, domain, callback) {

	email = email.toLowerCase();

    Common.db.User.update({
        loginattempts : 0
    }, {
        where : {
            email : email,
            orgdomain : domain
        }
    }).then(function() {
        // Log account unlock event with unlock method
        const unlockInfo = `Account unlocked by admin, unlock method: admin_reset`;
        eventLog.createEvent(EV_CONST.EV_ACCOUNT_UNLOCKED, email, domain, unlockInfo, EV_CONST.INFO);
        
        callback(null);
    }).catch(function(err) {
        var msg = "Internal error while reseting login attempts for user: " + email + 'err: ' + err;
        logger.info(msg);
        callback(msg);
    });

}

var ResetLoginAttemptsToUser = {
    get : resetLoginAttemptsToUser
};

module.exports = ResetLoginAttemptsToUser;
