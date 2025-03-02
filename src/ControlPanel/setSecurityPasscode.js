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

async function setAdminAuthentication(req, res) {
    try {
        let adminLogin = req.nubodata.adminLogin;
        if (!adminLogin) {
            res.writeHead(403, {
                "Content-Type": "text/plain"
            });
            res.end("403 Forbidden\n");
            return;
        }
        let selectedDomain = adminLogin.getMainDomain();    
        const adminSecurityConfig = req.params.adminSecurityConfig;
        if (!adminSecurityConfig) {
            throw new Error('adminSecurityConfig is required');
        }
        logger.info(`setAdminAuthentication. domain: ${selectedDomain}, adminSecurityConfig: ${JSON.stringify(adminSecurityConfig,null,2)}`);
        await Common.db.Orgs.update({
            admin_security_config: JSON.stringify(adminSecurityConfig),
        }, {
            where: {
                maindomain: selectedDomain
            }
        });
        res.send({
            status: '1',
            message: 'Admin authentication updated successfully'
        });
    } catch (error) {
        logger.error(`setAdminAuthentication. Error: ${error}`);
        res.send({
            status: '0',
            message: error
        });
    }
}

var SetSecurityPasscode = {
    get: setSecurityPasscode,
    setAdminAuthentication: setAdminAuthentication
};

module.exports = SetSecurityPasscode;