"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);

var argv = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0  [options]')
    .demandOption(['email','deviceid','country'])
    .describe('email', 'User email')
    .describe('deviceid', 'User device id')
    .describe('country', 'Origin country')
    .describe('phone', 'User phone number')    
    .argv;

Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;
    if (Common.isMobile()) {
        Common.getMobile().twilioAPI.getAvailableNumbersImp(argv.country,argv.phone,(err,availablePhoneNumbers) => {
            if (err) {
                logger.error(err);
            } else  {
                logger.info(JSON.stringify(availablePhoneNumbers,null,2));
            }
            Common.quit();
        });
    } else {
        Common.quit();
    }
};