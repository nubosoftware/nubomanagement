"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var commonUtils = require('./commonUtils.js');

function getResource(req, res, next) {
    // https://server_url/getResource?packageName=[]&fileName=[]
    // http://localhost/getResource?fileName=drawable-hdpi/ic_launcher.png&packageName=com.nubo.nubocamera

    res.contentType = 'json';
    var msg = "OK";
    var status = 0;
    var packageName = req.params.packageName;
    var fileName = req.params.fileName;

    if (packageName == null || packageName.length <=0 || packageName.length > 100 || packageName.indexOf('/') >= 0 || packageName.indexOf('\\\\') >= 0 || packageName.indexOf('.') == 0 || packageName.indexOf('..') >= 0 || packageName.indexOf('./') >= 0 || packageName.indexOf(';') >= 0 || packageName.indexOf(' ') >= 0 || packageName.indexOf('*') >= 0) {
        msg = "Invalid or missing package name";
        status = 1;
    }

    if (status == 0 && (fileName == null || fileName.length <=0 || fileName.length > 100 || fileName.indexOf('\\\\') >= 0 || fileName.indexOf('.') == 0 || fileName.indexOf('..') >= 0 || fileName.indexOf('./') >= 0 || fileName.indexOf(';') >= 0 || fileName.indexOf(' ') >= 0 || fileName.indexOf('*') >= 0)) {
        msg = "Invalid or missing file name";
        status = 1;
    }

    if (status == 1) {
        res.send({
            status : status,
            message : msg
        });
        return;
    }
    var filePath;
    filePath = commonUtils.buildPath(Common.nfshomefolder , 'html/player/extres' , packageName ,fileName);
    try {
        Common.fs.readFile(filePath, function(err, data) {
            if(data) {
               var dataEncodedBase64 = Buffer.from(data).toString('base64') ;
               res.send({
                   status : status,
                   message : msg,
                   fileName : fileName,
                   packageName : packageName,
                   fileContent : dataEncodedBase64
               });
               return;
            } else {
                status = Common.STATUS_INVALID_RESOURCE;
                msg = 'Cannot fetch resource';
                res.send({
                    status : status,
                    message : msg
                });
                return;
            }
        });
    } catch (e) {
        logger.error('General probelm in fetching resource, error: ' + e.message);
        status = 1;
        msg = 'General problem fetching resource';
        res.send({
            status : status,
            message : msg
        });
        return;
    }
}

var getResource = {
    getResource : getResource
};

module.exports = getResource;
