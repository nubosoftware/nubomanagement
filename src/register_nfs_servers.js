"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var nfs_config = {};
var util = require('util');
var async = require('async');
var fs = require('fs');
var url = require('url');

function parse_configs(callback) {
    logger.info('Load settings from file');
    fs.readFile('NFSSettings.json', function(err, data) {
        if (err) {
            logger.error('Error: Cannot load settings from NFSSettings.json. Quiting...');
            Common.quit();
        }
        var msg = data.toString().replace(/[\n|\t]/g, '');
        var settings = JSON.parse(msg);
        logger.info('settings.nfs_servers:', settings.nfs_servers);
        callback(settings.nfs_servers);
    });
}

function fillRedis(item, callback) {

    var index;
    async.waterfall([
        function(callback) {
            Common.redisClient.incr("nfs_servers_last", function(err, res) {
                index = res;
                callback(err);
            })
        },
        function(callback) {
            logger.info("index " + index);
            Common.redisClient.hmset("nfs_server_" + index, item, function(err, obj) {
                if (err)
                    logger.info("saveObject: Error in save hmset " + err);
                callback(err);
            });
        },
        function(callback) {
            Common.redisClient.zadd("nfs_servers", item.score || 0, index, function(err, res) {
                if (err)
                    logger.info("saveObject: Error in save hmset " + err);
                callback(err);
            });
        }
    ], function(err) {
        logger.info("fillRedis finished " + (err ? " with err:" + err : "success"));
        callback(err);
    });
}

function commitRegistration(obj) {
    var nfs_servers;
    if (util.isArray(obj)) nfs_servers = obj;
    else nfs_servers = [obj];
    var zlist = [];
    var zscore = [];
    console.log("nfs_servers:\n", nfs_servers);
    async.series([
        function(callback) {
            async.each(
                nfs_servers,
                fillRedis,
                function(err) {
                    callback(err);
                }
            );
        },
    ], function(err) {
        console.log("register_nfs_servers.js: done!");
        Common.quit();
    });
}

function register_nfs() {
    var username;

    fs.stat('NFSSettings.json', function(err, stat) {
        if (err) {
            console.log("register_nfs_servers.js: NFSSettings.json doesn't exist, loading default settings...");
            username = process.env.USER;
            if (username === 'root') {
                console.error("register_nfs_servers.js: the script must be executed not as superuser!!!!");
                Common.quit();
            }

            var ip = process.argv[2];

            var nfs_server = {
                "nfs_ip": ip,
                "ssh_ip": ip,
                "ssh_user": username,
                "key_path": "/home/" + username + "/.ssh/id_rsa",
                "nfs_path": "/srv/nfs/homes"
            };
            commitRegistration(nfs_server);
        } else {
            parse_configs(commitRegistration);
        }
    });
}

Common.loadCallback = function(err, firstTimeLoad) {
    if (firstTimeLoad) register_nfs();
}