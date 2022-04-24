"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var async = require('async');
var DeleteGroups = require('./deleteGroups.js');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;

function get(req,res) {
    let adminLogin = req.nubodata.adminLogin;
    let selectedDomain = req.params.selectedDomain;


    if (!adminLogin) {
        res.writeHead(403, {
            "Content-Type": "text/plain"
        });
        res.end("403 Forbidden\n");
        return;
    }

    if (adminLogin.getSiteAdmin() != 1 && (!selectedDomain || selectedDomain != adminLogin.getMainDomain())) {
        res.writeHead(403, {
            "Content-Type": "text/plain"
        });
        res.end("403 Forbidden\n");
        return;
    }
    let orgs;
    async.series([
        (cb) => {
            let qOptions = {
                attributes : ['maindomain','orgname','inviteurl',"watermark","recordingall","recordingretentiondays"],
                order: [["orgname","ASC"],["maindomain", "ASC"]]
            };
            if (selectedDomain) {
                qOptions.where = {
                    maindomain: selectedDomain
                };
            }
            Common.db.Orgs.findAll(qOptions).then((results) => {
                orgs = results;
                cb();
            }).catch((err) => {
                cb(err);
            });
        },
    ],(err) => {
        if (err) {
            logger.error("Error in orgs.get: "+err);
            res.send({
                status : Common.STATUS_ERROR,
                message : "Internal error."
            });
            res.end();
            return;
        }
        res.send({
            status : Common.STATUS_OK,
            message : "Request was fulfilled",
            orgs
        });
        res.end();
    });
}

function post(req,res) {
    let adminLogin = req.nubodata.adminLogin;

    if (!adminLogin) {
        res.writeHead(403, {
            "Content-Type": "text/plain"
        });
        res.end("403 Forbidden\n");
        return;
    }
    let selectedDomain = req.params.selectedDomain;
    if (!selectedDomain || selectedDomain == "") {
        res.writeHead(400, {
            "Content-Type": "text/plain"
        });
        res.end("403 Bad Request \n");
        return;
    }
    if (adminLogin.getSiteAdmin() != 1 && selectedDomain != adminLogin.getMainDomain()) {
        res.writeHead(400, {
            "Content-Type": "text/plain"
        });
        res.end("403 Bad Request \n");
        return;
    }

    let fields = {
        maindomain: selectedDomain
    };
    if (req.params.orgname) {
        fields.orgname = req.params.orgname;
    } else {
        fields.orgname = "";
    }
    if (req.params.inviteurl) {
        fields.inviteurl = req.params.inviteurl;
    }
    if (req.params.watermark) {
        fields.watermark = req.params.watermark;
    } else {
        fields.watermark = "";
    }
    if (req.params.recordingall) {
        fields.recordingall = ( req.params.recordingall != 0 ? 1 : 0 );
    }
    if (req.params.recordingretentiondays && !isNaN(req.params.recordingretentiondays)) {
        fields.recordingretentiondays = req.params.recordingretentiondays;
    }

    async.series([
        (cb) => {
            Common.db.Orgs.upsert(fields).then(function(results) {
                if (results[1] === true) {
                    logger.info(`Inserted org record. Setting up organization configurations. results: ${JSON.stringify(results,null,2)}`);
                    require('../userUtils').postNewOrgProcedure(selectedDomain,logger,function(err) {
                        if (err) {
                            logger.info(`postNewOrgProcedure error: ${err}`);
                        }
                        cb();
                    });

                } else {
                    logger.info(`Updated org record: ${JSON.stringify(fields,null,2)}`);
                    cb();
                }
            }).catch(function(err) {
                logger.error("Error on org upsert",err);
                cb(err);
            });
        },
    ],(err) => {
        if (err) {
            logger.error("Error in orgs.post: "+err);
            res.send({
                status : Common.STATUS_ERROR,
                message : "Internal error."
            });
            res.end();
            return;
        }
        res.send({
            status : Common.STATUS_OK,
            message : "Request was fulfilled"
        });
        res.end();
    });
}

