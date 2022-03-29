"use strict";

/*
 * @author Ori Sharon update blocked devices for organization
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);

// first call goes to here
function updateBlockedDevicesRule(req, res, domain) {
    // http://login.nubosoftware.com/updateBlockedDevicesRule?session=[]&ruleid=[]&deviceName=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var ruleId = req.params.ruleid;
    if (!ruleId || ruleId == "") {
        logger.info("updateBlockedDevicesRule. ruleId");
        status = 0;
        msg = "Invalid parameters";
    }

    var filterName = req.params.filterName;
    if (!filterName || filterName == "") {
        logger.info("updateBlockedDevicesRule. filterName");
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

    updateBlockedDevicesRuleToDB(res, ruleId, filterName, domain);
}

function updateBlockedDevicesRuleToDB(res, ruleId, filterName, domain) {

    Common.db.BlockedDevices.update({
        filtername : filterName
    }, {
        where : {
            ruleid : ruleId,
            maindomain : domain
        }
    }).then(function() {
        require('./getBlockedDevices').clearDomainRuleCache(domain);
        res.send({
            status : 1,
            message : "update blocked devices rule to db successfully"
        });

    }).catch(function(err) {
        var errormsg = 'Error on updating devices rule to db: ' + err;
        res.send({
            status : 0,
            message : err
        });
        return;
    });

}

var UpdateBlockedDevicesRule = {
    get : updateBlockedDevicesRule
};

module.exports = UpdateBlockedDevicesRule;
