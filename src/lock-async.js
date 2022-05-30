"use strict";

const Common = require('./common.js');
const logger = Common.getLogger(__filename);
const crypto = require('crypto');
const { promisify } = require("util");
const redisGet = promisify(Common.redisClient.get).bind(Common.redisClient);
const redisSetnx = promisify(Common.redisClient.setnx).bind(Common.redisClient);
const redisExpire= promisify(Common.redisClient.expire).bind(Common.redisClient);
const redisDel = promisify(Common.redisClient.del).bind(Common.redisClient);

const defaultLockTimeout = 10 * 60 * 1000; //10 minuts
const defualtNumOfRetries = 10;
const defualtWaitInterval = 500;


/**
 * Lock in redis implments with await async
 * Works in the same emchanism as in lock.ks
 */
class LockAsync {

    /**
     * Initiate the lock object
     * @param {*} key
     * @param {*} parameters
     */
    constructor(key,options) {
        this._key = key;
        if (!this._key) {
            throw new Error("LockAsync. invalid key");
        }
        const parameters = options || {};
        this._numOfRetries = (parameters.numOfRetries ? parameters.numOfRetries : defualtNumOfRetries);
        this._waitInterval = (parameters.waitInterval ? parameters.waitInterval : defualtWaitInterval);
        this._lockTimeout = (parameters.lockTimeout ? parameters.lockTimeout : defaultLockTimeout);
        this._token = crypto.randomBytes(32).toString('hex');
        this._lockTimeoutFunc = null;
        this._lockAquired = false;

    }

    /**
     * Aquire the lock. thow error in case cannot aquire the lock
     * @returns
     */
    async acquire() {
        let self = this;
        let iter = 0;
        console.log(`Aquire lock: ${this._key}`);
        while (!self._lockAquired && iter <= self._numOfRetries) {
            let reply = await redisSetnx(self._key, self._token);
            if (reply == 1) {
                self._lockAquired = true;
                // lock will be deleted automatically after timeout
                await redisExpire(self._key,(self._lockTimeout/1000));
                break;
            }
            await sleep(self._waitInterval);
            ++iter;
        }
        if (!self._lockAquired) {
            var errMsg = `LockAsync.acquire: couldn't acquire lock on ${self._key}, numOfRetries: ${self._numOfRetries}, waitInterval: ${self._waitInterval}, iter: ${iter}`;
            logger.info(errMsg);
            throw new Error(errMsg);
        }
        self._lockTimeoutFunc = setTimeout(
        (function() {
            logger.error("acquire: execution of critical section for lock on \'" + self._key + "\' take too much time.");
            try {
                self.release();
            } catch (err) {
                logger.error(`LockAsync._lockTimeoutFunc release error: ${err}`,err);
            }
        }), self._lockTimeout);
        console.log(`Aquired! lock: ${this._key}`);
        return true;
    }

    /**
     * Release the lock. throw error in case lock not found
     */
    async release() {
        if (!this._lockAquired) {
            logger.info("LockAsync.release: lock on \'" + this._key + "\' wasn't aquired before");
            return;
        }
        let currentToken = await redisGet(this._key);
        if (this._token != currentToken) {
            throw new Error(`LockAsync.release. current token (${currentToken}) differ from acquired token (${this._token})`);
        }
        await redisDel(this._key);
        this._lockAquired = false;
        clearTimeout(this._lockTimeoutFunc);
        console.log(`Released. lock: ${this._key}`);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


module.exports = LockAsync;
