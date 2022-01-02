"use strict";

var async = require('async');
var _ = require('underscore');
var Common = require('../common.js');
var nfsModule = require('../nfs.js');
var logger = Common.getLogger(__filename);

console.log("Set common");

Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;

    var paths = ["nubosoftware.com/alexander@nubosoftware.com"];
    var nfs;
    if (process.argv.length>=3) {
        paths = process.argv.slice(2);
    }

    console.log("Start test");
    console.log("paths: ", paths);
    async.series([
            function(callback) {
                nfsModule(
                    {
                        nfs_idx: Common.nfsId
                    },
                    function(err, nfsobj) {
                        if (err) {
                            logger.error("Cannot create nfs obect err: " + err);
                            callback(err);
                        } else {
                            nfs = nfsobj;
                            callback(null);
                        }
                    }
                );
            },
            function(callback) {
                async.eachSeries(
                    paths,
                    function(path, callback) {
                        logger.info("Sync directory: " + path);
                        nfs.syncFolder({root: path, folder: "./"}, function(err) {
                            callback(err);
                        });
                    },
                    function(err) {
                        callback(err);
                    }
                );
            }
        ], function(err) {
            console.log("status: " + (err ? " error: " + err : "Done"));
            Common.quit();
        }
    );
}

