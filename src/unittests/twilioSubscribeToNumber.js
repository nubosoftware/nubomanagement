"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);

var argv = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0  [options]')
    .demandOption(['email','deviceid','phone'])
    .describe('email', 'User email')
    .describe('deviceid', 'User device id')
    .describe('phone', 'Phone number to subscribe')    
    .argv;

Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;
    if (Common.isMobile()) {
        Common.getMobile().twilioAPI.subscribeToNumberImp(argv.phone,(err) => {
            if (err) {
                logger.error(err);
            } else  {
                logger.info("Success!");
            }
            Common.quit();
        });
    } else {
        Common.quit();
    }
};