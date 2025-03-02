"use strict";

/*
 * @author hanan Baranes get waiting for approval devices for organization
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
const { QueryTypes } = require('sequelize');
const { getAdminSecurityConfig } = require('../setPasscode.js');

// first call goes to here
async function getWaitingForApprovalProfiles(req, res, domain) {
    // http://login.nubosoftware.com/getWaitingForApprovalProfiles?session=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    try {
        const profiles = await getWaitingApprovalProfilesFromDB(res, domain);
        var json = {
            status : Common.STATUS_OK,
            message : 'Get pending approval profiles succeeded',
            profiles : profiles
        };

        res.send(json);
        return;
    } catch (err) {
        res.send({
            status : Common.STATUS_ERROR,
            message : `Error getting waiting for approval profiles: ${err}`
        });
        return;
    }
}

async function getWaitingApprovalProfilesFromDB(res, domain) {
    try {
        var profiles = {};
        var retProfiles = [];
        var expirationDateInit = new Date();

        var query = 'select a1.email, a1.firstname, a1.lastname, a1.deviceid, a1.resetpasscode, a1.devicetype, a1.status,'
            + ' u2.loginattempts, a1.devicename,'
            + ' u3.firstname ufirst, u3.lastname ulast'
            + ' FROM activations as a1'
            + ' LEFT JOIN user_devices as u2'
            + ' ON a1.email=u2.email AND'
            + ' a1.deviceid=u2.imei'
            + ' LEFT JOIN users as u3'
            + ' ON a1.email=u3.email ';

        var queryWhereClause = ' WHERE '
            + ' a1.maindomain= :domain'
            + ' AND ((a1.status=0 AND expirationdate >= :expirationDateInit)'
            + ' OR (a1.status=1 AND u2.loginattempts>=:maxLoginAttempts AND u2.active=1)' // end user locked
            + ' OR (a1.status=201 AND u2.loginattempts>=:maxLoginAttemptsAdmin AND u2.active=1)' // admin locked
            + ' OR (a1.status=200 AND expirationdate >= :expirationDateInit)'
            + ' OR (a1.status=202 AND expirationdate >= :expirationDateInit)'
            + ' OR (a1.status=101 AND expirationdate >= :expirationDateInit)'
            + ' OR (a1.status=102 AND expirationdate >= :expirationDateInit)'
            + ' OR (a1.status=100 AND expirationdate >= :expirationDateInit));';

        const maxLoginAttempts = Common.hasOwnProperty("maxLoginAttempts") ? 
            Common.maxLoginAttempts : 3;
        
            
        // load the org security config
        const adminSecurityConfig = await getAdminSecurityConfig(domain);
        const maxLoginAttemptsAdmin = adminSecurityConfig.maxLoginAttempts || 99999;
        var queryParams = {domain:domain, expirationDateInit:expirationDateInit, maxLoginAttempts:maxLoginAttempts, maxLoginAttemptsAdmin:maxLoginAttemptsAdmin};

    
        const results = await Common.sequelize.query(query + queryWhereClause, { replacements: queryParams, type: QueryTypes.SELECT});

        if (!results || results == "") {
            logger.info('No pending approval devices');
            res.send({
                status : '1',
                message : "No pending approval devices",
                profiles : []
            });
            return [];
        }

        results.forEach(function(row) {
            // get all values of current row
                var email = row.email != null ? row.email : '';
                var status = row.status != null ? row.status : 0;
                var firstName = row.firstname != null ? row.firstname : '';
                if (row.ufirst != null) {
                    firstName = row.ufirst;
                }
                var lastName = row.lastname != null ? row.lastname : '';
                if (row.ulast != null) {
                    lastName = row.ulast;
                }
                var deviceid = row.deviceid != null ? row.deviceid : '';
                //var devicetype = row.devicetype != null ? row.devicetype : '';
                var resetpasscode = row.resetpasscode != null ? row.resetpasscode : '';
                var loginattempts = row.loginattempts != null ? row.loginattempts : 0;
                var devicename = row.devicename != null ? row.devicename : '';

                var type = '';

                if (status == 0) {
                    if (resetpasscode == 0) {
                        type = 'activate'; // Need to activate
                    } else {
                        type = 'reset passcode' // Need to Reset Passcode
                    }
                } else if (status == 1 && loginattempts >= maxLoginAttempts) {
                    type = 'unlock passcode' // Need to unlock
                } else if (status == 201 && loginattempts >= maxLoginAttemptsAdmin) {
                    type = 'unlock admin' // Need to unlock
                } else if (status == Common.STATUS_RESET_PASSCODE_PENDING) {
                    type = 'reset passcode' // Need to Reset Passcode
                } else if (status == Common.STATUS_ADMIN_ACTIVATION_PENDING) {
                    type = 'admin' // Need to approve admin control panel access
                } else if (status == Common.STATUS_ADMIN_RESET_PENDING) {
                    type = 'admin reset' // Need to approve admin control panel access
                } else if (status == Common.STATUS_RESET_BIOMETRIC_PENDING) {
                    type = 'reset biometric' // Need to approve admin control panel access
                } else if (status == Common.STATUS_RESET_OTP_PENDING) {
                    type = 'reset otp' // Need to approve admin control panel access
                }

                if (email in profiles) {
                    var device = {
                        deviceid : deviceid,
                        devicetype : devicename,
                        type : type
                    }
                    profiles[email].devices.push(device);
                } else {
                    // if false, set the 1st deviceType
                    profiles[email] = {
                        email : email,
                        firstName : firstName,
                        lastName : lastName,
                        devices : [{
                            deviceid : deviceid,
                            devicetype : devicename,
                            type : type
                        }]
                    };
                }
        });

        // convert profiles map to array
        for (var email in profiles) {
            retProfiles.push(profiles[email]);
        }

        return retProfiles;

    } catch (err) {
        logger.info('Cant select pending users: ' + err);
        throw err;
    }
}

async function getDeviceName(res, email, deviceid, domain) {
    try {
        const results = await Common.db.UserDevices.findAll({
            attributes: ['devicename'],
            where: {
                email: email,
                imei: deviceid,
                maindomain: domain
            },
        });

        if (!results || results == "") {
            return null;
        }

        var row = results[0];
        var deviceName = row.devicename != null ? row.devicename : '';
        return deviceName;
    } catch (err) {
        throw err;
    }
}

var GetWaitingForApprovalProfiles = {
    get : getWaitingForApprovalProfiles
};

module.exports = GetWaitingForApprovalProfiles;
