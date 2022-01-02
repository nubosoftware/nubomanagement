"use strict";

var Common = require('./common.js');
var async = require('async');
var logger = Common.getLogger(__filename);
var CronJob = require('cron').CronJob;

var CopyAppUsageLogs = require('./copyAppUsageLogs.js');
var AddLastSessions = require('./addLastSessions.js');
var execFile = require('child_process').execFile;
var nuboCronJob = require('./nuboCronJobs.js');
var Service = require("./service.js");
var _ = require("underscore");
// array holds all running services
var runningJobs = {};
var cronSchedulerStoped = false;
var SCHEDULER_REFRESH_INTERVAL = 30;

logger.info("Starting Nubo cron scheduler");
// setTimeout(runScheduledJobs, SCHEDULER_REFRESH_INTERVAL);

function runScheduledJobs(callback) {
    Common.redisClient.publish("nubocronScheduler", "runScheduledJobs started");

    if(cronSchedulerStoped){
        callback(null);
        return;
    }

    async.series([
    function(callback) {
        // Select all scheduled jobs from DB
        Common.db.Jobs.findAll({
            attributes : ['maindomain', 'jobname', 'startimmediately', 'intervalstr', 'timezone', 'isactive', 'commandtorun', 'dcname', 'isupdate']
        }).complete(function(err, results) {
            if (!!err) {
                var msg = "Error while getting Jobs from database: " + err;
                logger.info(msg);
                callback(msg);
                return;
            }
            // run on all services and run them
            results.forEach(function(row) {
                // validation was done while adding to DB
                var maindomain = row.maindomain;
                var jobname = row.jobname;
                var startimmediately = (row.startimmediately == 1) ? true : false;
                var intervalstr = row.intervalstr;
                var timezone = row.timezone;
                var isactive = row.isactive;
                var commandtorun = row.commandtorun;
                var dcname = row.dcname;
                var isupdate = (row.isupdate == 1) ? true : false;
                // if valid job name
                if (maindomain.length > 0 && jobname.length > 0 && intervalstr.length > 0 && commandtorun.length > 0 && dcname.length > 0) {
                    // if job is defined as active and should run in this data center
                    if (isactive == 1 && ((dcname == Common.dcName) || (dcname == "ALL"))) {
                        // create the job and add it to running domain array
                        addJobToRunningJobs(maindomain, jobname, startimmediately, intervalstr, timezone, commandtorun, isupdate, function(err) {
                            if (err) {
                                logger.error("Falied adding job to -" + maindomain + ", job name - " + jobname);
                            }
                        });
                    } else {
                        // stop it and remove from array (if exist)
                        removeJobFromRunningJobs(maindomain, jobname);
                    }
                }
            });
            callback(null);
        });
    }], function(err) {
        if (err) {
            logger.error("runScheduledJobs: " + err);
        }

        callback(null);
    });
}

