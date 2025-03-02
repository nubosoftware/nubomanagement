"use strict";

/*
 * @author Ori Sharon get security passcode policy for organization
 */
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var async = require('async');
var Common = require('../common.js');
var logger = Common.getLogger(__filename);

var ILLEGAL_PASSCODETYPECHANGE = -1;

// first call goes to here
function getSecurityPasscode(req, res, domain) {
    // http://login.nubosoftware.com/getPasscodePolicy?session=[]?getpasscodetypechange=[]
    res.contentType = 'json';

    getSecurityPolicyFromDB( req, res, domain, function(err, obj) {
        if (err) {
            res.send({
                status : '0',
                message : "Internal error: " + err
            });
        }
        let resobj = {
            status : "1",
            message : "Request was fulfilled",
            passcodeType : obj.passcodeType,
            passcodeMinChars : obj.passcodeMinChars,
            passcodeExpirationDays : obj.passcodeExpirationDays,
            passcodetypechange : obj.passcodetypechange,
            adminSecurityConfig: obj.adminSecurityConfig
        };
        if (req.nubodata.adminLogin) {
            resobj.clientauthtype = obj.clientauthtype;
            resobj.secondauthmethod = obj.secondauthmethod;
            resobj.otptype = obj.otptype;
        } else {
            logger.ingo("req.nubodata.adminLogin mpt found");
        }

        var json = JSON.stringify(resobj);
        res.end( json );
    });
}

function getSecurityPolicyFromDB(req, res, domain, callback) {

    Common.db.Orgs.findAll({
        attributes : [ 'passcodetype', 'passcodeminchars', 'passcodeexpirationdays','clientauthtype' , 'secondauthmethod' , 'otptype', 'admin_security_config' ],
        where : {
            maindomain : domain
        },
    }).complete(function(err, results) {

        if (!!err) {
            logger.error('err: ' + err);
            callback(err, null);
            return;
        }

        if (!results || results == "") {
            var msg = "Cannot find security policy.";
            logger.error(msg);
            callback(msg, null);
            return;
        }

        var row = results[0];
        var passcodeType = row.passcodetype != null ? row.passcodetype : '';
        var passcodeMinChars = row.passcodeminchars != null ? row.passcodeminchars : 0;
        var passcodeExpirationDays = row.passcodeexpirationdays != null ? row.passcodeexpirationdays : '';
        var passcodetypechange = req.params.getpasscodetypechange;
        let adminSecurityConfigStr;
        if (!row.admin_security_config) {
            adminSecurityConfigStr = defaultAdminSecurityConfig;
        } else {
            adminSecurityConfigStr = row.admin_security_config;
        }
        const adminSecurityConfig = JSON.parse(adminSecurityConfigStr);
        if (adminSecurityConfig.maxLoginAttempts === undefined) {
            adminSecurityConfig.maxLoginAttempts = 3;
        }

        var obj = {
                passcodeType: passcodeType,
                passcodeMinChars: passcodeMinChars,
                passcodeExpirationDays: passcodeExpirationDays,
                passcodetypechange: passcodetypechange,
                clientauthtype: row.clientauthtype,
                secondauthmethod: row.secondauthmethod,
                otptype: row.otptype,
                adminSecurityConfig: adminSecurityConfig
        };

        async.series([
            function(callback) {
                if (obj.passcodetypechange != undefined && obj.passcodetypechange == 'Y') {
                    getUserPasscodetypechangeFromDB(req,function(err, res) {
                        if (!!err) {
                            callback(err);
                            return;
                        }

                        if (res == 1 || res == 0) {
                            obj.passcodetypechange = res;
                        } else {
                            logger.info('getSecurityPasscode. Illegal passcodetypechange: '+obj.passcodetypechange);
                            obj.passcodetypechange = ILLEGAL_PASSCODETYPECHANGE;
                        }

                        callback(null);
                    });
                } else {
                    obj.passcodetypechange = ILLEGAL_PASSCODETYPECHANGE;
                    callback(null);
                }
            }], function(err) {
                if (!!err) {
                    callback(err, null);
                    return;
                }
                callback(null, obj);
                return;
        });
    });
}

function getUserPasscodetypechangeFromDB(req, callback) {

    var session = req.body.session;
    if (session == null || session.length < 5) {
        var msg = 'getSecurityPasscode. Invalid session';
        logger.error(msg);
        callback(msg,ILLEGAL_PASSCODETYPECHANGE);
        return;
    }

    new Session(session, function(err, obj) {
        if (err || !obj) {
            var msg = "getSecurityPasscode. Session does not exist. err:" + err;
            logger.error(msg);
            callback(msg,ILLEGAL_PASSCODETYPECHANGE);
            return;
        }
        //logger.info('Session found: '+JSON.stringify(obj,null,2));
        var email = obj.params.email;
        Common.db.User.findAll({
            attributes : [ 'passcodetypechange' ],
            where : {
                email : email
            },
        })
        .complete(function(err, results) {

            if (!!err) {
                var msg = "getSecurityPasscode. Error on get passcodetypechange from email: " + session + ", err: " + err;
                logger.error(msg);
                callback(err,ILLEGAL_PASSCODETYPECHANGE);
                return;
            }

            if (!results) {
                var msg = "getSecurityPasscode. Error on get passcodetypechange from email. Could not find session: " + session;
                logger.error(msg);
                callback(msg,ILLEGAL_PASSCODETYPECHANGE);
                return;
            }

            results.forEach(function(row) {
                callback(null,row.passcodetypechange);
            });
        });
    });
}

var GetSecurityPasscode = {
    get : getSecurityPasscode,
    getSecurityPolicyFromDB : getSecurityPolicyFromDB
};

module.exports = GetSecurityPasscode;
