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
 * editAppRule
 * req@param
 *          session, packageName, ip, port, protocol, mask, ipVersion, ruleid
 * req@res
 *          status, message
 */
function editAppRule(req, res, next) {

    // https://login.nubosoftware.com/editAppRule?session=[]&packageName=packageName&ip=1.1.1.1&port=80&protocol=tcp&mask=24&ipVersion=ipVersion&ruleid=ruleid

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
    if (!ruleid || ruleid == "" || !ruleid.match(/^\d+$/)) {
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

        editAppRuleFromDB(res, packageName, ip, port, protocol, mask, domain, ipVersion, ruleid,firewall);

    });

}

/*
 * The 'editAppRuleFromDB' function shall receive res and rule params;
 * update rule in db and update online users
 * return status and message
 */
function editAppRuleFromDB(res, packageName, ip, port, protocol, mask, domain, ipVersion, ruleid,firewall) {

    Common.db.AppRules.findAll({
        where : {
            maindomain : domain,
            ruleid : ruleid,
        },
    }).complete(function(err, result) {
        if (!!err) {
            res.send({
                status : '0',
                message : err
            });
            return;

        } else {
            if (result.length == 0) {
                    res.send({
                    status : '0',
                    message : "no rules found"
                });
                    return;
            }

            var old_packagename = result[0].packagename;
            var old_ip = result[0].ip;
            var old_port = result[0].port;
            var old_protocol = result[0].protocol;
            var old_mask = result[0].mask;
            var old_ipversion = result[0].ipversion;

            // edit rule in db
            Common.db.AppRules.update({
                packagename : packageName,
                ip : ip,
                port : port,
                protocol : protocol,
                maindomain : domain,
                mask : mask,
                ipversion : ipVersion,
            }, {
                where : {
                    ruleid : ruleid,
                    maindomain : domain
                }
            }).then(function() {
                res.send({
                    status : '1',
                    message : "updated rule successfully"
                });

                firewall.updateOnlineUsersRule(packageName, ip, port, protocol, mask, domain, ipVersion, firewall.Firewall.add, function(err) {
                    if (err) {
                        logger.error(err);
                    } else {
                        firewall.updateOnlineUsersRule(old_packagename, old_ip, old_port, old_protocol, old_mask, domain, old_ipversion, firewall.Firewall.remove, function(err) {
                            if (err) {
                                logger.error(err);
                            }
                            return;
                        });
                    }
                });

            }).catch(function(err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            });

        }

    });

}

var EditAppRule = {
    get : editAppRule
};

module.exports = EditAppRule;
