"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var userUtils = require('../userUtils.js');

var argv = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0  [options]')
    .demandOption(['email','deviceid'])
    .describe('email', 'User email')
    .describe('deviceid', 'User device id')
    .describe('assigned_phone_number', 'Assigned phone number')
    .describe('sip_username', 'SIP user name')
    .describe('sip_domain', 'SIP domain')
    .describe('sip_password', 'SIP user password')
    .describe('sip_port', 'SIP port number')
    .describe('sip_protocol', 'SIP protocol')
    .describe('sip_proxy', 'SIP proxy address')
    .describe('region_code', 'Country ISO Code')
    .string('deviceid')
    .string('assigned_phone_number')
    .string('sip_username')
    .argv;

Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;
    userUtils.updateDeviceTelephonySettings(argv.email,argv.deviceid,argv.assigned_phone_number,
      argv.sip_username, argv.sip_domain, argv.sip_password, argv.sip_port, argv.sip_protocol, argv.sip_proxy,argv.region_code,
      Common.telephonyParams.messaging_server, Common.telephonyParams.messaging_token_type,
      function(err) {
        if (err) {
            logger.error("Error: "+err);
            //console.error(err);
        }
        else {
            logger.info("Updated!");
        }
        Common.quit();
    });

};