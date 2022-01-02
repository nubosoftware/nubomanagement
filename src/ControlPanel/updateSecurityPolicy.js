"use strict";

var async = require('async');
const { QueryTypes } = require('sequelize');

function updateSecurityPolicy(Common, passcodeType, minChars, expirationDays, clientauthtype, secondauthmethod, otptype, domain, logger, callback) {
    var status = 0;
    var msg = '';
    var oldPasscodeType = 0;
    if (!clientauthtype || clientauthtype == "") {
        clientauthtype = 1;
    }
    if (!secondauthmethod || secondauthmethod == "") {
        secondauthmethod = 3;
    }

    if (!otptype || otptype == "") {
        otptype = 0;
    }

    async.series([
        // get prev data
        function(callback) {
            Common.db.Orgs.findAll({
                attributes: ['passcodetype'],
                where: {
                    maindomain: domain
                },
            }).complete(function(err, results) {
                if (!!err) {
                    logger.error('updateSecurityPolicy. get prev data err: ' + err);
                    status = 0;
                    msg = "Internal error: " + err;
                    return callback(err);
                }

                if (results && results.length > 0) {
                    var row = results[0];
                    oldPasscodeType = row.passcodetype;
                }

                callback(null);
            });
        },
        // update orgs
        function(callback) {
            Common.db.Orgs.update({
                passcodetype: passcodeType,
                passcodeminchars: minChars,
                passcodeexpirationdays: expirationDays,
                clientauthtype: clientauthtype,
                secondauthmethod: secondauthmethod,
                otptype: otptype
            }, {
                where: {
                    maindomain: domain
                }
            }).then(function() {
                // console.log('updateSecurityPolicy. Updated passcode security policy successfully');
                status = 1;
                msg = "Updated passcode security policy successfully";
                callback(null);
            }).catch(function(err) {
                logger.error('updateSecurityPolicy. Error on updating passcode security policy err: ' + err);
                status = 0;
                msg = 'Error on updating passcode security policy: ' + err;
                callback(err);
            });
        },

        // update all domain users
        function(callback) {
            if (oldPasscodeType == passcodeType) {
                callback(null);
            } else {
                var query = ' update users as u1 inner join users as u2 ON (u1.email=u2.email)' +
                    ' set u1.passcodetypechange=(((u1.passcodetypechange+1)%2) +u1.passcodetypechange*(u1.passcodetypeprev+ :passcodeTypeParam))%2 ,' +
                    ' u1.passcodetypeprev=(((u1.passcodetypechange+1)%2)* :oldPasscodeType) + (u2.passcodetypechange*u1.passcodetypeprev), ' +
                    'u1.passcodeUpdate= :passcodeUpdate';

                var passcodeUpdate = new Date(1970, 0, 1);
                var queryWhereClause = " where u1.passcode IS NOT NULL AND u1.passcode <>'' AND u1.orgdomain= :domain";
                var queryParams = {
                    passcodeTypeParam: passcodeType,
                    oldPasscodeType: oldPasscodeType,
                    passcodeUpdate: passcodeUpdate,
                    domain: domain
                };

                Common.sequelize.query(query + queryWhereClause, { replacements: queryParams, type: QueryTypes.UPDATE}).then(function(results) {
                    callback(null);
                }).catch(function(err) {
                    callback(err);
                });
            }
        }
    ], function(err) {
        if (err) {
            logger.error("updateSecurityPolicy: " + err);
            return callback(err);
        }

        callback(null);

    });
}


module.exports = updateSecurityPolicy;
