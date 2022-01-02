"use strict";

const Common = require('../common.js');
const logger = Common.getLogger(__filename);
const async = require('async');
const fs = require('fs');


var argv = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0  [options]')
    .demandOption(['domain','clientauthtype', 'secondauthmethod'])
    .describe('domain', 'Main domain')
    .describe('clientauthtype', '0 - none, 1 - password, 2 - biometric/OTP, 3 - Both password and biometric/OTP, 4 - password or biometric/OTP')
    .describe('secondauthmethod', '1 - biometric, 2 - OTP, 3 - biometric or OTP') 
    .argv;

async function main() {
    let clientauthtype = argv.clientauthtype;
    if (clientauthtype !=Common.CLIENT_AUTH_TYPE_NONE && clientauthtype !=Common.CLIENT_AUTH_TYPE_PASSWORD && clientauthtype !=Common.CLIENT_AUTH_TYPE_BIOMETRIC_OTP &&
        clientauthtype !=Common.CLIENT_AUTH_TYPE_PASSWORD_AND_BIOMETRIC_OTP && clientauthtype !=Common.CLIENT_AUTH_TYPE_PASSWORD_OR_BIOMETRIC_OTP) {
            console.log("Invalid clientauthtype");
            return;
    }

    let secondauthmethod = argv.secondauthmethod;
    if (secondauthmethod != Common.SECOND_AUTH_METHOD_BIOMETRIC && secondauthmethod != Common.SECOND_AUTH_METHOD_OTP &&
        secondauthmethod != Common.SECOND_AUTH_METHOD_BIOMETRIC_OR_OTP) {
            console.log("Invalid secondauthmethod");
            return;
    }
    let results = await Common.db.Orgs.findAll({
        where: {
            maindomain: argv.domain
        },
    });

    if (!results || results.length != 1) {
        logger.error(`Domain ${argv.domain} not found!`);
        return;
    }

    let updateres = await Common.db.Orgs.update({
        clientauthtype: clientauthtype,
        secondauthmethod: secondauthmethod,
    }, {
        where: {
            maindomain: argv.domain
        }
    });
    if (updateres[0]) {
        logger.info(`Domain ${argv.domain} updated!`);
    }

}

if (!Common.loadCallback) {
    Common.loadCallback = function (err, firstTime) {
        if (err) {
            console.log("Error: " + err);
            Common.quit();
            return;
        }
        if (!firstTime) return;
        main().then((res) => {
            logger.info("Done.");
            Common.quit();
        }).catch(err => {
            logger.error(err);
        });
    };
}