//add job to running jobs array
function addJobToRunningJobs(mainDomain, jobName, startImmediately, intervalStr, timeZone, commandToRun, isUpdate, callback) {

    if(cronSchedulerStoped){
        callback(null);
        return;
    }

    if ((runningJobs[mainDomain + '_' + jobName] != undefined) && !isUpdate) {
        callback(null);
        return;
    }


    async.series([
        function(callback) {
            if (!isUpdate) {
                callback(null);
                return;
            }

            // remove it from running job
            removeJobFromRunningJobs(mainDomain, jobName);

            if (isJobRuning(mainDomain, jobName)) {
                logger.info("addJobToRunningJobs: job " + jobName + ' for domain ' + mainDomain + " runing, will update later");
                callback('exit');
                return;
            }

            //logger.info('addJobToRunningJobs: Updating job ' + jobName + ' for domain ' + mainDomain);

            // update database that this job was updated
            Common.db.Jobs.update({
                isupdate: 0
            }, {
                where: {
                    maindomain: mainDomain,
                    jobname: jobName
                }
            }).then(function() {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        },
        function(callback) {
            if (!startImmediately) {
                callback(null);
                return;
            }

            Common.db.Jobs.update({
                startimmediately: 0
            }, {
                where: {
                    maindomain: mainDomain,
                    jobname: jobName
                }
            }).then(function() {
                callback(null)
            }).catch(function(err) {
                callback(err);
            });
        },
        function(callback) {
            // create the new scheduled job
            function jobWork() {
                // if job is runing we dont want to start it again
                if (isJobRuning(mainDomain, jobName)) {
                    logger.info("cron job: job " + jobName + ' for domain ' + mainDomain + " runing, not scheduling the job to run now");
                    return;
                }

                setJobRunning(mainDomain, jobName);
                //console.log(`start: ${mainDomain} ${jobName}, cmd: ${commandToRun}`);
                var cmd = [].concat(commandToRun.split(','));
                nuboCronJob.runCronJob(cmd, logger, function(err) {
                    if (err) {
                        logger.error("cron job: " + err);
                    }

                    setJobNotRunning(mainDomain, jobName);
                    //logger.debug("cron job: finished " + jobName);
                });
            }

            var job = new CronJob({
                cronTime: intervalStr, // See - http://www.adminschoice.com/crontab-quick-reference
                onTick: function() {
                    jobWork();
                },
                timeZone: timeZone // See - http://en.wikipedia.org/wiki/List_of_tz_database_time_zones
            });

            addJobToRunningJobsInternal(mainDomain, jobName, job);
            if (startImmediately) {
                jobWork();
            }
            job.start();
            callback(null);
        }
    ], function(err) {
        if (err) {
            if(err === 'exit'){
                callback(null);
            }
            else {
                logger.error("addJobToRunningJobs: " + err);
                callback(err);
            }
            return;
        } else {
            callback(null);
        }
    });
}

function removeJobFromRunningJobs(mainDomain, jobName) {
    // console.log('Removing job ' + jobName + ' for domain ' + mainDomain);
    var job = runningJobs[mainDomain + '_' + jobName];

    if (job) {
        job.cronJob.stop();
        job.jobStoped = true;
    }
}

function addJobToRunningJobsInternal(mainDomain, jobName, job) {
    // console.log('Adding job ' + jobName + ' for domain ' + mainDomain);
    var newJob = {
        cronJob: job,
        isRunning: false,
        jobStoped: false
    }

    runningJobs[mainDomain + '_' + jobName] = newJob;
}

function isJobRuning(mainDomain, jobName) {
    // console.log('is job running ' + jobName + ' for domain ' + mainDomain);
    var job = runningJobs[mainDomain + '_' + jobName];

    if (job === undefined) {
        return false;
    }

    return job.isRunning;
}

function setJobRunning(mainDomain, jobName) {
    // console.log('set job running ' + jobName + ' for domain ' + mainDomain);

    var job = runningJobs[mainDomain + '_' + jobName];

    job.isRunning = true;
}

function setJobNotRunning(mainDomain, jobName) {
    // console.log('set job not running ' + jobName + ' for domain ' + mainDomain);

    var job = runningJobs[mainDomain + '_' + jobName];

    if(job){
        if(job.jobStoped){
            delete runningJobs[mainDomain + '_' + jobName];
        }
        else {
            job.isRunning = false;
        }

    }
}

function stopScheduler(callback) {

    _.each(runningJobs, function(job, name) {
        logger.info("stopScheduler: stoping job " + name);
        job.cronJob.stop();
        if (job.isRunning) {
            job.jobStoped = true;
        } else {
            delete runningJobs[name];
        }
    });

    var jobRuning = true;
    var iteration = 0
    async.whilst(
        function() {
            //logger.info("stopScheduler. iteration: "+iteration+", _.isEmpty(runningJobs): "+_.isEmpty(runningJobs));
            return (!_.isEmpty(runningJobs) && iteration < 60);
        },
        function(callback) {
            if (iteration % 60 === 0) {
                var jobs = "";
                _.each(runningJobs, function(job, name) {
                    jobs += name + ", ";
                });

                let msg = "stopScheduler: Stopping when the following jobs are still running: " + jobs
                logger.info(msg);
                iteration++;
                //callback(new Error(msg));
                return;
            }

            iteration++;
            setTimeout(function() {
                callback(null);
            }, 1000);
        },
        function(err) {
            callback(err);
        });
}

var nubocronSchedulerService = new Service(runScheduledJobs, {
    stop: function(callback) {
        cronSchedulerStoped = true;
        stopScheduler(callback);
    },
    period : SCHEDULER_REFRESH_INTERVAL
});

module.exports = nubocronSchedulerService

