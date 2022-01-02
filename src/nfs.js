"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var util = require('util');
var async = require('async');
var User = require('./user.js');
var assert = require('assert');
var spawn = require('child_process').spawn;
var commonUtils = require('./commonUtils.js');
var validate = require('validate.js');
const { Op } = require('sequelize');





function getPathFromObj(path) {
    var realPath;
    if (path.folder == './') {
        realPath = path.root;
    } else {
        realPath = commonUtils.buildPath(path.root, path.folder);
    }

    return realPath;
}

var nfs = function(obj, callback) {
    this.params = {};
    var self = this;
    //    this.UserName = obj.UserName;    
    

    this.end = function() {}

    if (obj) {
        (function(nfsobj) {
            nfsobj.logger = obj.logger || Common.logger;
            var logger = nfsobj.logger;

            function initNfsIP(idx, callback) {
                var nfs;
                var ssh;
                async.series([
                    function(callback) {
                        getNFSServer(idx, function(err, result) {
                            if (err) {
                                return callback(err);
                            }

                            nfsobj.params = result;
                            nfsobj.nfs_ip = nfsobj.params.ssh_ip;
                            //logger.info(`getNFSServer. idx: ${idx}, params: ${JSON.stringify(nfsobj.params,null,2)}`);
                            callback(null);
                        });
                    },                   
                ], function(err) {
                    if (err) logger.info("fail to get nfs, err: " + err);
                    //else logger.info("nfs object initializated");
                    callback(err);
                });
            }

            var UserName = obj.UserName;
            var session_id;
            var nfs_idx;
            async.series([
                function(callback) {
                    if (!UserName) return callback(null);
                    Common.redisClient.srandmember("usersess_" + UserName, function(err, result) {
                        if (err) {
                            var msg = "Cannot get SRANDMEMBER usersess_" + UserName;
                            logger.info(msg);
                        }
                        //logger.info("SRANDMEMBER usersess_" + UserName + " return err: " + err + "; res: " + result);
                        session_id = result;
                        callback(null);
                    });
                },
                // If exist session of same user, use in same nfs to keep same sdcard storage, esle take nfs with least connections
                function(callback) {
                    if (session_id) {
                        Common.redisClient.hget("sess_" + session_id, "nfs_idx", function(err, result) {
                            if (err) {
                                var msg = "Cannot get HGET sess_" + session_id + " nfs_idx";
                                logger.info(msg);
                            }
                            //logger.info("HGET sess_" + UserName + " return err: " + err + "; res: " + result);
                            nfs_idx = result;
                            callback(err);
                        });
                    } else if (typeof obj.nfs_idx === 'number') {
                        nfs_idx = obj.nfs_idx;
                        callback(null);
                    } else {

                        callback("missing nfs server");
                        return;

                        // Common.redisClient.zrange('nfs_servers',0,0,function(err,replies) {
                        //     var msg = null;
                        //     if (err || replies.length<1) {
                        //         msg = err || "No nfs servers in redis";
                        //         logger.error(msg);
                        //     }
                        //     logger.info("NFS: "+ replies[0]);
                        //     nfs_idx = replies[0];
                        //     callback(msg);
                        // });
                    }
                },
            ], function(err) {
                if (err) {
                    logger.info("Cannot create nfs object, err:" + err);
                    callback(err);
                } else {
                    initNfsIP(nfs_idx, function(err) {
                        nfsobj.nfs_idx = nfs_idx;
                        callback(err, nfsobj);
                    });
                }
            });
        })(this);
    } else {
        var msg = "Could not create nfs. null obj";
        logger.error(msg);
        callback(msg, null);
    }
};

function getNFSServer(id, callback) {

    Common.db.NfsServers.findOne({
        where: {
            id: id
        },
    }).complete(function(err, nfs) {
        if (err) {
            console.error(err);
            return callback(err);
        }

        if (!nfs) {
            return callback("getNFSServer: cannot find nfs server " + id);
        }

        var nfs_server = {};
        nfs_server.id = id;
        nfs_server.dcname = nfs.dcname;
        nfs_server.nfs_ip = nfs.nfsip;
        nfs_server.ssh_ip = nfs.sship;
        nfs_server.ssh_user = nfs.sshuser;
        nfs_server.key_path = nfs.keypath;
        nfs_server.nfs_path = nfs.nfspath;
        if(nfs.nfspathslow) nfs_server.nfs_path_slow = nfs.nfspathslow;

        callback(null, nfs_server);
    });
}




module.exports = function(obj, callback) {
    new nfs(obj, callback);
};
