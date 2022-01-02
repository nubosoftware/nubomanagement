"use strict";

/**
 *  sendEmail.js
 *
 */
var Common = require('../common.js');
var logger = Common.getLogger(__filename);

Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;

    var mailOptions = {
        from: Common.mailOptions.from || Common.emailSender.senderEmail, // sender address
        fromname: Common.emailSender.senderName,
        to: "alexander@nubosoftware.com", // list of receivers
        subject: "Unit test", // Subject line
        text: "Nubo test message"
    };

    if (process.argv.length>=3) {
        mailOptions.to = process.argv[2];
    }

    if (process.argv.length>=4) {
        mailOptions.subject = process.argv[3];
    }

    if (process.argv.length>=5) {
        mailOptions.text = process.argv[4];
    }

    console.log("Mail object: ", mailOptions);
    mailOptions.html = mailOptions.text.replace(/\n/g, "<br />");
    setTimeout(function() {
        Common.mailer.send(mailOptions, function(success, message) {
            setTimeout(function() {
                console.log("status: " + success + "\nmsg: " + message);
                Common.quit();
            }, 3000);
        }); //Common.mailer.send
  }, 3000);
};

