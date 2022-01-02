"use strict";

var Common = require('./common.js');
var async = require('async');
var logger = Common.getLogger(__filename);


// i.e., nubocronAPI.addJobToDB('nubosoftware.com','console',false,'* * * * *','Asia/Jerusalem',"console.log('Hanan Baranes...')", true, function(err) {});
function addJobToDB(mainDomain,jobName,startImmediately,intervalStr,timeZone,commandToRun,isActive, DCName, callback) {

    if (mainDomain == null || mainDomain.length <= 0) {
        callback('Main Domain is missing');
        return;
    }
    if (jobName == null || jobName.length <= 0) {
        callback('Job Name is missing');
        return;
    }
    if (intervalStr == null || intervalStr.length <= 0) {
        callback('Interval Str is missing');
        return;
    }
    if (timeZone == null || timeZone.length <= 0) {
        timeZone = 'GMT';
        logger.info('Time Zone is missing using default value GMT');
    }
    if (commandToRun == null || commandToRun.length <= 0) {
        callback('Command To Run is missing');
        return;
    }

    var useDCName = DCName ? DCName : Common.dcName;

    // First, find out if we already have job like that in tha database
    Common.db.Jobs.findAll({
        attributes : ['maindomain','jobname','dcname'],
    	where : {
    	    maindomain : mainDomain,
 	    	jobname : jobName
      },
    }).complete(function(err, results) {
        if (!!err) {
            var msg = "Error while getting specific Job from database " + mainDomain + "_" +jobName + ": " +  err;
            logger.info(msg);
            callback(msg);
            return;
        } else if (!results || results == "") {
            // No entry exist for this job and domain, create new entry in database
            Common.db.Jobs.create({
                maindomain : mainDomain,
                jobname : jobName,
                startimmediately : startImmediately ? 1 : 0,
                intervalstr :intervalStr,
                timezone : timeZone,
                isactive : isActive,
                commandtorun : commandToRun,
                dcname : useDCName // indicate in which data center this job needs to run
            }).then(function(results) {
                callback(null);
            }).catch(function(err) {
                callback("Problem creating/updating job " + jobName + " to " + mainDomain + " on data center " + Common.dcName);
            });
        } else {
            // update is allowed (at the moment) only from the same data center it was created on
            var dcNamefromDB = results[0].dcname != null ? results[0].dcname : 'Not Available';
            if ((dcNamefromDB != useDCName) && (dcNamefromDB != "ALL")) {
                logger.info("Can not update cron job from different data center it was created. It was created on - " + dcNamefromDB);
                callback("Can not update cron job from different data center it was created. It was created on - " + dcNamefromDB);
            } else {

                // we have a job with the same name and domain, update details and enable the job
                Common.db.Jobs.update({
                    startimmediately : startImmediately ? 1 : 0,
                    intervalstr :intervalStr,
                    timezone : timeZone,
                    isactive : (isActive ? 1 : 0),
                    commandtorun : commandToRun,
                    dcname : useDCName,
                    isupdate : 1,
                }, {
                    where : {
                        maindomain : mainDomain,
                        jobname : jobName
                    }
                }).then(function() {
                    callback(null);
                }).catch(function(err) {
                    logger.info(err);
                    callback("Internal error while creating/updating job " + jobName + " for domain " + mainDomain + ": "+ err);
                });
            }
        }
    });
}

//i.e., nubocronAPI.removeJobFromDB('nubosoftware','console',function(err) {});
function removeJobFromDB(mainDomain,jobName,callback) {
    // update details and cancel the job, if we have no records menas nothing to update
    Common.db.Jobs.update({
        isactive : 0
    }, {
        where : {
            maindomain : mainDomain,
            jobname : jobName
        }
    }).then(function() {
        callback(null);
    }).catch(function(err) {
        logger.info(err);
        callback("Internal error while canceling job " + jobName + " for domain " + mainDomain + ": "+ err);
    });
}

var nubocronAPI = {
        addJobToDB : addJobToDB,
        removeJobFromDB : removeJobFromDB
};
module.exports = nubocronAPI;
