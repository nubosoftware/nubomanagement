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
 */
function setNetwotkAccessStatus(req, res, next) {

    // https://login.nubosoftware.com/setNetwotkAccessStatus?session=[]&accessStatus=[]
    res.contentType = 'json';

    var accessStatus = req.params.accessStatus;
    if (!(accessStatus == 'open' || accessStatus == 'close')) {
        res.send({
            status : '0',
            message : 'Invalid accessStatus'
        });
        return;
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

        setNetwotkAccessStatusFromDB(res, domain, accessStatus,firewall);

    });

}

/*
 Common.db.User.update({
 loginattempts : (loginattempts + 1)
 }, {
 where : {
 email : login.getUserName()
 }
 }).then(function() {
 */
function setNetwotkAccessStatusFromDB(res, domain, accessStatus,firewall) {

    Common.db.Orgs.update({
        accessstatus : accessStatus
    }, {
        where : {
            maindomain : domain
        },
    }).complete(function(err, results) {

        if (!!err) {
            res.send({
                status : '0',
                message : "Error while updating accessstatus"
            });
        } else {
            res.send({
                status : '1',
                message : "updated accessstatus successfully"
            });
            //TODO call and update all users
            if (!Common.platformSettings || Common.platformSettings["enable_firewall"] !== true ) {
                // skip firewall configuration
                return;
            }
            firewall.updateOnlineUsersOpenCloseAccess(domain, function(err) {
                if (err) {
                    logger.error(err);
                }

            });
        }

    });
}

var SetNetwotkAccessStatus = {
    get : setNetwotkAccessStatus
};

module.exports = SetNetwotkAccessStatus;
