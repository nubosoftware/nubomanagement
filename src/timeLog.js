"use strict";
/**
 * timeLog.js
 * Track the execution times of lonf operations
 * Write the output to the Commons.logger or to the logger supplied by the constructor
 */
var Common = require('./common.js');
var logger = Common.getLogger(__filename);

var TimeLog = function(specialLogger){
  this.mylogger = (specialLogger ? specialLogger : logger);
  this.startTime = new Date();
  this.prevTime = this.startTime;

  this.logTime = function(text) {
    var curTime = new Date();
    var startDiff = curTime - this.startTime;
    var prevLogDiff = curTime - this.prevTime;
    this.mylogger.info("TimeLog. s: "+startDiff+" ms, p: "+prevLogDiff+" ms, text: "+text);
    this.prevTime = curTime;
  }

  //this.mylogger.info("Start TimeLog");
};

module.exports = {TimeLog: TimeLog };

