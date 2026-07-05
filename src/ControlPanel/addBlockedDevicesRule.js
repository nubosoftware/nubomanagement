"use strict";

/*
 * @author Ori Sharon add blocked devices for organization
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var eventLog = require('../eventLog.js');
var EV_CONST = eventLog.EV_CONST;

// first call goes to here
function addBlockedDevicesRule(req, res, domain) {
    // http://login.nubosoftware.com/addBlockedDevicesRule?session=[]&ruleName=[]&deviceName=[]

    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var ruleName = req.params.ruleName;
    if (!ruleName || ruleName == "") {
        logger.info("addBlockedDevicesRule. Invalid ruleName");
        status = 0;
        msg = "Invalid parameters";
    }

    var filterName = req.params.filterName;
    if (!filterName || filterName == "") {
        logger.info("addBlockedDevicesRule. Invalid filterName");
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

    addBlockedDevicesRuleToDB(res, ruleName, filterName, domain, req.nubodata && req.nubodata.adminLogin);
}

function addBlockedDevicesRuleToDB(res, ruleName, filterName, domain, adminLogin) {

    Common.db.BlockedDevices.create({
        rulename : ruleName,
        filtername : filterName,
        maindomain : domain
    }).then(function(results) {
        require('./getBlockedDevices').clearDomainRuleCache(domain);
        eventLog.logAdminEvent(adminLogin, EV_CONST.EV_SECURITY_CONFIG_CHANGE, null, domain,
            `Security: added blocked-device rule '${ruleName}' (filter: ${filterName})`, EV_CONST.INFO);
        res.send({
            status : '1',
            message : "Inserted device rule Successfully"
        });

    }).catch(function(err) {
        res.send({
            status : '0',
            message : "error on insert users to db"
        });
    });

}

var AddBlockedDevicesRule = {
    get : addBlockedDevicesRule
};

module.exports = AddBlockedDevicesRule;
