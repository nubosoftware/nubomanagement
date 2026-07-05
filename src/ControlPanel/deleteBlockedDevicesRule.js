"use strict";

/*
 * @author Ori Sharon delete blocked devices for organization
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var eventLog = require('../eventLog.js');
var EV_CONST = eventLog.EV_CONST;

// first call goes to here
function deleteBlockedDevicesRule(req, res, domain) {
    // http://login.nubosoftware.com/deleteBlockedDevicesRule?session=[]&ruleid=[]&ruleName=[]&deviceName=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var ruleId = req.params.ruleid;
    if (!ruleId || ruleId == "") {
        logger.info("deleteBlockedDevicesRule. Invalid ruleId");
        status = 0;
        msg = "Invalid parameters";
    }

    var ruleName = req.params.ruleName;
    if (!ruleName || ruleName == "") {
        logger.info("deleteBlockedDevicesRule. Invalid ruleName");
        status = 0;
        msg = "Invalid parameters";
    }

    var filterName = req.params.filterName;
    if (!filterName || filterName == "") {
        logger.info("deleteBlockedDevicesRule. Invalid filterName");
        status = 0;
        msg = "Invalid parameters";
    }

    if (status != 1) {
        res.send({
            status : status,
            message : msg
        });
        return;
    }

    deleteBlockedDevicesRuleFromDB(res, ruleId, ruleName, filterName, domain, req.nubodata && req.nubodata.adminLogin);
}

function deleteBlockedDevicesRuleFromDB(res, ruleId, ruleName, filterName, domain, adminLogin) {

    // delete the device rule from db
    Common.db.BlockedDevices.destroy({
        where : {
            ruleid : ruleId,
            rulename : ruleName,
            filtername : filterName,
            maindomain : domain
        }
    }).then(function() {
        require('./getBlockedDevices').clearDomainRuleCache(domain);
        eventLog.logAdminEvent(adminLogin, EV_CONST.EV_SECURITY_CONFIG_CHANGE, null, domain,
            `Security: deleted blocked-device rule '${ruleName}' (ruleId: ${ruleId}, filter: ${filterName})`, EV_CONST.WARN);
        res.send({
            status : '1',
            message : "deleted blocked devices rule from db successfully"
        });
        return;
    }).catch(function(err) {
        res.send({
            status : '0',
            message : err
        });
        return;
    });

}

var DeleteBlockedDevicesRule = {
    get : deleteBlockedDevicesRule
};

module.exports = DeleteBlockedDevicesRule;
