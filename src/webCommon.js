"use strict";
var Common = require('./common.js');

function get(req, res, next) {
    var webCommon = Common.webCommon || {};
    if (Common.withService) webCommon.withService = true;
    var body = "var Common = " + JSON.stringify(webCommon);
    res.end(body);
}

module.exports = get;
