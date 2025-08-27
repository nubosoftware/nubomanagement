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
    EV_PLUGIN_EVENT: 31,
    EV_PLUGIN_SECURITY_EVENT: 32,
    EV_PASSWORD_CHANGE: 33,
    EV_ADMIN_PASSWORD_CHANGE: 34,
    EV_USER_CHANGE: 35,
    EV_USER_DELETE: 36,
    EV_SESSION_LOCK: 37,
    EV_SESSION_DUPLICATE_LOGIN: 38,
    EV_SESSION_CONCURRENT_LIMIT: 39,
    EV_PASSWORD_OPERATION_FAILED: 40,
    EV_ADMIN_IP_BLOCKED: 41,
    EV_PASSWORD_KEY_GENERATION_FAILED: 42,
    EV_SECURITY_CONFIG_CHANGE: 43,
    EV_DEFAULT_ACCOUNT_PASSWORD_CHANGE: 44,
    EV_ADMIN_SECURITY_FUNCTION: 45,
    EV_LOGIN_FAILED: 46,
    EV_ACCOUNT_LOCKED: 47,
    EV_ACCOUNT_UNLOCKED: 48,

    // Event Categories
    EV_CATEGORIES: {
        1: 'USER_MANAGEMENT',           // EV_CREATE_PLAYER
        2: 'USER_MANAGEMENT',           // EV_RESET_PASSCODE
        3: 'AUTHENTICATION',            // EV_LOGIN
        4: 'AUTHENTICATION',            // EV_LOGOUT
        5: 'USER_MANAGEMENT',           // EV_EDIT_PROFILE
        6: 'SYSTEM_ADMINISTRATION',     // EV_EXCHANGE_SETUP
        7: 'SYSTEM_ADMINISTRATION',     // EV_AD_SYNC_START
        8: 'SYSTEM_ADMINISTRATION',     // EV_AD_SYNC_END
        9: 'PROFILE_MANAGEMENT',        // EV_ADD_PROFILE
        10: 'PROFILE_MANAGEMENT',       // EV_DELETE_PROFILE
        11: 'PROFILE_MANAGEMENT',       // EV_ACTIVATE_PROFILE
        12: 'PROFILE_MANAGEMENT',       // EV_DEACTIVATE_PROFILE
        13: 'DEVICE_MANAGEMENT',        // EV_ACTIVATE_DEVICE
        14: 'DEVICE_MANAGEMENT',        // EV_DEACTIVATE_DEVICE
        15: 'GROUP_MANAGEMENT',         // EV_CREATE_GROUP
        16: 'GROUP_MANAGEMENT',         // EV_DELETE_GROUP
        17: 'GROUP_MANAGEMENT',         // EV_ADD_TO_GROUP
        18: 'GROUP_MANAGEMENT',         // EV_REMOVE_FROM_GROUP
        19: 'APPLICATION_MANAGEMENT',   // EV_UPLOAD_APK
        20: 'APPLICATION_MANAGEMENT',   // EV_ADD_APP_TO_PROFILE
        21: 'APPLICATION_MANAGEMENT',   // EV_REMOVE_APP_FROM_PROFILE
        22: 'APPLICATION_MANAGEMENT',   // EV_ADD_APP_TO_GROUP
        23: 'APPLICATION_MANAGEMENT',   // EV_REMOVE_APP_FROM_GROUP
        24: 'ACTIVATION_MANAGEMENT',    // EV_APPROVE_PENDING_ACTIVATION
        25: 'ACTIVATION_MANAGEMENT',    // EV_APPROVE_ALL_PENDING_ACTIVATION
        26: 'ACTIVATION_MANAGEMENT',    // EV_REMOVE_PENDING_ACTIVATION
        27: 'ACTIVATION_MANAGEMENT',    // EV_REMOVE_ALL_PENDING_ACTIVATION
        28: 'SECURITY_INCIDENTS',       // EV_USER_LOCKED
        29: 'DEVICE_MANAGEMENT',        // EV_DEVICE_TYPE_BLOCKED
        30: 'DEVICE_MANAGEMENT',        // EV_DISABLED_USER_DEVICE
        31: 'PLUGIN_EVENTS',            // EV_PLUGIN_EVENT
        32: 'PLUGIN_EVENTS',            // EV_PLUGIN_SECURITY_EVENT
        33: 'PASSWORD_MANAGEMENT',      // EV_PASSWORD_CHANGE
        34: 'PASSWORD_MANAGEMENT',      // EV_ADMIN_PASSWORD_CHANGE
        35: 'USER_MANAGEMENT',          // EV_USER_CHANGE
        36: 'USER_MANAGEMENT',          // EV_USER_DELETE
        37: 'SECURITY_ADMINISTRATION',  // EV_SESSION_LOCK
        38: 'SECURITY_INCIDENTS',       // EV_SESSION_DUPLICATE_LOGIN
        39: 'SECURITY_INCIDENTS',       // EV_SESSION_CONCURRENT_LIMIT
        40: 'PASSWORD_MANAGEMENT',      // EV_PASSWORD_OPERATION_FAILED
        41: 'SECURITY_INCIDENTS',       // EV_ADMIN_IP_BLOCKED
        42: 'SECURITY_ADMINISTRATION',  // EV_PASSWORD_KEY_GENERATION_FAILED
        43: 'SECURITY_ADMINISTRATION',  // EV_SECURITY_CONFIG_CHANGE
        44: 'PASSWORD_MANAGEMENT',      // EV_DEFAULT_ACCOUNT_PASSWORD_CHANGE
        45: 'SECURITY_ADMINISTRATION',  // EV_ADMIN_SECURITY_FUNCTION
        46: 'SECURITY_INCIDENTS',       // EV_LOGIN_FAILED
        47: 'SECURITY_INCIDENTS',       // EV_ACCOUNT_LOCKED
        48: 'SECURITY_INCIDENTS',       // EV_ACCOUNT_UNLOCKED
    },

    EV_CATEGORY_NAMES: {
        'AUTHENTICATION': 'Authentication',
        'PASSWORD_MANAGEMENT': 'Password Management',
        'SECURITY_INCIDENTS': 'Security Incidents',
        'SECURITY_ADMINISTRATION': 'Security Administration',
        'USER_MANAGEMENT': 'User Management',
        'PROFILE_MANAGEMENT': 'Profile Management',
        'DEVICE_MANAGEMENT': 'Device Management',
        'GROUP_MANAGEMENT': 'Group Management',
        'APPLICATION_MANAGEMENT': 'Application Management',
        'ACTIVATION_MANAGEMENT': 'Activation Management',
        'SYSTEM_ADMINISTRATION': 'System Administration',
        'PLUGIN_EVENTS': 'Plugin Events'
    },

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
        'Plugin event',
        'Plugin security event',
        'Password change',
        'Admin password change',
        'User details change',
        'User delete',
        'Session lock',
        'Duplicate login detected',
        'Concurrent session limit exceeded',
        'Password operation failed',
        'Admin IP blocked',
        'Password key generation failed',
        'Security configuration change',
        'Default account password change',
        'Admin security function',
        'Login failed',
        'Account locked',
        'Account unlocked',
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

    // If callback is provided, use it (for backward compatibility)
    if (callback) {
        return Common.db.EventsLog.create({
            eventtype: event_type,
            email: email,
            maindomain: maindomain,
            extrainfo: extra_info,
            time: time,
            level: level
        }).then(function(results) {
            callback(null);
        }).catch(function(err) {
            logger.error('reportEvent Error: Cannot Insert to table.\n' + 'event_type=' + event_type + ' email=' + email + ' maindomain=' + maindomain + '\n extra_info=' + extra_info + ' time=' + time + 'level=' + level + '\nERROR: ' + err);
            callback(err);
        });
    }

    // Return promise if no callback provided
    return Common.db.EventsLog.create({
        eventtype: event_type,
        email: email,
        maindomain: maindomain,
        extrainfo: extra_info,
        time: time,
        level: level
    }).catch(function(err) {
        logger.error('reportEvent Error: Cannot Insert to table.\n' + 'event_type=' + event_type + ' email=' + email + ' maindomain=' + maindomain + '\n extra_info=' + extra_info + ' time=' + time + 'level=' + level + '\nERROR: ' + err);
        throw err;
    });
}
async function getEventsImp(domain, params) {
    let where = {
        maindomain: domain
    };
    
    // Time range filtering
    var startTime = params.s;
    if (startTime !== undefined) {
        startTime = new Date(startTime);
        where.time = {
            [Op.gt]: startTime
        };
    } else {
        startTime = new Date(new Date().getTime() - 30*24*60*60*1000);
        where.time = {
            [Op.gt]: startTime
        };
    }
    
    var endTime = params.e;
    if (endTime !== undefined) {
        endTime = new Date(endTime);
        where.time = {
            [Op.gt]: startTime,
            [Op.lt]: endTime
        };
    }

    // Filter by eventtype and/or category
    let eventTypeFilter = [];
    
    // Add specific event types if requested
    if (params.eventtype !== undefined) {
        const eventtypes = Array.isArray(params.eventtype) ? params.eventtype : [params.eventtype];
        eventTypeFilter = eventTypeFilter.concat(eventtypes.map(et => parseInt(et)));
    }
    
    // Add event types from categories if requested
    if (params.category !== undefined) {
        const categories = Array.isArray(params.category) ? params.category : [params.category];
        const eventTypesInCategories = [];
        for (let eventType in EV_CONST.EV_CATEGORIES) {
            if (categories.includes(EV_CONST.EV_CATEGORIES[eventType])) {
                eventTypesInCategories.push(parseInt(eventType));
            }
        }
        
        if (params.eventtype !== undefined) {
            // If both eventtype and category filters are specified, use intersection
            eventTypeFilter = eventTypeFilter.filter(et => eventTypesInCategories.includes(et));
        } else {
            // If only category filter is specified, use all event types from categories
            eventTypeFilter = eventTypesInCategories;
        }
    }
    
    // Apply event type filter if we have any event types to filter by
    if (eventTypeFilter.length > 0) {
        where.eventtype = {
            [Op.in]: eventTypeFilter
        };
    }

    // Filter by email
    if (params.email !== undefined) {
        const emails = Array.isArray(params.email) ? params.email : [params.email];
        where.email = {
            [Op.in]: emails
        };
    }

    // Filter by level
    if (params.level !== undefined) {
        const levels = Array.isArray(params.level) ? params.level : [params.level];
        where.level = {
            [Op.in]: levels
        };
    }

    // Filter by text search in extrainfo
    if (params.text !== undefined) {
        where.extrainfo = {
            [Op.like]: `%${params.text}%`
        };
    }

    // Determine sort order
    let orderBy = [["ID", "DESC"]]; // default
    if (params.sortBy !== undefined) {
        const sortField = params.sortBy;
        const sortDirection = params.sortDirection || "DESC";
        
        // Validate sort field
        const validSortFields = ["ID", "eventtype", "email", "time", "level"];
        if (validSortFields.includes(sortField)) {
            orderBy = [[sortField, sortDirection.toUpperCase()]];
        }
    }

    // Handle pagination
    const limit = params.limit !== undefined ? parseInt(params.limit) : 1000;
    const offset = (params.offset !== undefined && params.offset !== null) ? parseInt(params.offset) : 0;

    let options = {
        where,
        limit: limit,
        offset: offset,
        order: orderBy,
    };

    // Get total count without limit/offset for pagination info
    const totalCount = await Common.db.EventsLog.count({ where });
    
    let results = await Common.db.EventsLog.findAll(options);
    let events = results.map((item) => {
        const category = EV_CONST.EV_CATEGORIES[item.eventtype];
        let event = {
            eventtype: item.eventtype,
            eventTypeStr: EV_CONST.EV_NAMES[item.eventtype],
            category: category,
            categoryStr: EV_CONST.EV_CATEGORY_NAMES[category],
            email: item.email,
            extrainfo: item.extrainfo,
            time: item.time,
            level: item.level
        };
        return event;
    });

    // Create event types list
    const eventTypes = [];
    for (let i = 1; i < EV_CONST.EV_NAMES.length; i++) {
        const category = EV_CONST.EV_CATEGORIES[i];
        eventTypes.push({
            eventtype: i,
            eventTypeStr: EV_CONST.EV_NAMES[i],
            category: category,
            categoryStr: EV_CONST.EV_CATEGORY_NAMES[category]
        });
    }

    // Create categories list
    const categories = [];
    for (let categoryKey in EV_CONST.EV_CATEGORY_NAMES) {
        categories.push({
            category: categoryKey,
            categoryStr: EV_CONST.EV_CATEGORY_NAMES[categoryKey]
        });
    }

    return {
        events,
        eventTypes,
        categories,
        total: totalCount
    };
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
    getEventsImp(domain,req.params).then(result => {
        res.send({
            status : '1',
            message : "Request was fulfilled",
            events: result.events,
            eventTypes: result.eventTypes,
            categories: result.categories,
            total: result.total
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
