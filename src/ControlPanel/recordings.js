"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
const LongOperationNotif = require('../longOperationsNotif.js');
const fs = require('fs');
const fsp = fs.promises;
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const util = require('util');
const { request } = require('http');

/**
 * Get list of recordings
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @returns
 */
async function getRecordings(req, res, next) {
    try {
        let adminLogin = req.nubodata.adminLogin;
        if (!adminLogin) {
            res.writeHead(403, {
                "Content-Type": "text/plain"
            });
            res.end("403 Forbidden\n");
            return;
        }
        let params = req.params;
        //logger.info(`getRecordings. params: ${JSON.stringify(params,null,2)}`);
        const maindomain = adminLogin.loginParams.mainDomain;
        let where = {
            maindomain,
        }
        let limit =  parseInt(params.limit);
        if (isNaN(limit)) {
            limit = 10000;
        }

        let offset =  parseInt(params.offset);
        if (isNaN(offset)) {
            offset = 0;
        }

        let sortBy = params.sortBy;
        let order = [['start_time','DESC']];
        if (sortBy && sortBy != "") {
            if (!util.isArray(sortBy)) {
                sortBy = [sortBy];
            }
            order = [];
            sortBy.forEach(function (sortcol) {
                let acol = sortcol.split(".");
                if (acol.length > 1) {
                    order.push([{model: Common.db.SessionHistory},acol[1],"ASC"]);
                } else {
                    order.push([sortcol,"ASC"]);
                }
            });
        }

        let sortDesc = req.params.sortDesc;
        if (sortDesc && sortDesc != "") {
            if (!util.isArray(sortDesc)) {
                sortDesc = [sortDesc];
            }
            let ind = 0;
            sortDesc.forEach(function (coldesc) {
                if (coldesc == true || coldesc == "true") {
                    order[ind].pop();
                    order[ind].push("DESC");
                }
                ind++;
            });
        }

        let search = req.params.search;
        if (search && search != "") {
            let lookupValue = search.toLowerCase();
            let searchWhere = {
                [Op.or]: {
                    device_id: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('device_id')), 'LIKE', '%' + lookupValue + '%'),
                    devicename: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('devicename')), 'LIKE', '%' + lookupValue + '%'),
                    email: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('session_history.email')), 'LIKE', '%' + lookupValue + '%'),
                    firstname: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('firstname')), 'LIKE', '%' + lookupValue + '%'),
                    lastname: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('lastname')), 'LIKE', '%' + lookupValue + '%'),
                }
            }
            where = {...where, ...searchWhere };
        }
        if (params.from && params.to) {
            let dateTo = new Date(params.to);
            dateTo.setDate(dateTo.getDate()+1);
            where.start_time = {
                [Op.gt] : new Date(params.from),
                [Op.lt] : dateTo
            };
        }
        //logger.info(`where: ${JSON.stringify(where,null,1)}, order: ${JSON.stringify(order,null,1)}`);
        let result = await Common.db.SessionRecordings.findAndCountAll({
            attributes: ['session_id', 'start_time', 'end_time', 'active_seconds', 'file_name'],
            where,
            offset: offset,
            limit: limit,
            order: order,
            include: [
                {
                    model: Common.db.SessionHistory,
                    attributes: ['email', 'device_id', 'devicename', 'platform', 'gateway'],
                    include: [ {
                        model: Common.db.User,
                        attributes: ['firstname', 'lastname']
                    } ]
                }
            ]
        });
        // logger.info(`getRecordings. result: ${JSON.stringify(result,null,2)}`);
        res.send({
            status: 1,
            message: "Request was fulfilled",
            results: result.rows,
            count: result.count,
        });


    } catch (err) {
        logger.error("getRecordings: " + err, err);
        res.send({
            status: "0",
            message: (err.message ? err.message : err)
        });
    }
}

/**
 * Prepare a video file - convert the recording file to mp4 video
 * @param {*} req
 * @param {*} res
 * @param {*} session_id
 * @param {*} start_time_str
 * @returns
 */
