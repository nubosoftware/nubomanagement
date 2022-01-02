"use strict";

var Common = require('./common.js');
var async = require('async');
var Lock = require('./lock.js');
var ChildProcess = require('child_process');
var os = require('os');
var TTL = 30;
var logger = Common.getLogger(__filename);
const path = require('path');

function setDaemonExiting(callback) {
    Common.redisClient.set("DaemonExiting", 1, function(err) {
        if (err) {
            logger.error("daemonExiting: " + err);
        }

        callback(null);
    });
}

function isDaemonExiting(callback) {
    Common.redisClient.get("DaemonExiting", function(err, replay) {
        if (err) {
            logger.error("isDaemonExiting: " + err);
            callback(err);
            return;
        }

        if (replay == 1) {
            callback(null, true);
            return;
        }

        callback(null, false);
    });
}

function idDaemonRunning(callback) {
    Common.redisClient.get('DaemonRunning', function(err, isRunning) {
        if (err) {
            logger.error("idDaemonRunning: " + err);
            return callback(err);
        }

        if (isRunning) {
            callback(null, true);
        } else {
            callback(null, false);
        }

    });
}

function startDaemon(callback) {

    var lock = new Lock({
        key: 'lock_daemon',
        logger: Common.logger,
        waitInterval: 200,
        numOfRetries: 5,
        lockTimeout: 1000 * 60 // 1 minute
    });

    var daemonProc;

    async.series([
        function(callback) {
            lock.acquire(function(err, isAcquired) {
                if (err) {
                    return callback(err);
                }

                if (isAcquired === 0) {
                    return callback('done');
                }

                callback(null);
            })
        },
        function(callback) {
            idDaemonRunning(function(err, isRunning) {
                if (err) {
                    return callback(err);
                }

                if (isRunning) {
                    return callback(null);
                }

                let daemonScript = path.join(__dirname, 'daemon.js');

                daemonProc = ChildProcess.spawn(
                    Common.globals.NODE, [daemonScript], {
                        stdio: ['ignore', 'inherit', 'inherit']
                    }
                );

                callback(null);
            });
        },
        function(callback) {
            var running = false;
            var iteration = 0;

            async.whilst(
                function() {
                    return (!running && iteration < 5)
                },
                function(callback) {
                    idDaemonRunning(function(err, isRunning) {
                        if (err) {
                            return callback(err);
                        }

                        if (isRunning) {
                            running = true;
                            return callback(null);
                        }

                        iteration++;

                        setTimeout(
                            (function() {
                                callback(null);
                            }), 1000);

                    });
                },
                function(err) {
                    if (err) {
                        return callback(err);
                    }

                    if (!running) {
                        return callback("daemon not running!!! after starting");
                    }

                    callback(null);
                });
        }
    ], function(err) {
        if (lock && lock.isAquired()) {
            lock.release(function(lockErr) {
                if (lockErr) {
                    logger.error("startDaemon: " + lockErr);
                }

                if (err && err !== 'done') {
                    return callback(err);
                }

                return callback(null, daemonProc);
            });
        } else {
            if (err && err !== 'done') {
                return callback(err);
            }
            return callback(null, daemonProc);
        }
    });

}

function initDaemon(callback) {
    var params = {};
    async.series([
            function(callback) {
                Common.redisClient.setnx('DaemonRunning', 1, function(err, reply) {
                    if (err) {
                        return callback(err);
                    }

                    if (reply != 1) {
                        return callback("Daemon is already running shouldn't happen!!!!!");
                    }

                    callback(null);
                });
            },
            function(callback) {
                var inet = Common.networkInterface || "eth0";


                var ifaces = os.networkInterfaces();

                if (ifaces[inet] && ifaces[inet][0]) {
                    params.ip = ifaces[inet][0].address;
                    callback(null);
                } else {
                    params.ip = "127.0.0.1";
                    logger.info(`Warning: IP address not found. Using default 127.0.0.1 for daemon.`);
                    callback(null);
                    // stopDaemon(function() {
                    //     callback("no interface or ip");
                    // });
                }
            },
            function(callback) {
                Common.redisClient.expire('DaemonRunning', TTL, callback);
            },
            function(callback) {
                params.pid = process.pid
                params.start = new Date();
                Common.redisClient.hmset('Daemon', params, callback);
            }
        ],
        function(err) {
            if (err) {
                logger.error("initDaemon: " + err);
                return callback(err);
            }

            callback(null);
        }
    );
}

function stopDaemon(callback) {

    Common.redisClient.del(['DaemonRunning', 'Daemon', 'DaemonExiting'], function(err) {
        if (err) {
            logger.error("stopDaemon: " + err);
            return callback(err);
        }

        Common.redisClient.publish("daemon", "exited");
        callback(null);
    });
}


function pingOfLife(callback) {
    Common.redisClient.expire('DaemonRunning', TTL, function(err, reply) {

        if (err) {
            logger.error("pingOfLife: cannot update DaemonRunning in redis, err: " + err + ", exiting.");
            process.kill(process.pid, 'SIGINT');
        }
        callback(null);
    });
}

function subscribeToDaemonTTLExpiration(callbackFunction){

    Common.redisSub.subscribe("__keyspace@0__:DaemonRunning", callbackFunction);
    Common.redisSub.subscribe("daemon", callbackFunction);
}

module.exports = {
    setDaemonExiting: setDaemonExiting,
    isDaemonExiting: isDaemonExiting,
    startDaemon: startDaemon,
    initDaemon: initDaemon,
    stopDaemon: stopDaemon,
    pingOfLife: pingOfLife,
    daemonTTL: TTL,
    subscribeToDaemonTTLExpiration: subscribeToDaemonTTLExpiration,
    idDaemonRunning: idDaemonRunning
}