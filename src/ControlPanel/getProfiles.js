"use strict";

/* @author Ori sharon
 * In this class we receive all profiles within a specific company
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var Login = require('../login.js');
var async = require('async');
var util = require('util');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
var _ = require("underscore");



function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}


function getOnlineProfiles(req, res) {
    let domain;
    loadAdminParamsFromSession(req, res, function(err, login) {
        if (!setting.getDebugMode()) {

            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }

            domain = login.loginParams.mainDomain;
        } else {
            domain = "nubosoftware.com";
        }
        logger.info(`getOnlineProfiles. domain: ${domain}`);
        Common.db.User.findAll({
            attributes : ['email', 'username', 'firstname', 'lastname', 'isactive', 'imageurl', 'isadmin'],
            include: [
                {
                    model: Common.db.UserDevices,
                    where : {
                        maindomain : domain,
                        platform : {
                            [Op.ne]: null
                        }
                    },
                    attributes: ['imei','devicename','gateway','platform'],
                }
            ]
        }).then(results => {
            res.send({
                status : 1,
                message : "Request was fulfilled",
                profiles: results
            });
        }).catch(err => {
            logger.error("getOnlineProfiles error: ",err);
            res.send({
                status : '0',
                message : "Internal error"
            });
        });
    });

}

// first call goes to here
function getProfiles(req, res, next) {
    // https://login.nubosoftware.com/getProfiles?session=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";
    var myUser = "";

    var bringOnline = false;
    var bringOnline = req.params.online;
    if (bringOnline && bringOnline == 'Y') {
        bringOnline = true;
    }

    loadAdminParamsFromSession(req, res, function(err, login) {

        if (!setting.getDebugMode()) {

            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }

            var domain = login.loginParams.mainDomain;
            myUser = login.loginParams.userName;
        } else {
            var domain = "nubosoftware.com";
        }

        var nextEmailToken = req.params.nextEmailToken;
        if (nextEmailToken == "") {
            nextEmailToken = null;
        }

        let limit =  parseInt(req.params.limit);
        if (isNaN(limit)) {
            limit = 100000;
        }

        let offset =  parseInt(req.params.offset);
        if (isNaN(offset)) {
            offset = 0;
        }

        let sortBy = req.params.sortBy;
        let order = [['lastname'], ['firstname']];
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

        let search = req.params.search;

        let adminFilter = req.params.adminFilter;



        //logger.info("getProfiles. order: "+JSON.stringify(order,null,2)+", sortBy: "+JSON.stringify(sortBy,null,2)+", sortDesc: "+JSON.stringify(sortDesc,null,2));


        getOnlineUser(domain, function(err, result) {
            if (err) {
                logger.error('getOnlineUser, problem read data from redis: ' + err);
            }
            getProfilesFromDB(res, nextEmailToken, myUser, result, bringOnline, domain,limit,offset,order,search,adminFilter);
        });
    });
}

function getProfilesFromDB(res, nextEmailToken, myUser, onlineUsers, bringOnline, domain,limit,offset,order,search,adminFilter) {


    var emails = [];
    var whereClause = {
         orgdomain : domain
    };

    if (bringOnline) {
        for (var key in onlineUsers) {
            if (onlineUsers.hasOwnProperty(key)) {
                emails.push(key);
            }
        }
        whereClause = {
            orgdomain : domain,
            email : emails
        }
    }

    if (search && search != "") {
        let lookupValue = search.toLowerCase();
        let searchWhere = {
            [Op.or]: {
                firstname: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('firstname')), 'LIKE', '%' + lookupValue + '%'),
                lastname: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('lastname')), 'LIKE', '%' + lookupValue + '%'),
                email: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('email')), 'LIKE', '%' + lookupValue + '%')
            }
        }
        whereClause = {...whereClause, ...searchWhere };
    }

    if (adminFilter && adminFilter == "Y" ) {
        whereClause.isadmin = 1;
    } else if (adminFilter && adminFilter == "N" ) {
        let adminWhere = {
            isadmin: {
                [Op.or] : {
                    [Op.ne]: 1,
                    [Op.is]: null
                }
            }
        };
        whereClause = {...whereClause, ...adminWhere };
    }



    //logger.info("whereClause: "+JSON.stringify(whereClause,null,2));




    Common.db.User.findAndCountAll({
        attributes : ['email', 'username', 'firstname', 'lastname', 'isactive', 'imageurl', 'isadmin'],
        where : whereClause,
        offset: offset,
        limit: limit,
        order: order
    }).complete(function(err, result) {

        var profile = [];

        if (!!err) {
            logger.error("err:: " + err);
            res.send({
                status : '0',
                message : "getProfiles internal error"
            });
            return;

        }

        if (!result || result.count <= 0) {
            logger.error('Cannot find users.');
            res.send({
                status : '1',
                message : "No data found"
            });
            return;
        }

        // counter that checks when we finish our results iterations
        var resCnt = 0;


        res.write('{"status":"1","message":"import succedded!", "myUser":' +JSON.stringify(myUser)+ ', "profiles":[');

        // run on each row in database and bring email / first / last / isactive / imageurl variables
        result.rows.forEach(function(row) {

            // get all values of current row
            var email = row.email != null ? row.email : '';
            var userName = row.username != null ? row.username : '';
            var firstName = row.firstname != null ? row.firstname : '';
            var lastName = row.lastname != null ? row.lastname : '';
            var isActive = row.isactive != null ? row.isactive : 0;
            var imageUrl = row.imageurl != null ? row.imageurl : '';
            var isAdmin = row.isadmin != null ? row.isadmin : 0;
            var isOnline = 0;
            var deviceType1 = "";
            var deviceType2 = "";

            if (onlineUsers && email in onlineUsers){
                isOnline = 1;
                deviceType1 = onlineUsers[email].deviceType1;
                deviceType2 = onlineUsers[email].deviceType2;
            } else {
                isOnline = 0;
            }

            var jsonUser = {
                id : resCnt+1,
                email : email,
                userName : userName,
                firstName : firstName,
                lastName : lastName,
                isActive : isActive,
                imageUrl : imageUrl,
                isOnline : isOnline,
                deviceType1 : deviceType1,
                deviceType2 : deviceType2,
                isAdmin : isAdmin
            };

            // separates every jsonUser
            if (resCnt > 0) {
                res.write(',');
            }

            resCnt++;
            res.write(JSON.stringify(jsonUser));


        });

        if (limit < 100000) {
            res.write('], "totalItems":'+result.count);
        } else {
            res.write('] ');
        }
        // return the json object if we have less or equal to 1000 records
        res.end(' , "isMore":' + false + '}');


        return;
    });
}

function getOnlineUser(domain, callback) {
    var onlineUsersMap = {};


    Common.db.UserDevices.findAll({
        attributes : ['email', 'devicename'],
        where : {
            maindomain : domain,
            platform : {
                [Op.ne]: null
            }
        },
    }).complete(function(err, results) {

        if (!!err) {
            logger.info(err);
            callback(err);
            return;

        } else if (!results || results == "") {
            logger.info("No device found");
            //return;
        } else {
             results.forEach(function(row) {
                // get all values of current row
                var email = row.email != null ? row.email : '';
                var deviceName = row.devicename != null ? row.devicename : '';

                if (email in onlineUsersMap) {
                    var device1 = onlineUsersMap[email].deviceType1;
                    // if true, set the 2nd deviceType
                    onlineUsersMap[email] = {
                        deviceType1 : device1,
                        deviceType2 : deviceName
                    };
                } else {
                    // if false, set the 1st deviceType
                    onlineUsersMap[email] = {
                        deviceType1 : deviceName,
                        deviceType2 : ""
                    };
                }
            });
        }
        callback(null, onlineUsersMap);
    });
}

function getDevices(req, res) {
    let adminLogin = req.nubodata.adminLogin;
	if (adminLogin == undefined || adminLogin.getAdminConsoleLogin() != 1) {
	  var msg = "Invalid credentials";
	  res.send({status: '0' , message: msg});
	  return;
    }
    const maindomain = adminLogin.loginParams.mainDomain;
    let where = {
        maindomain
    };

    let email = req.params.email;
    if (email  && email != "") {
        where.email = email;
    }

    let limit =  parseInt(req.params.limit);
    if (isNaN(limit)) {
        limit = 100000;
    }

    let offset =  parseInt(req.params.offset);
    if (isNaN(offset)) {
        offset = 0;
    }

    let sortBy = req.params.sortBy;
    let order = [['last_login','DESC'],['email'], ['devicename']];
    if (sortBy && sortBy != "") {
        if (!util.isArray(sortBy)) {
            sortBy = [sortBy];
        }
        order = [];
        sortBy.forEach(function (sortcol) {
            let sortstr = sortcol.toLowerCase();
            if (sortstr.indexOf('user.') == 0) {
                sortstr = sortstr.substring(5);
                order.push([{model: Common.db.User, as: 'user'},sortstr]);
            } else {
                order.push([sortstr]);
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
            if (coldesc == true || coldesc == "true")
                order[ind].push("DESC");
            ind++;
        });
    }
    logger.info(`sortBy: ${sortBy}, sortDesc: ${sortDesc}, order: ${order}`);

    let search = req.params.search;
    if (search && search != "") {
        let lookupValue = search.toLowerCase();
        let searchWhere = {
            [Op.or]: {
                devicename: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('devicename')), 'LIKE', '%' + lookupValue + '%'),
                'email': Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('user_devices.email')), 'LIKE', '%' + lookupValue + '%'),
                'firstname': Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('firstname')), 'LIKE', '%' + lookupValue + '%'),
                'lastname': Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('lastname')), 'LIKE', '%' + lookupValue + '%'),
                'local_extension': Sequelize.where(Sequelize.col('local_extension'), 'LIKE', '%' + lookupValue + '%'),
                'assigned_phone_number': Sequelize.where(Sequelize.col('assigned_phone_number'), 'LIKE', '%' + lookupValue + '%'),
            }
        }
        where = {...where, ...searchWhere };
    }

    let telephony = req.params.telephony;
    if (telephony == 'Y' || telephony =='y') {
        let searchWhere = {
            [Op.or]: {
                'local_extension': {
                    [Op.ne]: null,
                    [Op.ne]: '',
                },
                'assigned_phone_number': {
                    [Op.ne]: null,
                    [Op.ne]: '',
                }
            }
        }
        where = {...where, ...searchWhere };
    }


    Common.db.UserDevices.findAndCountAll({
        attributes : ['email', 'imei','devicename','active','maindomain','inserttime','last_login','gateway','platform','reg_phone_number','local_extension','assigned_phone_number','sip_username','sip_domain','sip_port','sip_protocol','sip_proxy','region_code'],
        where,
        include: [{
            model: Common.db.User,
            as: 'user',
            attributes: ['firstname','lastname'],
            required: true,
           }],
        offset: offset,
        limit: limit,
        order: order
    }).then(result => {
        res.send({
            status : 1,
            message : "Request was fulfilled",
            devices: result.rows,
            count: result.count
        });
    }).catch(err => {
        logger.error("getDevices error: ",err);
        res.send({
            status : '0',
            message : "Internal error"
        });
    });
}

var GetProfiles = {
    get : getProfiles,
    getOnlineProfiles: getOnlineProfiles,
    getDevices
};

module.exports = GetProfiles;
