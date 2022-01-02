"use strict";

/**
 *  sendSmm.js
 *
 */
var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var SmsNotificationModule = require('../SmsNotification.js');

Common.loadCallback = function(err) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    var phone = "+972542008277";
    var message = "Nubo test message";
    if (process.argv.length>=3) {
        phone = process.argv[2];
    }
    if (process.argv.length>=4) {
        message = process.argv[2];
    }
    var req = {
        params: {
            toPhone: phone,
            body: message
        }
    };
    var res = {
        send: function() {console.log("No error.");Common.quit();}
    };
    SmsNotificationModule.sendSmsNotification(req,res);
};

