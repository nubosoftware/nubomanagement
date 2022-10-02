"use strict";

/*
 * @author Ori Sharon update updateDeviceApproval for organization
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);

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

    if (deviceApprovalType != "1" && deviceApprovalType != "2" && deviceApprovalType != "0") {
        logger.info("updateDeviceApproval. Invalid deviceApprovalType");
        status = 0;
        msg = "Invalid parameters";
    }

    var notifierAdmin = "";

    if (deviceApprovalType != "0") {

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
    updateDeviceApprovalToDB(res, deviceApprovalType, notifierAdmin, allowdevicereg, domain);
}

function updateDeviceApprovalToDB(res, deviceApprovalType, notifierAdmin, allowdevicereg, domain) {

    Common.db.Orgs.update({
        deviceapprovaltype : deviceApprovalType,
        notifieradmin : notifierAdmin,
        allowdevicereg
    }, {
        where : {
            maindomain : domain
        }
    }).then(function() {
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
