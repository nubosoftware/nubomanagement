var execFile = require('child_process').execFile;

var async = require("async");
var Common = require('../common.js');
var authFilterExcludes = require('../authFilterExcludes.js');
var authFilterValidator = require('../authFilterValidator.js');
var logger = Common.getLogger(__filename);

var input;
if (process.argv.length>=3) {
    try {
        input = require(process.argv[2]);
    } catch(e) {
        console.log("bad input file err:", e);
        process.exit();
    }
} else {
    input = require('./testFilters-example-input.js');
}

var validate = require('validate.js');
var filterModule = require('@nubosoftware/permission-parser');

var urlFilterOpts = {
    loge: console.error,
    mode: filterModule.mode.URL
};

var bodyFilterOpts = {
    loge: console.error,
    mode: filterModule.mode.BODY
};

var urlFilterObj = new filterModule.filter([], urlFilterOpts,validate);
var bodyFilterObj = new filterModule.filter([], bodyFilterOpts,validate);
var filterFile = "../parameters-map.js";

var refresh_filter = function() {
    try {
        delete require.cache[require.resolve(filterFile)];
    } catch(e) {}

    var obj;
    try {
        obj = require(filterFile);
        obj.permittedMode = false;
    } catch(e) {
        logger.error('Error: Cannot load ' + filterFile + ' file, err: ' + e);
        return;
    }

    urlFilterObj.reload(obj.rules, {permittedMode: obj.permittedMode});
    bodyFilterObj.reload(obj.rules, {permittedMode: obj.permittedMode});
};
refresh_filter();

var validator;
function getValidator(){
    if (!(validator instanceof authFilterValidator)) {
        // SESSID filter need to be before ISADMIN filter because ISADMIN filter uses session data set in SESSID filter
        validator =  new authFilterValidator(['LOGINTOKEN', 'SESSID', 'ISADMIN', 'PLATUID', 'CONTROL_PANEL_ID', 'NUBO_SETTINGS_ID'], authFilterExcludes, Common.authValidatorPermittedMode);
    }

    return validator;
}

function authValidate(req, res, next) {
    req.nubodata = {};

    getValidator().validate(req, function(err) {
        if (err) {
            logger.error("authValidate: " + err + ", URL: " + req.url);

            res.contentType = 'json';
            res.send({
                status: 0,
                message: "bad request"
            });
        } else {
            next();
            return;
        }
    });
}

var headers = {
    "Content-Type": "application/json"
}


Common.loadCallback = function(err, firstTimeLoad) {
    if (err) {
        console.log("Fatal Error: " + err);
        Common.quit();
        return;
    }

    if (!firstTimeLoad)// execute the following code only in the first time
        return;

    var failFlag = false;
    var failedTasks = [];

    async.each(
        input,
        function(item, callback) {
            runTask(item, function(err) {
                if(err) {
                    failFlag = true;
                    console.log("failed task: ", item);
                    failedTasks.push(item);
                }
                callback(null);     //finish all tasks
            });
        },
        function(err) {
            console.log("\n\n\nFINAL RESULT:\n\n\n");
            if(err || failFlag) {
                console.log("failed tasks: ", failedTasks);
                console.log("test failed!!!");
            } else {
                console.log("test success!!!");
            }
            Common.quit();
        }
    );
}

function runTask(task, callback) {
    var failedFlag = false;
    var req = {
        url: task.api,
        _url: {pathname: task.api},
        headers: task.headers,
        query: task.query,
        body: task.body,
        path: function() {return task.api;},
        params: task.query,
        header: function(item) {return task.headers[item];}
    }
    var obj = new function() {
        var _cb = function(err) {
            console.log("undefined function")
        }

        this.setCallback = function(func){
            _cb = func;
        };

        this.res = {
            end: function(msg) {
                //console.log("res: " + msg);
                console.log("FAIL: " + task.api);
                failedFlag = true;
                _cb(null);
            },
            header: function(key, val) {
                //console.log("res header: " + key + ": " + val);
            }
        };
        this.next = function() {
            //console.log("OK")
            _cb(null);
            return this;
        }
    };
    async.series(
        [
            function(callback) {
                obj.setCallback(callback);
                console.log("test query");
                urlFilterObj.useHandler(req, obj.res, obj.next);
            },
            function(callback) {
                obj.setCallback(callback);
                console.log("test body");
                bodyFilterObj.useHandler(req, obj.res, obj.next);
            },
            function(callback) {
                obj.setCallback(callback);
                console.log("test auth");
                authValidate(req, obj.res, obj.next);
            }
        ], function(err) {
            if((task.expect && failedFlag) || (!task.expect && !failedFlag)) {
                console.log("Not expected result");
                callback("Not expected result");
            } else {
                callback(null);
            }
        }
    )
}