function deleteOrg(req,res) {
    let adminLogin = req.nubodata.adminLogin;

    if (!adminLogin || adminLogin.getSiteAdmin() != 1) {
        res.writeHead(403, {
            "Content-Type": "text/plain"
        });
        res.end("403 Forbidden\n");
        return;
    }
    let selectedDomain = req.params.selectedDomain;
    if (!selectedDomain || selectedDomain == "") {
        res.writeHead(400, {
            "Content-Type": "text/plain"
        });
        res.end("403 Bad Request \n");
        return;
    }



    async.series([
        (cb) => {
            // find online profiles
            Common.db.UserDevices.findAll({
                attributes : ['email','imei','devicename','gateway','platform'],
                where : {
                    maindomain : selectedDomain,
                    platform : {
                        [Op.ne]: null
                    }
                },
            }).then(results => {
                if (results && results.length > 0) {
                    let msg = `Found ${results.length} online users!`;
                    logger.info(msg);
                    cb(msg);
                    return;
                }
                cb();
            }).catch(err => {
                logger.info(`Error finding online users users: ${err}`,err);
                cb(err);
            });
        },
        (cb) => {
            // delete all profiles
            Common.db.User.findAll({
                attributes : ['email'],
                where : {
                    orgdomain : selectedDomain
                },
            }).then(results => {
                async.eachSeries(results, (item,cb) => {
                    require('./deleteProfiles.js').deleteProfilesFromDB(selectedDomain,{}, item.email, (err) => {
                        if (err) {
                            logger.info(`Error deleting users: ${item.email}`,err);
                        }
                        cb();
                    });
                },(err) => {
                    cb();
                });
            }).catch(err => {
                logger.info(`Error deleting users: ${err}`,err);
                cb();
            });
        },
        (cb) => {
            // delete groups
            Common.db.Groups.findAll({
                attributes : ['groupname','addomain'],
                where : {
                    maindomain : selectedDomain,
                },
            }).then(results => {
                async.eachSeries(results, (item,cb) => {
                    DeleteGroups.selectProfilesFromGroup(item.groupname, selectedDomain, item.addomain, function(err, status) {
                        if (err) {
                            logger.info(`Error deleting gorup: ${item.groupname}`,err);
                        } else {
                            logger.info(`Delete group: ${item.groupname}. Status: ${status}`);
                        }
                        cb();
                    });
                },(err) => {
                    cb();
                });
            }).catch(err => {
                logger.info(`Error deleting users: ${err}`,err);
                cb();
            });
        },
        (cb) => {
            // delete apps
            Common.db.Apps.findAll({
                attributes : ['packagename'],
                where : {
                    maindomain : selectedDomain
                },
            }).then(results => {
                async.eachSeries(results, (item,cb) => {
                    require('./deleteApp.js').deleteAppFromDB(item.packagename,selectedDomain,(err,status) => {
                        if (err) {
                            logger.info(`Error deleting app: ${item.packagename}`,err);
                        } else {
                            logger.info(`Delete app: ${item.packagename}. Status: ${status}`);
                        }
                        cb();
                    });
                },(err) => {
                    cb();
                });
            }).catch(err => {
                logger.info(`Error deleting users: ${err}`,err);
                cb();
            });
        },
        (cb) => {
            Common.db.Orgs.destroy({
                where : {
                    maindomain : selectedDomain
                }
            }).then(function() {
                logger.info('Org deleted from DB');
                cb();

            }).catch(function(err) {
                logger.info('Error: delete organiation from db: ' + err);
                callback(err);
            });
        },
    ],(err) => {
        if (err) {
            logger.error("Error in orgs.deleteOrg: "+err);
            res.send({
                status : Common.STATUS_ERROR,
                message : `${err}`
            });
            res.end();
            return;
        }
        res.send({
            status : Common.STATUS_OK,
            message : "Request was fulfilled"
        });
        res.end();
    });
}

module.exports = {
    get,
    post,
    deleteOrg
};