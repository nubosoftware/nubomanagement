"use strict";

const Common = require('../common.js');
const logger = Common.getLogger(__filename);
const async = require('async');
const fs = require('fs');
const path = require('path');


let argv = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0  [options]')
    .demandOption(['email','imei'])
    .describe('email', 'Email')
    .describe('imei', 'Device ID')
    .describe('cnt', 'Number of tests')
    .argv;


async function doTest() {
    try {
        logger.info(`Running tests for user: ${argv.email}, imei: ${argv.imei}`);
        let results = await Common.db.UserDevices.findAll({
                    attributes: ['email', 'imei', 'active', 'devicename', 'platform', 'gateway','assigned_phone_number','local_extension'],
                    where: {
                        email: argv.email,
                        imei: argv.imei
                    }
         });
         if (!results || results.length != 1) {
             logger.error(`Cannot find device`)
             return;
         }
         let device = results[0];
         let cnt = argv.cnt;
         if (cnt ==0 || !cnt) cnt = 1;
         for (let i=0; i<cnt; i++) {
            //logger.info(`[${i}] Before startSession...`)
            await startSession(argv.email,argv.imei,device);
            logger.info(`[${i}] After startSession. Sleep 60 seconds..\n\n`)
            await sleep(60000);
            //logger.info(`[${i}] Before endSession...`)
            await endSession(argv.email,argv.imei);
            logger.info(`[${i}] After endSession. Sleep 60 seconds..\n\n`)
            await sleep(60000);
         }
    } catch (err) {
        logger.error(`Error: ${err}`);
        console.error(err);
    } finally {
        Common.quit();
    }

}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function startSession(email,imei,device) {
    return new Promise((resolve,reject) => {
        require('../StartSession.js').startSessionByDevice(email,imei,device,(err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function endSession(email,imei) {
    return new Promise((resolve,reject) => {
        require('../ControlPanel/killDeviceSession.js').killDeviceSessionImp(email,imei,null,function(sendObj){
            logger.info(`endSession: ${JSON.stringify(sendObj)}`);
            if (sendObj.status == 1) {
                resolve();
            } else {
                reject(sendObj.message);
            }
        });
    });
}



if (!Common.loadCallback) {
    Common.loadCallback = function(err, firstTime) {
        if (err) {
            console.log("Error: "+err);
            Common.quit();
            return;
        }
        if(!firstTime) return;
        doTest();
    };
}