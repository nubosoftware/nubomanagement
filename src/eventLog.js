"use strict";
var Common = require('./common.js');
var logger = Common.getLogger(__filename);
const { Op, QueryTypes } = require('sequelize');

// Event Types
var EV_CONST = {
    // Event Types
    EV_CREATE_PLAYER : 1,
    EV_RESET_PASSCODE : 2,
    EV_LOGIN : 3,
    EV_LOGOUT : 4,
    EV_EDIT_PROFILE : 5,
    EV_EXCHANGE_SETUP : 6,
    EV_AD_SYNC_START : 7,
    EV_AD_SYNC_END : 8,
    EV_ADD_PROFILE : 9,
    EV_DELETE_PROFILE : 10,
    EV_ACTIVATE_PROFILE : 11,
    EV_DEACTIVATE_PROFILE : 12,
    EV_ACTIVATE_DEVICE : 13,
    EV_DEACTIVATE_DEVICE : 14,
    EV_CREATE_GROUP : 15,
    EV_DELETE_GROUP : 16,
    EV_ADD_TO_GROUP : 17,
    EV_REMOVE_FROM_GROUP : 18,
    EV_UPLOAD_APK : 19,
    EV_ADD_APP_TO_PROFILE : 20,
    EV_REMOVE_APP_FROM_PROFILE : 21,
    EV_ADD_APP_TO_GROUP : 22,
    EV_REMOVE_APP_FROM_GROUP : 23,
    EV_APPROVE_PENDING_ACTIVATION : 24,
    EV_APPROVE_ALL_PENDING_ACTIVATION : 25,
    EV_REMOVE_PENDING_ACTIVATION : 26,
    EV_REMOVE_ALL_PENDING_ACTIVATION : 27,
    EV_USER_LOCKED: 28,
    EV_DEVICE_TYPE_BLOCKED: 29,
    EV_DISABLED_USER_DEVICE: 30,

    EV_NAMES: [
        'NA',
        'Create player',
        'Reset password',
        'Login',
        'Logout',
        'Edit profile',
        'Exchange setup',
        'LDAP sync start',
        'LDAP sync end',
        'Add profile',
        'Delete profile',
        'Activate profile',
        'Deactivate profile',
        'Activate device',
        'Deactivate device',
        'Create group',
        'Delete group',
        'Add to group',
        'Remove from group',
        'Upload APK',
        'Add app to profile',
        'Remove app from profile',
        'Add app to group',
        'Remove app from group',
        'Approve pending activation',
        'Approve all pending activations',
        'Remove pending activation',
        'Remove all pending activations',
        'User locked',
        'Device type blocked',
        'User device disabled',
    ],

    // Event Levels
    INFO : 'info',
    WARN : 'warn',
    ERR : 'err',
};

/**
 * createEvent
 * Adds an event to table events_log in DB
 *
 * @param event_type   Type of event as published in the list of constants (EV_*)
 * @param email        Email of the user who caused the event (string)
 * @param extra_info   Additional information regarding the action
 *                     (for example when activating a device this would be the deviceId) (string)
 * @param level        INFO, WARN or ERR constants
 * @param callback     function(err)
 */
function createEvent(event_type, email, maindomain, extra_info, level, callback) {
    var time = new Date();

    //console.log("maindomain " + maindomain + ", event_type " + event_type + ", email " + email + ", time " + time);
    Common.db.EventsLog.create({
        eventtype : event_type,
        email : email,
        maindomain : maindomain,
        extrainfo : extra_info,
        time : time,
        level : level
    }).then(function(results) {
        callback(null);
    }).catch(function(err) {
        console.log('err');
        logger.error('reportEvent Error: Cannot Insert to table.\n' + 'event_type=' + event_type + ' email=' + email + ' maindomain=' + maindomain + '\n extra_info=' + extra_info + ' time=' + time + 'level=' + level + '\nERROR: ' + err);
        callback(err);
    });
}
async function getEventsImp(domain,params) {
    let where= {
        maindomain: domain
    };
    var startTime = params.s;
    if (startTime !== undefined) {
        startTime = new Date(startTime);
    } else {
        startTime = new Date(new Date().getTime() - 30*24*60*60*1000)
    }
    where.time = {
        [Op.gt] :startTime
    };
    var endTime = params.e;
    if (endTime !== undefined) {
        endTime = new Date(endTime);
        where.time = {
            [Op.gt] :startTime,
            [Op.lt] :endTime
        };
    }
    let options = {
        where,
        limit: 10000,
        order: [["ID","DESC"]],
    }
    let results = await Common.db.EventsLog.findAll(options);
    let events = results.map((item) => {
        let event = {
            eventtype: item.eventtype,
            eventTypeStr: EV_CONST.EV_NAMES[item.eventtype],
            email: item.email,
            extrainfo: item.extrainfo,
            time: item.time
        };
        return event;
    });
    return events;
}

function getEvents(req,res) {
    let adminLogin = req.nubodata.adminLogin;
    if (!adminLogin) {
        res.writeHead(403, {
            "Content-Type": "text/plain"
        });
        res.end("403 Forbidden\n");
        return;
    }
    let domain = adminLogin.loginParams.mainDomain;
    getEventsImp(domain,req.params).then(events => {
        res.send({
            status : '1',
            message : "Request was fulfilled",
            events
        });
        res.end();
    }).catch(err => {
        logger.error("getEvents error: ",err);
        res.send({
            status : '0',
            message : err.message
        });
        res.end();
    });
}

module.exports = {
    EV_CONST : EV_CONST,
    createEvent : createEvent,
    getEvents
};
