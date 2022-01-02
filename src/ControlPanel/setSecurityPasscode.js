"use strict";

/*
 * @author Ori Sharon set security passcode policy for organization
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var async = require('async');
var updateSecurityPolicy = require('./updateSecurityPolicy.js');

// first call goes to here
function setSecurityPasscode(req, res, domain) {
    // http://login.nubosoftware.com/setPasscodePolicy?session=[]&passcodeType=[]&minChars=[]&expirationDays=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var passcodeType = req.params.passcodeType;
    if (!passcodeType || passcodeType == "") {
        logger.info("setSecurityPasscode. Invalid passcodeType");
        status = 0;
        msg = "Invalid parameters";
    }

    var minChars = req.params.minChars;
    if (!minChars || minChars == "" || minChars < 6) {
        logger.info("setSecurityPasscode. Invalid minChars");
        status = 0;
        msg = "Invalid parameters";
    }

    var expirationDays = req.params.expirationDays;
    if (!expirationDays || expirationDays == "") {
        logger.info("setSecurityPasscode. Invalid expirationDays");
        status = 0;
        msg = "Invalid parameters";
    }

    var clientauthtype = req.params.clientauthtype;
    var secondauthmethod = req.params.secondauthmethod;
    var otptype = req.params.otptype;

    if (status != 1) {
        res.send({
            status: status,
            message: msg
        });
        return;
    }

    updateSecurityPolicy(Common, passcodeType, minChars, expirationDays, clientauthtype, secondauthmethod, otptype, domain, logger, function(err) {
        if (err) {
            res.send({
                status: '0',
                message: err
            });
        } else {
            res.send({
                status: status,
                message: msg
            });
        }
    });
}

var SetSecurityPasscode = {
    get: setSecurityPasscode
};

module.exports = SetSecurityPasscode;