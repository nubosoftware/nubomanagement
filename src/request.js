"use strict";
var request = require('request');
var url = require('url');
var Common = require('./common.js');

var doRequest = function(opts, callback) {
    if(Common.http_proxy) {
        opts.proxy = Common.http_proxy;
    }
    //console.log("doRequest opts: ", opts);
    request(opts, callback);
};

module.exports = doRequest;
