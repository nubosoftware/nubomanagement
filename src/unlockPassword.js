var Common = require('./common.js');
var checkPasscode = require('./checkPasscode.js');
var logger = Common.getLogger(__filename);

function resendUnlockPasswordLink(req, res, next) {
    var activationKey = req.params.activationKey;

    logger.info("resendUnlockPasswordLink: " + activationKey);

    Common.db.Activation.findAll({
        attributes : ['email', 'status', 'deviceid'],
        where : {
            activationkey : activationKey
        },
    }).complete(function(err, results) {

        if (!!err) {
            logger.error('resendUnlockPasswordLink: ' + err);
            res.send({
                status : Common.STATUS_ERROR,
                message : 'Internal Error'
            });
            return;
        }

        if (!results || results == "") {
            logger.error("resendUnlockPasswordLink: Cannot find user to send unlock password email");
            res.send({
                status : Common.STATUS_ERROR,
                message : 'Internal Error'
            });

            return;
        }

        var email = results[0].email != null ? results[0].email : '';
        var deviceid = results[0].deviceid != null ? results[0].deviceid : '';
        var activation_status = results[0].status != null ? results[0].status : '';
        if (activation_status !== 1) {
            logger.error("resendUnlockPasswordLink: user isn't activated")
            res.send({
                status : Common.STATUS_ERROR,
                message : 'Internal Error'
            });
            return;

        } else {
            checkPasscode.findUserNameSendEmail(email, deviceid,req);
            logger.info("resendUnlockPasswordLink: resent unlock email to: " + email);
            res.send({
                status : Common.STATUS_OK,
                message : 'unlock passcode email sent to user'
            });
            return;
        }
    });

}

function unlockPassword(req, res, next) {

    var status = 1;
    var email = req.params.email;
    var loginemailtoken = req.params.loginemailtoken;
    var mainDomain = req.params.mainDomain;
    var deviceID = req.params.deviceID;

    Common.db.User.findAll({
        attributes : ['loginemailtoken'],
        where : {
            email : email
        },
    }).complete(function(err, results) {

        if (!!err) {
            logger.error("unlockPassword:" + err);
            res.send({
                status : Common.STATUS_ERROR,
                message : 'Internal Error'
            });
            return;
        }

        if (!results || results == "") {
            logger.error("unlockPassword: Cannot find user " + email);
            res.send({
                status : Common.STATUS_ERROR,
                message : 'Internal Error'
            });
            return;
        }

        var loginEmailToken = results[0].loginemailtoken != null ? results[0].loginemailtoken : '';
        if (loginEmailToken === loginemailtoken) {
            // update login attempts to 0

            Common.db.UserDevices.update({
                loginattempts : '0'
            }, {
                where : {
                    email : email,
                    imei : deviceID,
                    maindomain: mainDomain
                }
            }).then(function() {
                var msg = "password of user " + email + " is successfully unlocked";
                res.send({
                    status : Common.STATUS_OK,
                    message : msg
                });
                logger.info("unlockPassword: " + msg);
                return;

            }).catch(function(err) {
                logger.error("unlockPassword: " + err);
                res.send({
                    status : Common.STATUS_ERROR,
                    message : 'Internal Error'
                });
                return;
            });

        } else {
            logger.error("unlockPassword: incorrect loginemailtoken. may be a hacking attempt");
            res.send({
                status : Common.STATUS_ERROR,
                message : 'Internal Error'
            });
            return;
        }
    });

}

var unlockPassword = {
    unlockPassword : unlockPassword,
    resendUnlockPasswordLink : resendUnlockPasswordLink
};
module.exports = unlockPassword;
