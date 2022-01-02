"use strict";

const Common = require('../common.js');
const logger = Common.getLogger(__filename);


let argv = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0  [options]')
    .describe('dir', 'Nubo Apps Folder')
    .argv;



function installNuboApps(nuboAppsFolder,cb) {
    if (Common.isMobile()) {
        Common.getMobile().installNuboApps(nuboAppsFolder,cb);
    } else {
        logger.info("installNuboApps. Mobile module not found.");
        cb();
    }
}

module.exports = {
    installNuboApps
};


if (!Common.loadCallback) {
    Common.loadCallback = function(err, firstTime) {
        if (err) {
            console.log("Error: "+err);
            Common.quit();
            return;
        }
        if(!firstTime) return;
        let dir;
        if (argv.dir) {
            dir = argv.dir;
        } else {
            dir = "/opt/nubo-appstore/nuboApps"
        }
        logger.info("Loading apks from folder: "+dir);
        installNuboApps(dir,(err) => {
            Common.quit();
        });
    };
}