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
function addAppRule(req, res, next) {

    // https://login.nubosoftware.com/addAppRule?session=[]&packageName=packageName&ip=1.1.1.1&port=80&protocol=tcp&mask=24&ipVersion=ipVersion

    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var packageName = req.params.packageName;
    var ip = req.params.ip;
    var protocol = req.params.protocol;
    var ipVersion = req.params.ipVersion;
    var port = req.params.port;
    var mask = req.params.mask;

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

        if (!Common.getMobile()) {
            res.send({
                status : '0',
                message : 'Firewall not available'
            });
            return;
        }
        if (!Common.getMobile().firewall.isEnabled()) {
            res.send({
                status : '0',
                message : 'Firewall not available'
            });
            return;
        }

        addAppRuleToDB(res, packageName, ip, port, protocol, mask, domain, ipVersion);

    });

}

/*
 * The 'addAppRuleToDB' function shall receive res and rule params;
 * add rule from db and update online users
 * return status and message
 */
function addAppRuleToDB(res, packageName, ip, port, protocol, mask, domain, ipVersion) {

    Common.db.AppRules.findAll({
        where : {
            packagename : packageName,
            ip : ip,
            port : port,
            protocol : protocol,
            maindomain : domain,
            mask : mask
        },
    }).complete(function(err, results) {

        if (!!err) {
            res.send({
                status : '0',
                message : "Error while reading packageName from database"
            });
        }

        if (!results || results == "") {

            Common.db.AppRules.create({
                packagename : packageName,
                ip : ip,
                port : port,
                protocol : protocol,
                maindomain : domain,
                mask : mask,
                ipversion : ipVersion,
            }).then(function(results) {
                res.send({
                    status : '1',
                    message : "Inserted Successfully"
                });
                
                const firewall = Common.getMobile().firewall;
                firewall.updateOnlineUsersRule(packageName, ip, port, protocol, mask, domain, ipVersion, firewall.Firewall.add, function(err) {
                    if (err) {
                        logger.error(err);
                    }
                    return;
                });

            }).catch(function(err) {
                res.send({
                    status : '0',
                    message : "error on insert users to db"
                });
            });
        } else {
            res.send({
                status : '0',
                message : "Rule already exists"
            });
        }

    });
}

var AddAppRule = {
    get : addAppRule
};

module.exports = AddAppRule;
