"use strict"

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var _ = require('underscore');
var Netmask = require('netmask').Netmask;
const URL = require('url');
const validate = require("validate.js");
const path = require('path');
var fs = require("fs");
const execFile = require('child_process').execFile;

function webclientAllowedToaccess(ip) {

    var allowedSubnets = Common.webClientSubnets;
    var allowed = _.find(Common.webClientSubnets, function(subnet) {
        var block = new Netmask(subnet);
        return block.contains(ip)
    });

    if (allowed) {
        return true;
    } else {
        return false;
    }
}

function checkDataCenterStatus(req, res, next) {

    if (!Common.isEnterpriseEdition()) {
        var response = {
            status: Common.STATUS_OK,
            msg: "data center is avalible"
        };

        res.send(response);
        return;
    }

    Common.getEnterprise().dataCenter.isDataCenterOnline(Common.dcName, function(err, isOnline) {
        if (err) {
            logger.error("checkDataCenterStatus: " + err);
            var response = {
                status: Common.STATUS_DATA_CENTER_UNAVALIBLE,
                msg: "data center isn't avalible"
            };

            res.send(response);
            return;
        }

        if (isOnline) {
            var response = {
                status: Common.STATUS_OK,
                msg: "data center is avalible"
            };

            res.send(response);
            return;
        } else {
            logger.error("checkDataCenterStatus: data center isn't online");
            var response = {
                status: Common.STATUS_DATA_CENTER_UNAVALIBLE,
                msg: "data center isn't avalible"
            };

            res.send(response);
            return;
        }
    });
}

function buildPath() {

    var illegalPath = 'ILLEGAL_PATH';
    var newPath = [];
    var size = arguments.length;
    for (var arg of arguments) {

        try {
            var res = validate.single(arg, Common.constraints.pathConstrRequested);
            if (res) {
                logger.error("buildPath: " + res + ", path \'" + arg + "\'");
                return illegalPath;
            }
        } catch (error) {
            logger.error("buildPath: " + error.toString() + ", path \'" + arg + "\'");
            return illegalPath;
        }

        newPath.push(path.resolve("/" + arg));
    }

    var ret = path.join.apply(null, newPath);
    if (arguments[size-1].slice(-1) === "/" && arguments[size-1] !== "/") {
        ret += "/";
    }
    return ret;
}

function ensureExists(path, mask, cb) {
    if (typeof mask == 'function') { // allow the `mask` parameter to be optional
        cb = mask;
        mask = 0o777;
    }
    fs.mkdir(path, mask, function(err) {
        if (err) {
            if (err.code == 'EEXIST')
                cb(null); // ignore the error if the folder already exists
            else
                cb(err); // something else went wrong
        } else
            cb(null); // successfully created folder
    });
}

function getUploadDir() {
    return Common.rootDir + '/upload';
}

function moveFile(oldPath, newPath, callback) {
    fs.stat(oldPath,(err,stats) => {
        if (err) {
            error("Move file stats error: ",err);
            callback(err);
        }
        fs.rename(oldPath, newPath, function (err) {
            if (err) {
                if (err.code === 'EXDEV') {
                    copy();
                } else {
                    callback(err);
                }
                return;
            }
            callback();
        });
    });


    function copy() {
        var readStream = fs.createReadStream(oldPath);
        var writeStream = fs.createWriteStream(newPath);

        readStream.on('error', callback);
        writeStream.on('error', callback);

        readStream.on('close', function () {
            fs.unlink(oldPath, callback);
        });

        readStream.pipe(writeStream);
    }
}


class ExecCmdError extends Error {
    constructor(msg,err,stdout,stderr) {
        super(msg);
        this.err = err;
        this.stdout = stdout;
        this.stderr = stderr;
    }
}

/**
 * Run command using execFile
 * Return promise with object contains stdout and stderr
 * @param {String} cmd
 * @param {Array} params
 * @param {*} options
 * @returns Promise
 */
function execCmd(cmd,params,options) {
    return new Promise((resolve, reject) => {
        let opts = {maxBuffer: 1024 * 1024 * 10};
        if (options) {
            _.extend(opts, options)
        }
        execFile(cmd, params, opts , function (error, stdout, stderr) {
            if (error) {
                let e = new ExecCmdError(`${error}`,error,stdout,stderr);
                reject(e);
            }
            //logger.info("execCmd: " + "\'" + stdout + "\'");
            resolve({
                stdout,
                stderr
            });
            return;
        });
    });
}

module.exports = {
    webclientAllowedToaccess: webclientAllowedToaccess,
    checkDataCenterStatus: checkDataCenterStatus,
    buildPath: buildPath,
    ensureExists: ensureExists,
    getUploadDir: getUploadDir,
    moveFile: moveFile,
    execCmd,
    ExecCmdError
}
