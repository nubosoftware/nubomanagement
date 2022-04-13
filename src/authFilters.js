var async = require('async');
var Login = require('./login.js');
var sessionModule = require('./session.js');
var Session = sessionModule.Session;
var Platform = require('./platform.js').Platform;
var Common = require('./common.js');
const logger = Common.getLogger(__filename);

var filters = {
    'SESSID': 0,
    'ISADMIN': 1,
    'LOGINTOKEN': 2,
    'PLATUID': 3,
    'CONTROL_PANEL_ID': 4,
    'NUBO_SETTINGS_ID': 5,
    'FRONTEND_AUTH' : 6,
    'WEB_ADMIN_TOKEN' : 7
}

function webAdminFilter(req, excludeList, callback) {
    let webAdminInclude = excludeList['WEB_ADMIN_TOKEN'];
    let reqPath = req.path(req.url);
    let apiReq = (reqPath.startsWith('/api/') && !reqPath.startsWith('/api/auth'));
    //logger.info("apiReq: "+apiReq+", reqPath"+reqPath);
    let auth = req.headers['authorization'];
    if (auth) {
        var res = auth.split(" ");
        if (Array.isArray(res) && res.length > 1) {
            auth = res[res.length-1];
        }
        //logger.info(`auth: "${auth}"`);
    }

    let adminLoginToken = (req.body && req.body.adminLoginToken) || req.params.adminLoginToken || auth;
    if (  (apiReq || (webAdminInclude && webAdminInclude[reqPath])) && adminLoginToken) {
        new Login(adminLoginToken, function(err, loginObj) {
            if (err) {
                return callback("Error loading adminLoginToken");
            }
            if (loginObj && loginObj.isValidLogin() && loginObj.getIsAdmin() == 1 && loginObj.getAdminConsoleLogin() == 1) {
                //logger.info("adminLoginToken validated. userName: "+loginObj.loginParams.userName);
                req.nubodata.adminLogin = loginObj;
                callback(null);
            } else {
                //logger.info("Invalid login for admin");
                callback("Invalid login for admin");
            }
        });
    } else {
        callback(null);
    }
}

function sessionIdFilter(req, excludeList, callback) {
    var reqPath = req.path(req.url);
    var session = (req.body && req.body.session) || req.params.session;
    var sessIdExclude = excludeList['SESSID'];

    if (sessIdExclude && sessIdExclude[reqPath]) {
        callback(null);
        return;
    }

    let excRegEx =  excludeList['NOLOGIN_REGEX'];
    if (excRegEx) {
        let m = reqPath.match(excRegEx);
        if (m) {
            callback(null);
            return;
        }
    }
    // pass validation if already authneticated dor web admin
    if (req.nubodata.adminLogin) {
        callback(null);
        return;
    }

    if (!session) {
        callback("missing session ID");
        return;
    }

    new Session(session, function(err, obj) {
        if (err) {
            callback(err);
            return;
        }

        req.nubodata.session = obj;
        callback(null)
    });
}

function isAdminFilter(req, excludeList, callback) {
    var reqPath = req.path(req.url);
    var isAdminExclude = excludeList['ISADMIN'];

    if (isAdminExclude && isAdminExclude[reqPath]) {
        callback(null);
        return;
    }

    let excRegEx =  excludeList['NOLOGIN_REGEX'];
    if (excRegEx) {
        let m = reqPath.match(excRegEx);
        if (m) {
            callback(null);
            return;
        }
    }

    var adminLogin = req.nubodata.adminLogin;
    if (adminLogin) {
        if (adminLogin.loginParams.isAdmin != 1) {
            callback("user is not admin");
        } else {
            callback(null);
        }
    } else {

        var session = req.nubodata.session;
        if (session == undefined) {
            callback("missing session data, cannot check if user is admin");
            return;
        }

        var loginToken = session.params.loginToken;

        if (!loginToken) {
            callback("missing loginToken (isAdminFilter)");
            return;
        }

        new Login(loginToken, function (err, login) {
            if (err) {
                callback(err);
                return;
            }

            if (login && login.loginParams.isAdmin != 1) {
                callback("user is not admin");
            } else {
                callback(null);
            }
        });
    }
}

function loginTokenFIlter(req, excludeList, callback) {
    var reqPath = req.path(req.url);
    var loginToken = req.params.loginToken;
    var loginTokenExclude = excludeList['LOGINTOKEN'];

    if (loginTokenExclude && loginTokenExclude[reqPath]) {
        callback(null);
        return;
    }
    let excRegEx =  excludeList['NOLOGIN_REGEX'];
    if (excRegEx) {
        let m = reqPath.match(excRegEx);
        if (m) {
            callback(null);
            return;
        }
    }

    var adminLogin = req.nubodata.adminLogin;
    if (adminLogin) {
        if (adminLogin.loginParams.isAdmin != 1) {
            callback("user is not admin");
        } else {
            callback(null);
        }
        return;
    }

    if (!loginToken) {
        callback("missing loginToken (loginTokenFIlter)");
        return;
    }

    new Login(loginToken, function(err, login) {
        if (err) {
            callback(err);
            return;
        }

        req.nubodata.loginToken = login;
        callback(null);
    });
}

