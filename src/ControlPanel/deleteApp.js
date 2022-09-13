"use strict";

/*
 * @author Ori Sharon In this class we delete the required profiles
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var async = require('async');


// first call goes to here
function deleteApp(req, res, domain) {
    // http://login.nubosoftware.com/deleteApk?session=[]&packagename=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var packageName = req.params.packageName;
    if (!packageName || packageName == "") {
        logger.info("deleteApk. Invalid packageName");
        status = 0;
        msg = "Invalid parameters";
    }

    if (status != 1) {
        res.send({
            status : status,
            message : msg
        });
        return;
    }

        deleteAppDetailsFromDB(res, packageName, domain);
}


function deleteAppFromDB(packagename, domain,cb) {
    var status;
    var msg;

    // this call (async) is to perform this in a synchronic way
    async.series([
    // get user apps details
    function(callback) {

        Common.db.UserApps.findAll({
            attributes : [ 'packagename' ],
            where : {
                packagename : packagename,
                maindomain : domain
            },
        }).complete(function(err, results) {

            if (!!err) {
                status = 0;
                console.log("err:: " + err);
                msg = 'Error on get user apps details: ' + err;
                callback(msg);
                return;

                // goes here if we don't find user app in the database
            } else if (!results || results == "") {
                status = 1;
                callback(null);
                return;

            } else {
                logger.info(`deleteAppFromDB. Found ${results.length} records in UserApps`);
                status = 2;
                callback(null);
                return;
            }
        });
    },

    function(callback) {

        if (status != 1) {
            callback(msg);
            return;
        }

        Common.db.GroupApps.findAll({
            attributes : [ 'packagename' ],
            where : {
                packagename : packagename,
                maindomain : domain
            },
        }).complete(function(err, results) {

            if (!!err) {
                status = 0;
                console.log("err:: " + err);
                msg = 'Error on get group apps details: ' + err;
                callback(msg);
                return;

                // goes here if we don't find this profile in the database
            } else if (!results || results == "") {
                status = 1;
                callback(null);
                return;

            } else {
                logger.info(`deleteAppFromDB. Found ${results.length} records in GroupApps`);
                status = 2;
                callback(null);
                return;
            }
        });

    }, function(callback) {

        if (status != 1) {
            callback(msg);
            return;
        }

        Common.db.Apps.findAll({
            attributes : [ 'packagename' ],
            where : {
                packagename : packagename,
                maindomain : domain
            },
        }).complete(function(err, results) {

            if (!!err) {
                status = 0;
                console.log("err:: " + err);
                msg = 'Error on get app details: ' + err;
                callback(msg);
                return;

                // goes here if we don't find this app in the database
            } else if (!results || results == "") {
                logger.info(`deleteAPKFromDB. App ${packagename} not found in the database`);
                status = 2;
                callback(null);
                return;

            } else {
                Common.db.Apps.destroy({
                    where : {
                        packagename : packagename,
                        maindomain : domain
                    }
                }).then(function() {
                    status = 1;
                    callback(null);
                    return;

                }).catch(function(err) {
                    status = 0;
                    logger.info("deleteApk, can't delete an app:: " + err);
                    callback(err);
                    return;
                });
            }
        });
    }, function(callback) {
        // delete the app from image.
        // avialble only in mobile and docker
        if (Common.isMobile()) {
            Common.getMobile().appMgmt.deleteAppFromDomain(domain,packagename).then(() => {
                callback(null);
            }).catch(err => {
                logger.error(`deleteAppFromDomain error`,err);
                callback(err);
            });
        } else {
            callback(null);
        }

    } ], function(err, results) {
        cb(err,status);
    });
}

function deleteAppDetailsFromDB(res, packagename, domain) {

    var status;
    var msg;

    deleteAppFromDB(packagename, domain,(err,status) => {
        if (err) {
            res.send({
                status : '0',
                message : err
            });
            return;
        }

        if (status == 1) {
            res.send({
                status : '1',
                message : 'app deleted successfully'
            });
            return;
        } else {
            res.send({
                status : '2',
                message : 'app is assigned to user/groups or app is not exists'
            });
            return;
        }
    });
}

var DeleteApk = {
    get : deleteApp,
    deleteAppFromDB: deleteAppFromDB
};

module.exports = DeleteApk;
