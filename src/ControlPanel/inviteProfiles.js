"use strict";

/* @author Ori Sharon
 *  In this class we send email invitations to profiles
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var qs = require('querystring');
var util = require('util');
var setting = require('../settings.js');
var async = require('async');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

// first call goes to here
function inviteProfiles(req, res, next) {
    // http://login.nubosoftware.com/deleteProfiles?session=[]&email=[]]&email=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var email = req.params.email;
    if (!email || email == "") {
        logger.info("inviteProfiles. Invalid email");
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

        var domain = "nubosoftware.com";
        if (!setting.getDebugMode()) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }
            domain = login.loginParams.mainDomain;
        }

        if (!util.isArray(email)) {
            email = [email];
        }

        async.each(
            email,
            function(email, cb) {
                getFirstLastNameOfProfile(res, email, domain, function(err) {
                    if (err) {
                        cb(err);
                        return;
                    }
                    cb(null);
                    return;
                });
            },
            function(err) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }

            // if we didn't receive any error, then we send this response back
            res.send({
                status : '1',
                message : "invites profiles successfully"
            });
            return;
        });
    });
}

function getFirstLastNameOfProfile(res, email, domain, callback) {
    var errormsg = "";

    Common.db.User.findAll({
        attributes : ['firstname', 'lastname','orgemail'],
        where : {
            email : email,
            orgdomain : domain
        },
    }).complete(function(err, results) {

        if (!!err) {
            logger.error("EMAIL ERR:: " + err);
            callback(err);
            return;

        }
        if (!results || results == "") {
            errormsg = 'Cannot find profile: ' + email;
            callback(errormsg);
            return;

        }
        async.eachSeries(
            results,
            function(row, callback) {
                var firstName = row.firstname ? row.firstname : "Dear";
                var lastName = row.lastname ? row.lastname : "Sir";

                inviteSpecificProfiles(res, email, firstName, lastName, domain, row.orgemail, function(err) {
                    callback(err);
                });

            },
            callback
        );
    });

}

function inviteSpecificProfiles(res, email, first, last, domain, orgemail, callback) {

    var url = "https://nubosoftware.com/app-download.html";

    Common.db.Orgs.findAll({
        attributes : ['inviteurl'],
        where : {
            maindomain : domain
        },
    }).complete(function(err, results) {
        if (!!err) {
            logger.error("inviteSpecificProfiles.  " + err);
        }

        if (!results || results == "") {
            logger.error("inviteSpecificProfiles.  Cannot find inviteurl for domain " + domain);
        } else {
            url = results[0].inviteurl;
        }

        let userEmail;
        if (orgemail && orgemail.length > 2) {
            userEmail = orgemail;
        } else {
            userEmail = email;
        }

        // setup e-mail data with unicode symbols
        var mailOptions = {
            from : Common.emailSender.senderEmail,
            // sender address
            fromname : Common.emailSender.senderName,
            to : userEmail,
            // list of receivers
            toname : first + " " + last,
            subject : "Invitation to Nubo",
            // Subject line
            text : "Dear " + first + " " + last +
                ", \n Your IT manager has invited you to run Nubo Player, Please click the following link from your mobile device to download your Nubo Player:\n\n" + "activationLinkURL TEST!!" + "\n\n- The Nubo Team",
            // plaintext body
            html : "<p>Dear " + first + " " + last +
                ",</p><p> \n Please click the following link from your mobile device to download your Nubo Player:</p>\n\n" +
                "<p><a href=\"" + url + "\">" + first + " " + last +
                " – Player Activation</a></p>  \n\n<p>- The Nubo Team</p>" // html body
        };
        logger.info("Before send message");
        Common.mailer.send(mailOptions, function(success, message) {
            if (!success) {
                logger.info("sendgrid error: " + message);
                callback(message);
                return;
            } else {
                callback(null);
                return;
            }
        });
    });
}

var InviteProfiles = {
    get : inviteProfiles
};

module.exports = InviteProfiles;
