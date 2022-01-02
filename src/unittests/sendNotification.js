"use strict";

/**
 *  sendNotification.js
 *
 */
var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var SmsNotificationModule = require('../Notifications.js');

Common.loadCallback = function(err) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    var user = "alexander@nubosoftware.com";
    var message = "Nubo test message";
    if (process.argv.length>=3) {
        user = process.argv[2];
    }
    if (process.argv.length>=4) {
        message = process.argv[3];
    }
    var req = {
        params: {
            email: user,
            titleText: message,
            notifyTime: "0",
            notifyLocation: "",
            appName: "-2",
        }
    };
    console.log("req: ", req);
    var res = {
        send: function(status, msg) {
            setTimeout(function() {
                console.log("status: " + status + "\nmsg: " + msg);
                Common.quit();
            }, 3000);
        }
    };
    SmsNotificationModule.pushNotification(req,res);
};

