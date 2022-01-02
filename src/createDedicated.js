"use strict";

var Common = require('./common.js');
var async = require('async');
var userModule = require('./user.js');
var StartSession = require('./StartSession.js');
var sessionModule = require('./session.js');
var Session = sessionModule.Session;
var logger = Common.getLogger(__filename);

Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: " + err);
        Common.quit();
        return;
    }
    if (!firstTime) return;

    var args = process.argv;

    createDedicatedDomainPlatform(args[2], function(err) {
        if (err) {
            logger.error("createDedicated: " + err);
        }

        Common.quit();
    });
};

function createDedicatedDomainPlatform(domain, callback) {

    async.series([
        function(callback) {
            isDomainExist(domain, function(err, exist){
                if(err){
                    callback(err);
                    return;
                }

                if(!exist){
                    callback("domain does not exist");
                    return;
                }

                callback(null);
            });
        },
        function(callback) {
            disableLoginForDomain(domain, callback);
        },
        function(callback) {
            setDedicatedPlatformForDomain(domain, callback);
        },
        function(callback) {
            killAllSessionsOfDomain(domain, callback);
        },
        function(callback) {
            enableLoginForDomain(domain, callback);
        }
    ], function(err) {
        if (err) {
            logger.error("createDedicatedDomainPlatform: " + err);
            callback(err);
            return;
        }

        logger.info("createDedicatedDomainPlatform: finished migrating domain \'" + domain + "\' to dedicated platforms");
        callback(null);
    });
}

function setDedicatedPlatformForDomain(domain, callback) {

    Common.db.Orgs.update({
        dedicatedplatform: 1
    }, {
        where: {
            maindomain: domain
        }
    }).then(function() {
        callback(null);
    }).catch(function(err) {
        logger.error("setDedicatedPlatformForDomain: " + err);
        callback(err);
    });
}

function killAllSessionsOfDomain(domain, callback) {
    Common.redisClient.smembers('sessions_common', function(err, sessions) {
        if (err) {
            logger.error("killAllSessionsOfDomain: " + err);
            callback(err);
            return;
        }

        async.eachSeries(sessions, function(sessId, callback) {
            async.waterfall([
                function(callback) {
                    new Session(sessId, function(err, obj) {
                        if (err || !obj) {
                            var msg = "session does not exist. err:" + err;
                            callback(msg);
                            return;
                        }

                        callback(null, obj.params.email);
                    });
                },
                function(email, callback) {

                    userModule.getUserDomain(email, function(userDomain) {

                        if (!userDomain){
                            logger.error("couldnt get user domain");
                            callback(err);
                            return;
                        }

                        if(userDomain === domain) {
                            var killSession = true;
                            callback(null, killSession);
                        } else {
                            var killSession = false;
                            callback(null, killSession);
                        }
                    });
                },
                function(killSession, callback) {
                    if (!killSession) {
                        callback(null);
                        return;
                    }

                    StartSession.endSession(sessId, function(err) {
                        if (err) {
                            callback(err);
                            return;
                        }

                        callback(null);
                    });
                }
            ], callback);
        }, function(err) {
            if (err) {
                logger.error("killAllSessionsOfDomain: " + err);
                callback(err);
                return;
            }

            callback(null);
        });
    });
}

function disableLoginForDomain(domain, callback) {
    Common.db.Orgs.update({
        allowconnect: 0
    }, {
        where: {
            maindomain: domain
        }
    }).then(function() {
        callback(null);
    }).catch(function(err) {
        logger.error("disableLoginForDomain: " + err);
        callback(err);
    });
}

function enableLoginForDomain(domain, callback) {
    Common.db.Orgs.update({
        allowconnect: 1
    }, {
        where: {
            maindomain: domain
        }
    }).then(function() {
        callback(null);
    }).catch(function(err) {
        logger.error("enableLoginForDomain: " + err);
        callback(err);
    });
}

function isDomainExist(domain, callback){

    Common.db.Orgs.findAll({
        attributes : ['maindomain'],
        where : {
            maindomain : domain
        },
    }).complete(function(err, results) {

        if (!!err) {
            logger.error("isDomainExist: " + err);
            callback(err);
            return;
        }

        if (results.length === 0) {
            callback(null, false);
            return;
        }

        callback(null, true);
    });
}