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
const { s } = require('accesslog/lib/tokens.js');




var loadedNFS = {};


/**
 * Get the NFS object from the cache or create a new one
 * @param {*} obj
 * @param {*} callback
 * @returns
 */
var nfsNew = function(obj, callback) {
    const nfs_idx = obj.nfs_idx;
    if (loadedNFS[nfs_idx]) {
        callback(null, loadedNFS[nfs_idx]);
        return;
    }
    getNFSServer(nfs_idx, function(err, result) {
        if (err) {
            return callback(err);
        }
        let nfsobj = {};
        nfsobj.logger = obj.logger || Common.logger;
        nfsobj.params = result;
        nfsobj.nfs_ip = nfsobj.params.ssh_ip;
        nfsobj.nfs_idx = nfs_idx;
        nfsobj.end = () => {};
        logger.info(`getNFSServer. idx: ${nfs_idx}, params: ${JSON.stringify(nfsobj.params,null,2)}`);
        loadedNFS[nfs_idx] = nfsobj;
        callback(null,nfsobj);
    });
}


/**
 * Load a NFS server params from the database by id
 * @param {*} id
 * @param {*} callback
 */
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
            return callback(new Error("getNFSServer: cannot find nfs server " + id));
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



module.exports = nfsNew;

