"use strict";

var Common = require('./common.js');
var argv = require('yargs/yargs')(process.argv.slice(2)).argv;
var async = require('async');
var UserUtils = require('./userUtils.js');
var AddAdmins = require('./ControlPanel/addAdmins.js');
var AddProfile = require('./ControlPanel/addProfile.js');
const { logger } = require('./common.js');

var email = null;
var orgdomain = null;

var time = new Date().getTime();
var hrTime = process.hrtime()[1];
Common.loadCallback = function(err) {
    if (err) {
        logger.error("Error: " + err,err);
        Common.quit();
        return;
    }    
    if (!(argv.e)) {
        console.log(`please insert admin email
        Usage:
        node createAdmin.js -e [admin email] 
        -d [admin domain]
        -p [admin password]
        -s (Site admin flag)
        -a (Allow auto activation for first user)
        `);
        Common.quit();
        return;
    } else {
        email = argv.e;
    }

    setTimeout(function() {
        let updateSettings = {};
        async.series([

        function(callback) {
            //add user to db
            UserUtils.createOrReturnUserAndDomain(email, Common.logger, function(err, obj) {
                if (err) {
                    callback("Failed to add profile");
                } else {
                    orgdomain = obj.domain;
                    callback(null);
                }
            },argv.d);
        },

        // update password if needed
        function (callback) {
            if (argv.p) {
                require('./setPasscode').updateUserPasswordImp(email,argv.p).then(() => {
                    callback();
                }).catch(err => {
                    callback(err);
                })
            } else {
                callback();
            }
        },

        function(callback) {
            //set admin in db
            let perms;
            if (argv.s) {
                if (orgdomain != Common.siteAdminDomain) {                                        
                    updateSettings.siteAdminDomain = orgdomain;
                    
                }
                perms = '{"@/":"rw"}';  
            } else {
                perms = '{"/":"rw"}';
            }
            AddAdmins.setAdminInDB(email, orgdomain, perms,function(err, status) {
                if (err || status == '0') {
                    callback("Failed to add admin");
                } else {
                    callback(null);
                }
            });

        },
        function(callback) {
            if (argv.a) {
                updateSettings.autoActivationOnce = true;
            }
            let updateLen = Object.keys(updateSettings).length;
            if (updateLen > 0) {
                logger.info(`Update Settings.json with the following params: ${JSON.stringify(updateSettings,null,2)}`);
                Common.updateSettingsJSON(updateSettings,(err) => {
                    callback(err);
                });
            } else {
                callback(null);
            }
        }
        ], function(err) {
            if (err) {
                logger.error("Error - - - - " + err,err);
            } else {
                logger.info("Done...");
            }
            Common.quit();
        });

    }, 1000);
};
