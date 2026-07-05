"use strict";

/*
 * @author Ori Sharon update updateDeviceApproval for organization
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var eventLog = require('../eventLog.js');
var EV_CONST = eventLog.EV_CONST;

// first call goes to here
function updateDeviceApproval(req, res, domain) {
    // http://login.nubosoftware.com/updateDeviceApproval?session=[]&ruleid=[]&deviceName=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    //logger.info(`updateDeviceApproval: ${JSON.stringify(req.params,null,2)}`);
    var deviceApprovalType = req.params.deviceApprovalType;
    if (!deviceApprovalType) {
        deviceApprovalType = "0"
    };

    if (deviceApprovalType != "1" && deviceApprovalType != "2" && deviceApprovalType != "0" && deviceApprovalType != "3") {
        logger.info("updateDeviceApproval. Invalid deviceApprovalType");
        status = 0;
        msg = "Invalid parameters";
    }

    var notifierAdmin = "";

    if (deviceApprovalType != "0" && deviceApprovalType != "3") {

        notifierAdmin = req.params.notifierAdmin;
        if (!notifierAdmin || notifierAdmin == "") {
            logger.info("updateDeviceApproval. Invalid notifierAdmin");
            status = 0;
            msg = "Invalid parameters";
        }
    }

    let allowdevicereg = req.params.allowdevicereg;
    if (allowdevicereg == undefined) {
        allowdevicereg = 1;
    }
    if (allowdevicereg != 1 && allowdevicereg != 0) {
        logger.info("updateDeviceApproval. Invalid allowdevicereg: "+allowdevicereg);
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
    updateDeviceApprovalToDB(res, deviceApprovalType, notifierAdmin, allowdevicereg, domain, req.nubodata && req.nubodata.adminLogin);
}

function updateDeviceApprovalToDB(res, deviceApprovalType, notifierAdmin, allowdevicereg, domain, adminLogin) {

    Common.db.Orgs.update({
        deviceapprovaltype : deviceApprovalType,
        notifieradmin : notifierAdmin,
        allowdevicereg
    }, {
        where : {
            maindomain : domain
        }
    }).then(function() {
        eventLog.logAdminEvent(adminLogin, EV_CONST.EV_SECURITY_CONFIG_CHANGE, null, domain,
            `Security: device approval settings changed (type=${deviceApprovalType}, notifierAdmin=${notifierAdmin}, allowDeviceReg=${allowdevicereg})`,
            EV_CONST.INFO);
        res.send({
            status : 1,
            message : "updated deviceApprovalType and notifierAdmin successfully"
        });

    }).catch(function(err) {
        var errormsg = 'Error on updating deviceApprovalType and notifierAdmin: ' + err;
        res.send({
            status : 0,
            message : err
        });
        return;
    });

}

var UpdateDeviceApproval = {
    get : updateDeviceApproval
};

module.exports = UpdateDeviceApproval;
