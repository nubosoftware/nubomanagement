"use strict";

var async = require("async");
var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var CopyAppUsageLogs = require('./copyAppUsageLogs.js');

Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;
    CopyAppUsageLogs.copyLogsFromNuboLogsInternal(5,function(err){
        logger.info("Done.");
        Common.quit();
    });
};



