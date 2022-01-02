"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

/*
 * addAppRule
 * req@param
 *          session, packageName, ip, port, protocol, mask, ipVersion
 * req@res
 *          status, message
 */
function getNetwotkAccessStatus(req, res, next) {

    // https://login.nubosoftware.com/getNetwotkAccessStatus?session=[]

    res.contentType = 'json';

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

        getNetwotkAccessStatusFromDB(res, domain);

    });

}

/*

 */
function getNetwotkAccessStatusFromDB(res, domain) {

    Common.db.Orgs.findAll({
        attributes : ['accessstatus'],
        where : {
            maindomain : domain
        },
    }).complete(function(err, results) {

        if (!!err) {
            res.send({
                status : '1',
                message : "open"
                //message : "Error while reading AccessStatus from database"
            });
        } else {
            var accessStatus = results[0].accessstatus;
            res.send({
                status : '1',
                message : accessStatus
            });
        }

    });
}

var GetNetwotkAccessStatus = {
    get : getNetwotkAccessStatus
};

module.exports = GetNetwotkAccessStatus;
