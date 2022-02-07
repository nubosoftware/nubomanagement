var async = require('async');
var Common = require('./common.js');
var ThreadedLogger = require('./ThreadedLogger.js');
var CopyAppUsageLogs = require('./copyAppUsageLogs.js');
var AddLastSessions = require('./addLastSessions.js');
var validate = require("validate.js");
var constraints = require("@nubosoftware/nubo-validateconstraints")(validate);
var DatabaseMaintModule = require('./DatabaseMaint.js');

var jobs = {
    COPY_APP_USAGE: 1,
    ADD_LAST_SESSIONS: 2,
    DATABASE_MAINT: 5,
    TO_STRING: ['not used', 'copy app usage', 'add last sessions', 'ad sync', 'not used','Database maintananace tasks']
};

var PARAMS_START_INDEX = 1;
var COMMAND_INDEX = 0;

function runCronJob(args, logger, callback){

    async.waterfall([
        function(callback) {

            validateArgs(args, logger, function(err) {
                if (err) {
                    callback(err);
                    return;
                }

                command = parseInt(args[COMMAND_INDEX]);
                var params = args.slice(PARAMS_START_INDEX, args.length);

                callback(null, command, params);
            });
        },
        function(command, params, callback) {

            var job = parseInt(command);

            switch (job) {
                case jobs.COPY_APP_USAGE:
                    copyAppUsage(logger, callback);
                    break;

                case jobs.ADD_LAST_SESSIONS:
                    AddLastSessionsWrapper(logger, callback);
                    break;

                case jobs.DATABASE_MAINT:
                    databaseMaint(logger, callback);
                    break;

                default:
                    if (Common.isEnterpriseEdition()) {
                        const found = Common.getEnterprise().entCronJobs.runJob(job,params,logger,callback);
                        if (found) {
                            return;
                        }
                    }
                    if (Common.isMobile()) {
                        const found = Common.getMobile().cronJobs.runJob(job,params,logger,callback);
                        if (found) {
                            return;
                        }
                    }
                    if (Common.isDesktop()) {
                        const found = Common.getDesktop().cronJobs.runJob(job,params,logger,callback);
                        if (found) {
                            return;
                        }
                    }
                    var msg = "unknown job with ID \'" + args[COMMAND_INDEX] + "\'";
                    logger.error(msg);
                    callback(msg);
                    break;
            }
        }
    ], function(err) {
        if (err) {
            logger.error("runCronJob: " + err);
            callback(err);
            return;
        }

        //logger.info("runCronJob: \'" + jobs.TO_STRING[command] + "\' job finished succefully");
        callback(null);
        return;
    });


}

function databaseMaint(logger, callback) {

    DatabaseMaintModule.databaseMaint(logger,function(err) {
        if (err) {
            logger.error("databaseMaint: " + err);
            callback('databaseMaint failed');
            return;
        }

        callback(null);
    });
}

function copyAppUsage(logger, callback) {

    CopyAppUsageLogs.copyLogsFromNuboLogs(function(err) {
        if (err) {
            logger.error("copyAppUsage: " + err);
            callback('copyAppUsage failed');
            return;
        }

        callback(null);
    });
}

function AddLastSessionsWrapper(logger, callback) {

    AddLastSessions.addLastSessions(function(err) {
        if (err) {
            logger.error("AddLastSessions: " + err);
            callback('AddLastSessions failed');
            return;
        }

        callback(null);
    });
}


function validateArgs(args, logger, callback) {

    var jobId = args[COMMAND_INDEX];
    var rule;


    var res = validate.single(jobId, validator().command);
    if (res) {
        logger.error("validateArgs: job ID isn't valid");
        callback("job ID isn't valid");
        return;
    }

    rule = validator().rules[jobId];

    if (rule === undefined) {
        logger.error("validateArgs: missing validation for rule");
        callback('missing validation for rule');
        return;
    }

    var params = args.slice(PARAMS_START_INDEX, args.length);

    params.forEach(function(val, index, array) {

        if (!rule[index]) {
            var errMsg = "missing validator for \'" + val + "\'";
            logger.error("validateArgs:" + errMsg);
            callback(errMsg);
            return;
        }

        var res = validate.single(val, rule[index]);
        if (res) {
            var errMsg = "paramter \'" + val + "\' is not valid";
            logger.error("validateArgs:" + errMsg);
            callback(errMsg);
            return;
        }

    });

    callback(null);
}

/*
   Adding validation to jobs:
   Rules keys correspond to job number.
   Each rule key correspond to parameter (cmd argument) index normalized,
   (without first 3 indexes - program (node), script (nuboCronJobs.js), command (job)).
*/
var validator = function() {

    var parametersMap = {
        'command': constraints.NaturalNumberConstrRequested,
        'rules': {
            '1': {},
            '2': {},
            '3': {
                '0': constraints.adDomainNameConstrRequested,
                '1': constraints.adDomainNameConstrRequested
            },
            '4': {},
            '5': {},
            '10': {},
        }
    };

    return parametersMap;
}

module.exports = {
    jobs: jobs,
    runCronJob: runCronJob
};