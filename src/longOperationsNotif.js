"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
const { promisify } = require("util");
const redisGet = promisify(Common.redisClient.get).bind(Common.redisClient);
const redisSet = promisify(Common.redisClient.set).bind(Common.redisClient);
const redisDel = promisify(Common.redisClient.del).bind(Common.redisClient);

class LongOperationNotif {

    constructor (token) {
        if (!token) {
            this.token = Common.crypto.randomBytes(48).toString('hex');
        } else {
            this.token = token;
        }
        this.key = "long_oper_"+this.token;
    }

    getToken() {
        return this.token;
    }

    async set(value) {
        let str;
        if (value === null) {
            return await redisDel(this.key);
        } else if (typeof value === 'object') {
            str = JSON.stringify(value);
        } else {
            str = value;
        }

        return await redisSet(this.key,str,"EX",60*60*24);
    }

    async get() {
        return await redisGet(this.key);
    }

}

module.exports = LongOperationNotif;

