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
 * deleteAppRule
 * req@param
 *          session, packageName, ip, port, protocol, mask, ipVersion, ruleid
 * req@res
 *          status, message
 */
function deleteAppRule(req, res, next) {

    // https://login.nubosoftware.com/deleteAppRulesession=[]&packageName=packageName&ip=1.1.1.1&port=80&protocol=tcp&mask=24&ipVersion=ipVersion&ruleid=ruleid

    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var packageName = req.params.packageName;
    var packageNameExpression = /^([a-zA-Z0-9_\.\-])+$/;
    if (!packageName || packageName == "" || !(packageNameExpression.test(packageName))) {
        status = 0;
        msg = "Invalid packageName";
    }
    if (!Common.getMobile()) {
        res.send({
            status : '0',
            message : 'Firewall not available'
        });
        return;
    }
    const firewall = Common.getMobile().firewall;
    if (!firewall.isEnabled()) {
        res.send({
            status : '0',
            message : 'Firewall not available'
        });
        return;
    }

    var ip = req.params.ip;
    firewall.validateIP(ip, function(cb) {
        if (cb === false) {
            logger.info("Invalid ip ");
            status = 0;
            msg = "Invalid ip";
        }
    });

    var port = req.params.port;
    if (!port || port == "" || !port.match(/^\d+$/) || !(port < 61001)) {
        status = 0;
        msg = "Invalid port";
    }

    var protocol = req.params.protocol;
    if (!protocol || protocol == "" || !(protocol == "TCP" || protocol == "UDP" || protocol == "ICMP" || protocol == "All Protocols")) {
        status = 0;
        msg = "Invalid protocol";

    }

    var mask = req.params.mask;
    if (!mask || mask == "" || !((mask / 8) % 1 == 0)) {
        status = 0;
        msg = "Invalid mask";
    }

    var ipVersion = req.params.ipVersion;
    if (!(ipVersion == firewall.Firewall.ipv4 || ipVersion == firewall.Firewall.ipv6)) {
        status = 0;
        msg = "Invalid ipVersion";
    }

    var ruleid = req.params.ruleid;
    if (!ruleid || ruleid == "") {
        status = 0;
        msg = "Invalid ruleid";
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

        deleteAppRuleFromDB(res, packageName, ip, port, protocol, mask, domain, ipVersion, ruleid,firewall);

    });

}

/*
 * The 'deleteAppRuleFromDB' function shall receive res and rule params;
 * delete rule from db and update online users
 * return status and message
 */
function deleteAppRuleFromDB(res, packageName, ip, port, protocol, mask, domain, ipVersion, ruleid,firewall) {

    // delete the user from db
    Common.db.AppRules.destroy({
        where : {
            ruleid : ruleid,
            maindomain : domain
        }
    }).then(function() {
        res.send({
            status : '1',
            message : "deleted rule from db successfully"
        });
        if (!Common.platformSettings || Common.platformSettings["enable_firewall"] !== true ) {
            // skip firewall configuration
            return;
        }
        firewall.updateOnlineUsersRule(packageName, ip, port, protocol, mask, domain, ipVersion, firewall.Firewall.remove, function(err) {
            if (err) {
                logger.error(err);
            }
            return;
        });
    }).catch(function(err) {
        res.send({
            status : '0',
            message : err
        });
        return;
    });
}

var DeleteAppRule = {
    get : deleteAppRule
};

module.exports = DeleteAppRule;
