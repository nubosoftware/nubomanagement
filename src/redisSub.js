"use strict";

function RedisSub(redisClient, opts) {
    this._redisClient = redisClient;
    this._channelHandlers = {};
    const self = this;

    this._redisClient.on("message", function(channel, message) {

        // console.log("RedisSub: message: " + channel + " :: " + message)
        var handlers = self._channelHandlers[channel];

        if (handlers) {
            handlers.forEach(function(handler) {

                handler.apply(this, [message]);
            });
        }

    });


    this._redisClient.on("pmessage", function(pattern, patternKey, value) {

        // console.log("RedisSub: pmessage: " + pattern + " :: " + patternKey + " :: " + value)
        var handlers = self._channelHandlers[pattern];

        if (handlers) {
            handlers.forEach(function(handler) {

                handler.apply(this, [patternKey, value]);
            });
        }
    });

    this._addHandler = function(channel, handler) {

        var handlers = self._channelHandlers[channel];
        var emptyArr = [];


        if (handlers) {
            handlers.push(handler);
        } else {
            emptyArr.push(handler);
            self._channelHandlers[channel] = emptyArr;

        }
    };

    this._removeHandler = function(channel, handler) {
        var chHandlers = this._channelHandlers[channel]
        for(var h of this._channelHandlers[channel]){
            // console.log("hhhhhhhh: " + h.toString())
            if(h.toString() === handler.toString()){
                var hIdx = chHandlers.indexOf(h);
                var newChHandlers = chHandlers.splice(hIdx, 1);
                // console.log("hidx: " + hIdx + "arr: " , newChHandlers)
                this._channelHandlers[channel] = newChHandlers;
            }
        }
    };
}

RedisSub.prototype.subscribe = function(channel, handler) {


    this._redisClient.subscribe(channel);

    this._addHandler(channel, handler);
};

RedisSub.prototype.psubscribe = function(pattern, handler) {

    this._redisClient.psubscribe(pattern);

    this._addHandler(pattern, handler);
};

RedisSub.prototype.unsubscribe = function(channel, handler) {

    this._redisClient.unsubscribe(channel);
    this._removeHandler(channel, handler);
}

RedisSub.prototype.punsubscribe = function(pattern, handler) {

    this._redisClient.punsubscribe(pattern);
    this._removeHandler(pattern, handler);
}

RedisSub.prototype.exit = function() {

    this._redisClient.quit();

}

module.exports = RedisSub;