async function prepareVideoFile(req, res, session_id, start_time_str) {
    let sentResult = false;
    let notif;
    try {
        let adminLogin = req.nubodata.adminLogin;
        if (!adminLogin) {
            res.writeHead(403, {
                "Content-Type": "text/plain"
            });
            res.end("403 Forbidden\n");
            return;
        }
        const maindomain = adminLogin.loginParams.mainDomain;
        //const session_id = req.params.session_id;
        const start_time = new Date(start_time_str);
        let where = {
            maindomain,
            session_id,
            start_time
        }
        let item = await Common.db.SessionRecordings.findOne({
            where,
        });

        // look for the video file
        let mp4Exists;
        let mp4Size;
        let mp4FilePath = Common.path.join(Common.recording_path, `${item.file_name}.mp4`);
        try {
            const stats = await fsp.stat(mp4FilePath);
            mp4Exists = true;
            mp4Size = stats.size;
        } catch (e) {
            //console.error(e);
        }
        // if video file found return video ready imidiately
        if (mp4Exists) {
            res.send({
                status: 1,
                message: "Video Ready",
                size: mp4Size
            });
            return;
        }

        // look for the recording file
        let recFileSize;
        let recFilePath = Common.path.join(Common.recording_path, item.file_name);
        try {
            const stats = await fsp.stat(recFilePath);
            recFileSize = stats.size;
        } catch (e) {
            //console.error(e);
            logger.info(`prepareVideoFile. File error. file: ${recFilePath}, err: ${e}`);
            throw new Error(`Recording file does not exists`);
        }

        // return result for long operation
        notif = new LongOperationNotif();
        notif.set({
            status: 2,
            message: "Preparing video"
        });
        //logger.info("Notif token: " + notif.getToken());
        res.send({
            status: 2,
            message: "Preparing video",
            notifToken: notif.getToken()
        });
        sentResult = true;

        // preapre the video file
        if (Common.isDesktop()) {
            await Common.getDesktop().recordings.prepareVideoFile(recFilePath);
            notif.set({
                status: Common.STATUS_OK,
                message: "Video file is ready"
            });
        } else {
            throw new Error("Not implemented");
        }




    } catch (err) {
        logger.error("prepareVideoFile: " + err, err);
        if (!sentResult) {
            res.send({
                status: "0",
                message: (err.message ? err.message : err)
            });
        } else if (notif) {
            notif.set({
                status: Common.STATUS_ERROR,
                message: "Error preparing video"
            });
        }
    }
}

/**
 * Send the video file to video player
 * @param {*} req
 * @param {*} res
 * @param {*} session_id
 * @param {*} start_time_str
 * @returns
 */
async function getVideo(req, res, session_id, start_time_str) {
    try {
        let adminLogin = req.nubodata.adminLogin;
        if (!adminLogin) {
            res.writeHead(403, {
                "Content-Type": "text/plain"
            });
            res.end("403 Forbidden\n");
            return;
        }
        const maindomain = adminLogin.loginParams.mainDomain;
        //const session_id = req.params.session_id;
        const start_time = new Date(start_time_str);
        let where = {
            maindomain,
            session_id,
            start_time
        }
        let item = await Common.db.SessionRecordings.findOne({
            where,
        });

        // look for the video file
        let fileSize;
        let mp4FilePath = Common.path.join(Common.recording_path, `${item.file_name}.mp4`);
        try {
            const stats = await fsp.stat(mp4FilePath);
            fileSize = stats.size;
        } catch (e) {
            throw new Error(`Recording file does found: ${e}`);
        }
        if (req.params.download) {
            logger.info(`Download video`);
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
                'Content-disposition': `attachment; filename=user_recording.mp4`
            }
            logger.info(`Sending full size file: $${fileSize} bytes.`);
            res.writeHead(200, head);
            fs.createReadStream(mp4FilePath).pipe(res);
            return;
        }
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-")
            const start = parseInt(parts[0], 10)
            const end = parts[1]
                ? parseInt(parts[1], 10)
                : fileSize - 1
            const chunksize = (end - start) + 1
            const file = fs.createReadStream(mp4FilePath, { start, end })
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            }
            //logger.info(`Sending partial file with the following headers: ${JSON.stringify(head,null,2)}`);
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Accept-Ranges': 'bytes',
                'Content-Type': 'video/mp4',
            }
            //logger.info(`Sending full size file: $${fileSize} bytes.`);
            res.writeHead(200, head)
            /*let buff = await fsp.readFile(mp4FilePath);
            logger.info(`Size: $${buff.byteLength} bytes.`);
            res.write(buff);
            res.end();*/
            fs.createReadStream(mp4FilePath).pipe(res);
        }

    } catch (err) {
        logger.error("getVideo: " + err, err);
        res.writeHead(404, {
            "Content-Type": "text/plain"
        });
        res.end("404 Not found\n");
        return;

    }
}

