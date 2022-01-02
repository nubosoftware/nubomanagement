"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var ThreadedLogger = require('./ThreadedLogger.js');
var async = require('async');
const { Op } = require('sequelize');

function captureDeviceDetails(req, res, next) {
    // https://login.nubosoftware.com/captureDeviceDetails?activationKey
    var logger = new ThreadedLogger(Common.getLogger(__filename));

    res.contentType = 'json';
    var msg = 'OK';
    var status = 0;

    updateNetworkDeviceDetails(req, function(err) {
	if (err) {
	    msg = err;
	    status = 1;
	}
	res.send({
            status : status,
            message : msg
        });
    });
}

function updateNetworkDeviceDetails(req, callback) {
    // capture session and IP from request
    var session = req.params.sessionid;
    var ip = req.params.remoteAddress;

    // if parameter exist in common, we use static port both on device and both on server to send UDP notifications
    var sourcePort = Common.withServiceUDPStaticPort ? Common.withServiceUDPStaticPort : req.params.remotePort;

    if(session) {
        // update ip on DB if it has been changed
        updateIPandPort(session, ip, sourcePort, function(err) {
            if (err) {
                logger.error(err);
                msg = 'Internal error';
                callback(msg)
            } else {
	        callback(null);
            }
        });
    } else {
        logger.warn("updateNetworkDeviceDetails get empty session");
        callback('Internal error');
    }


}

function updateIPandPort(username, ip, sourcePort, callback) {
    // update existing entry
    Common.db.User.update({
        clientip: ip,
        clientport: sourcePort
    }, {
        where: {
                clientip: {[Op.ne]: ip},
        	username: username
        }
    }).then(function(results) {
console.log("updateIPandPort:", results);
        callback(null);
    }).catch(function(err) {
        callback("can't update ip and port for " + username + ", error is:" + err);
    });
}



captureDeviceDetails = {
    captureDeviceDetails : captureDeviceDetails,
    updateNetworkDeviceDetails : updateNetworkDeviceDetails
};

module.exports = captureDeviceDetails;
