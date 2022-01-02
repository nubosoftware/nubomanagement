var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
var fs = require('fs');
var _ = require("underscore")
var async = require('async');

var Common = require('./common.js');

var logger = Common.getLogger(__filename);

//================= requires =================================
var Service;
var daemonTools;
//============================================================

var NumOfTreads = 1;
var numOfWorkers = 1;
var serverAtExitProcess = false;
var workers = {};
var daemon_proc;

Common.loadCallback = function(err, firstTimeLoad) {
    if (!firstTimeLoad) // execute the following code only in the first time
        return;

    loadRequires();

    if (cluster.isMaster) {

        var daemonMonitorService = daemonTTLExpiredMonitorService();

        process.on('SIGINT', function() {
            if(serverAtExitProcess){
                return;
            }
            else {
                serverAtExitProcess = true;
            }

            if(daemon_proc) {
                daemon_proc.kill('SIGINT');
            }

            logger.info("Cluster Caught interrupt signal");

            _.each(workers, function(worker) {
                logger.info("Cluster: kill worker "+worker.process.pid);
                worker.send('shutdown');
                worker.kill('SIGINT');
            });
        });

        if ((!isNaN("" + Common.NumOfTreads)) && (Common.NumOfTreads > 0)) {
            NumOfTreads = Common.NumOfTreads
            numOfWorkers = NumOfTreads;
        }
        // Fork workers.
        for (var i = 0; i < NumOfTreads; i++) {
            var worker = cluster.fork();
            worker.on('exit', function(code, signal) {
                numOfWorkers--;
                logger.info('worker ' + this.process.pid + ' died');
                if (numOfWorkers === 0) {
                    Common.quit();
                }
            });
            workers[worker.id] = worker;
        }

        cluster.on('exit', function(worker, code, signal) {
            if (worker.suicide !== true) {
                var newWorker = cluster.fork();
                newWorker.on('exit', function(code, signal) {
                    numOfWorkers--;
                    logger.info('worker ' + this.process.pid + ' died');
                    if (numOfWorkers === 0) {
                        daemonMonitorService.stop(function(err){
                            Common.quit();
                        });
                    }
                });

                delete workers[worker.id];
                workers[newWorker.id] = newWorker;
            }
        });

        async.series([            
            function(callback) {
                if (Common.slaveManager) {
                    logger.info("multithreadserver: this management doesnt set to run daemon");
                    return callback(null);
                }

                daemonMonitorService.start();
            }
        ], function(err) {
            if (err) {
                logger.error("multithreadserver: " + err);
                process.kill(process.pid, 'SIGINT');
                return;
            }

            logger.error("multithreadserver: started");
        });


    } else {
        logger.info('worker ' + cluster.worker.id + ' started');
        require('./restserver.js').mainFunction(null, true, true);
    }
}

function daemonTTLExpired(msg) {

    if (msg !== 'expired' && msg !== 'exited') {
        logger.error("daemonTTLExpired: internal error, redis message not supported");
        return;
    }

    if(serverAtExitProcess){
        return;
    }

    if(daemon_proc){
        daemon_proc.kill('SIGKILL');
    }

    daemonTools.startDaemon(function(err, daemonProc) {
        if (err) {
            logger.error("daemonTTLExpired: " + err);
            return;
        }

        daemon_proc = daemonProc ? daemonProc : null;
        if (!daemon_proc) {
            logger.info("daemonTTLExpired: daemon is already running");
        }
    });

}

function daemonTTLExpiredMonitorService() {
    var mon = new Service(task, {
        period: 30
    });

    function task(callback) {

        if (serverAtExitProcess) {
            return;
        }

        daemonTools.startDaemon(function(err, daemonProc) {
            if (err) {
                logger.error("daemonTTLExpiredMonitorService: " + err);
                return callback(err);
            }

            if (daemonProc) {
                // we started new damon and if we had the old one - kill it.
                if (daemon_proc) {
                    daemon_proc.kill('SIGKILL');
                }

                daemon_proc = daemonProc
            }
            callback(null);
        });
    }

    return mon;
}

function loadRequires() {

    Service = require("./service.js");
    daemonTools = require('./daemonTools.js');
}