/**
 * Get the profiles that have recording
 * @param {*} req
 * @param {*} res
 * @returns
 */
async function getProfiles(req, res,next) {
    try {
        let adminLogin = req.nubodata.adminLogin;
        if (!adminLogin) {
            res.writeHead(403, {
                "Content-Type": "text/plain"
            });
            res.end("403 Forbidden\n");
            return;
        }
        const maindomain = adminLogin.loginParams.mainDomain;

        let results = await Common.db.User.findAll({
            attributes : ['email', 'firstname', 'lastname'],
            where : {
                orgdomain : maindomain,
                recording: 1
            },
        });
        res.send({
            status: 1,
            message: "Request was fulfilled",
            results,
        });

    } catch (err) {
        logger.error("getSettings: " + err, err);
        res.send({
            status: "0",
            message: (err.message ? err.message : err)
        });
        return;

    }
}

async function addRemoveProfiles(req, res) {
    try {
        let adminLogin = req.nubodata.adminLogin;
        if (!adminLogin) {
            res.writeHead(403, {
                "Content-Type": "text/plain"
            });
            res.end("403 Forbidden\n");
            return;
        }
        const maindomain = adminLogin.loginParams.mainDomain;
        const emails = req.params.emails;
        let recording = (req.method == "PUT" ? 1 : 0);

        if (!emails) {
            throw new Error("Invalid paramter");
        }
        if (!util.isArray(emails)) {
            emails = emails.split(",");
        }

        await Common.db.User.update({
            recording: recording
        }, {
            where: {
                email: emails,
                orgdomain: maindomain
            }
        });

        res.send({
            status: 1,
            message: "Request was fulfilled",
        });

    } catch (err) {
        logger.error("getSettings: " + err, err);
        res.send({
            status: "0",
            message: (err.message ? err.message : err)
        });
        return;

    }
}

/**
 * Delete old recordings for all domain. Run this function for schduler (databasemaint)
 * @returns
 */
async function deleteOldRecordings() {
    try {
        let orgs = await Common.db.Orgs.findAll({
            attributes: ['maindomain','recordingretentiondays'],
            where: {
                recordingretentiondays:  {
                    [Op.gt] : 0,
                }
            },
        });
        for (const org of orgs) {
            let start_time = new Date(new Date().getTime() - ( org.recordingretentiondays * 24 * 60 * 60 * 1000));
            let results = await Common.db.SessionRecordings.findAll({
                attributes: ['session_id', 'start_time', 'end_time', 'active_seconds', 'file_name'],
                where: {
                    maindomain: org.maindomain,
                    start_time:  {
                        [Op.lt] : start_time,
                    }
                }
            });
            if (results.length > 0) {
                logger.info(`deleteOldRecordings. domain: ${org.maindomain}, recordingretentiondays: ${org.recordingretentiondays}, start_time: ${start_time}`);
                logger.info(`deleteOldRecordings. domain: ${org.maindomain}, records to delete: ${results.length}`);
                for (const item of results) {
                    try {
                        let filePath = Common.path.join(Common.recording_path,item.file_name);
                        await fsp.unlink(filePath);
                    } catch (e) {
                        logger.error(`deleteOldRecordings. Delete file error: ${e}`);
                    }
                    try {
                        let filePath = Common.path.join(Common.recording_path,`${item.file_name}.mp4`);
                        await fsp.unlink(filePath);
                    } catch (e) {
                        // ignore error as mp4 not always created
                    }
                    await Common.db.SessionRecordings.destroy({
                        where: {
                            session_id: item.session_id,
                            start_time: item.start_time
                        }
                    });
                }
            }
        }

    } catch (err) {
        logger.error("deleteOldRecordings: " + err, err);
    }
}

module.exports = {
    getRecordings,
    prepareVideoFile,
    getVideo,
    getProfiles,
    addRemoveProfiles,
    deleteOldRecordings,
}