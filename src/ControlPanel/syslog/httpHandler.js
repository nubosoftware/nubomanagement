"use strict";
var async = require('async');
var Common = require('../../common.js');
var ThreadedLogger = require('../../ThreadedLogger.js');
var DBProcessModule = require('./DBProcess.js');
const { Op } = require('sequelize');
var util = require('util');

/*
 * Handle request /getLogs
 * Parameters:
 *  sessionId - sessionId of user request Logs (for secutity check)
 *  s - start time of logs, seconds since EPOCH (where.Time) default: 24 hours ago
 *  e - end time of logs, seconds since EPOCH (where.Time) default: now
 *  user - filter logs for some user (where.User)
 *  limit - limit logs records (limit) default: 5000
 *  offset - skip offset logs records (offset)
 *  level - filter logs for maximum level (where.LogLevel)
 *  comp - filter by ComponentType
 *  mtype - filter by MessageType
 */
function httpGet(req, res) {
    var fail = function(status, msg) {
        logger.error("request req.url finished with error: " + msg);
        res.send({
            status : status,
            msg : msg
        });
    };

    var logger = new ThreadedLogger(Common.getLogger(__filename));
    var startTime = req.params.s;
    if (startTime === undefined) {
        //logger.debug("notifyClient: Missing start time of logs");
        startTime = new Date(new Date().getTime() - 1*24*60*60*1000);
    } else if (isNaN(startTime)) {
        startTime = new Date(startTime);
    } else {
        startTime = new Date(startTime * 1000);
    }
    var endTime = req.params.e;
    if (endTime === undefined) {
        logger.debug("notifyClient: Missing end time of logs");
    }
    var user = req.params.u;
    if (user === undefined) {
        logger.debug("notifyClient: Missing user");
    }
    var limit = req.params.limit;
    if (limit === undefined) {
        logger.debug("notifyClient: Missing limit");
    }
    var offset = req.params.offset;
    if (offset === undefined) {
        logger.debug("notifyClient: Missing offset");
    }
    var level = req.params.level;
    if (level === undefined) {
        logger.debug("notifyClient: Missing level");
    }

    let sortBy = req.params.sortBy;
    let order = [["ID","DESC"]];
    if (sortBy && sortBy != "") {
        if (!util.isArray(sortBy)) {
            sortBy = [sortBy];
        }
        order = [];
        sortBy.forEach(function (sortcol) {
            order.push([sortcol.toLowerCase()]);
        });
    }

    let sortDesc = req.params.sortDesc;
    if (sortDesc && sortDesc != "") {
        if (!util.isArray(sortDesc)) {
            sortDesc = [sortDesc];
        }
        let ind = 0;
        sortDesc.forEach(function (coldesc) {
            if (coldesc == true)
                order[ind].push("DESC");
            ind++;
        });
    }


    //logger.info(`getLogs. params: ${JSON.stringify(req.params,null,2)}`);
    var logsArr, lastLog;

    async.series([
            // 1. Who request log? Permissions?
            function(callback) {
                callback(null);
            },
            // 2. Get logs from DB
            function(callback) {
                var filter = {
                    order:  order
                };
                filter.start_time = startTime;
                if(endTime) filter.end_time = new Date(endTime * 1000);
                //console.log("httpHangler startTime: ", startTime);
                if(user) filter.user = user;
                filter.limit = limit || 5000;
                if(offset) filter.offset = offset;
                if(level) filter.level = {[Op.lte] : level};
                if(req.params.comp) filter.ComponentType = req.params.comp;
                if(req.params.serverName) filter.ServerName = req.params.serverName;
                if(req.params.mtype) filter.MessageType = req.params.mtype;
                if (req.params.search && req.params.search != "") filter.search = req.params.search;
                //logger.info("Get logs, filter:" + filter);
                DBProcessModule.getLogs(filter, function(err, results) {
                    logsArr = results;
                    callback(null);
                });
            },
            // 4. Send logs to client
            function(callback) {
                res.send({
                    status : '1',
                    count: logsArr.count,
                    logs : logsArr.rows
                });
            },
        ], function(err) {
            logger.info("Finish log request");
            if (err) {
                res.send({
                    status : '0',
                    message: err
                });
            }
            res.end();
        }
    );
}

function getFiltersFromLogs(req,res) {
    var logger = Common.getLogger(__filename);
    DBProcessModule.getFiltersFromLogs((err,resObj) => {
        if (err) {
            res.send({
                status : '0',
                message: err
            });
            res.end();
            return;
        }
        resObj.status = '1';
        resObj.message = "Request was fulfilled"
        res.send(resObj);
        res.end();
    });
}

module.exports = {
    get: httpGet,
    getFiltersFromLogs
};

