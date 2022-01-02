"use strict";

/*
 * @author Ori Sharon update updateDeviceApproval for organization
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);

// first call goes to here
function getAdminDeviceApproval(req, res, domain) {
    // http://login.nubosoftware.com/updateDeviceApproval?session=[]&ruleid=[]&deviceName=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    if (status != 1) {
        res.send({
            status : status,
            message : msg
        });
        return;
    }

    getAdminDeviceApprovalFromDB(res, domain);
}

function getAdminDeviceApprovalFromDB(res, domain) {

    Common.db.Orgs.findAll({
        attributes : [ 'deviceapprovaltype', 'notifieradmin' ],
        where : {
            maindomain : domain
        },
    }).complete(function(err, results) {
        var blockedDevices = [];

        if (!!err) {
            console.log('err: ' + err);
            res.send({
                status : '0',
                message : "Internal error: " + err
            });
            return;

        } else if (!results || results == "") {
            console.log('Cannot find deviceApprovalType and notifierAdmin.');
            res.send({
                status : '0',
                message : "Cannot find deviceApprovalType and notifierAdmin"
            });
            return;

        } else {

            var row = results[0];

            // get all values of current row
            var deviceApprovalType = row.deviceapprovaltype != null ? row.deviceapprovaltype : '';
            var notifierAdmin = row.notifieradmin != null ? row.notifieradmin : '';

            res.send({
                status : '1',
                message : "get deviceApprovalType and notifierAdmin successfully",
                deviceApprovalType : deviceApprovalType,
                notifierAdmin : notifierAdmin
            });
            return;
        }
    });

}

var GetAdminDeviceApproval = {
    get : getAdminDeviceApproval
};

module.exports = GetAdminDeviceApproval;
