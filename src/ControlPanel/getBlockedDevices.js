"use strict";

/*
 * @author Ori Sharon get blocked devices for organization
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);

let blockDevicesByDomain = {};


function clearDomainRuleCache(domain) {
    delete blockDevicesByDomain[domain];
}

async function checkBlockDevice(domain,deviceid,devicename) {
    let isDeviceBlocked = false;
    let blockDevices = blockDevicesByDomain[domain];
    if (!blockDevices) {
        blockDevices = await Common.db.BlockedDevices.findAll({
            attributes : [ 'ruleid', 'rulename', 'filtername'],
            where: {
                maindomain: domain,
            },
        });
        if (!blockDevices) {
            blockDevices = [];
        }
        blockDevicesByDomain[domain] = blockDevices;
    }
    for (const rule of blockDevices) {
        if (devicename && rule.filtername) {
            if (devicename.toLowerCase().indexOf(rule.filtername.toLowerCase()) > -1) {
                logger.info(`Found blocked device. devicename: ${devicename}, rule: ${rule.rulename}, filter: ${rule.filtername}`);
                isDeviceBlocked = true;
                break;
            }
        }

        // check if imei is in our blockedDevices table
        if (deviceid && rule.filtername) {
            if (deviceid.toLowerCase().indexOf(rule.filtername.toLowerCase()) > -1) {
                logger.info(`Found blocked device. deviceid: ${deviceid}, rule: ${rule.rulename}, filter: ${rule.filtername}`);
                isDeviceBlocked = true;
                break;
            }
        }
    }
    return isDeviceBlocked;
}
// first call goes to here
function getBlockedDevices(req, res, domain) {
    // http://login.nubosoftware.com/getBlockedDevices?session=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    getBlockedDevicesFromDB(res, domain);
}

function getBlockedDevicesFromDB(res, domain) {

    Common.db.BlockedDevices.findAll({
        attributes : [ 'ruleid', 'rulename', 'filtername'],
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
            console.log('Cannot find blocked devices.');
            res.send({
                status : '1',
                message : "Cannot find blocked devices",
                blockedDevices : blockedDevices
            });
            return;

        } else {

            results.forEach(function(row) {

                // get all values of current row
                var ruleId = row.ruleid != null ? row.ruleid : '';
                var ruleName = row.rulename != null ? row.rulename : '';
                var filterName = row.filtername != null ? row.filtername : '';

                var jsonBlockedDevice = {
                    ruleId : ruleId,
                    ruleName : ruleName,
                    filterName : filterName
                };

                blockedDevices.push(jsonBlockedDevice);

            });

            var json = JSON.stringify({
                status : "1",
                message : "import blocked devices succedded",
                blockedDevices : blockedDevices
            });
            res.end(json);
            return;
        }
    });

}

var GetBlockedDevices = {
    get : getBlockedDevices,
    clearDomainRuleCache,
    checkBlockDevice
};

module.exports = GetBlockedDevices;