function platUIDFilter(req, excludeList, callback) {
    var reqPath = req.path(req.url);
    var platformUID = req.params.platformUID;
    var platformID = req.params.platformID;
    var platformUIDExclude = excludeList['PLATUID'];

    if (platformUIDExclude && platformUIDExclude[reqPath]) {
        callback(null);
        return;
    }

    let excRegEx =  excludeList['NOLOGIN_REGEX'];
    if (excRegEx) {
        let m = reqPath.match(excRegEx);
        if (m) {
            callback(null);
            return;
        }
    }

    // pass validation if already authneticated dor web admin
    if (req.nubodata.adminLogin) {
        callback(null);
        return;
    }

    if (!platformID) {
        callback("missing platformID");
        return;
    }

    new Platform(platformID, null, function(err, platObj) {
        if(err) {
            setTimeout(function() {
                callback(err);
            }, 3000);
        } else if(platObj.params.platUID === platformUID) {
            callback(null);
        } else {
            setTimeout(function() {
                callback("illegal platform UID");
            }, 3000);
        }
    });
}

function controlPanelIDFilter(req, excludeList, callback) {
    var reqPath = req.path(req.url);
    var controlPanelID = req.header('controlPanelID');
    var session = req.nubodata.session;
    var controlPanelIDExclude = excludeList['CONTROL_PANEL_ID'];

    if (controlPanelIDExclude && controlPanelIDExclude[reqPath]) {
        callback(null);
        return;
    }
    let excRegEx =  excludeList['NOLOGIN_REGEX'];
    if (excRegEx) {
        let m = reqPath.match(excRegEx);
        if (m) {
            callback(null);
            return;
        }
    }

    // pass validation if already authneticated dor web admin
    if (req.nubodata.adminLogin) {
        callback(null);
        return;
    }


    if(controlPanelID == undefined){
        callback("missing controlPanelID");
        return;
    }
    if (session == undefined) {
        callback("missing session data, cannot check controlPanelID");
        return;
    }

    if(session.params.controlPanelID !== controlPanelID){
        callback("controlPanelID doesn't match to session\'s controlPanelID");
        return;
    }

    callback(null);
    return;
}

function nuboSettingsIDFilter(req, excludeList, callback) {
    var reqPath = req.path(req.url);
    var nuboSettingsID = req.header('nuboSettingsID')
    var session = req.nubodata.session;
    var nuboSettingsIDExclude = excludeList['NUBO_SETTINGS_ID'];

    if (nuboSettingsIDExclude && nuboSettingsIDExclude[reqPath]) {
        callback(null);
        return;
    }
    let excRegEx =  excludeList['NOLOGIN_REGEX'];
    if (excRegEx) {
        let m = reqPath.match(excRegEx);
        if (m) {
            callback(null);
            return;
        }
    }

     // pass validation if already authneticated dor web admin
     if (req.nubodata.adminLogin) {
        callback(null);
        return;
    }

    if(nuboSettingsID == undefined){
        callback("missing nuboSettingsID");
        return;
    }
    if (session == undefined) {
        callback("missing session data, cannot check nuboSettingsID");
        return;
    }

    if(session.params.nuboSettingsID !== nuboSettingsID){
        callback("nuboSettingsID doesn't match to session\'s nuboSettingsID");
        return;
    }

    callback(null);
    return;
}

function frontendAuthFilter(req, excludeList, callback) {
    var reqPath = req.path(req.url);
    var frontendExclude = excludeList['FRONTEND_AUTH'];

    if (frontendExclude && frontendExclude[reqPath]) {
        callback(null);
        return;
    }

    // pass validation if already authneticated dor web admin
    if (req.nubodata.adminLogin) {
        callback(null);
        return;
    }

    var feUser = req.header('fe-user');
    var fePass = req.header('fe-pass');

    if(!feUser || !fePass){
        callback("missing frontend user\\password auth");
        return;
    }

    var allowedFE = Common.allowedFE;
    if(!allowedFE){
        callback("missing allowed frontend access list");
        return;
    }

    var pass = allowedFE[feUser];
    if(!pass || pass !== fePass){
        callback("cannot authenticate frontend user or password not valid");
        return;
    }

    callback(null);
}

function getFilter(filter) {
    switch (filters[filter]) {
        case 0:
            return sessionIdFilter;
        case 1:
            return isAdminFilter;
        case 2:
            return loginTokenFIlter;
        case 3:
            return platUIDFilter;
        case 4:
            return controlPanelIDFilter;
        case 5:
            return nuboSettingsIDFilter;
        case 6:
            return frontendAuthFilter;
        case 7:
            return webAdminFilter;
        default:
            return null;
    }

}

module.exports = {
    getFilter: getFilter
};
