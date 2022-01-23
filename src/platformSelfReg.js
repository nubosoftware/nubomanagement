/**
 * Self register platforms
 * Platfroms call this to self register and then the platform pool is based on
 * this data to start and maintain the platforms 
 */

const Common = require('./common.js');
const logger = Common.getLogger(__filename);
const { promisify } = require("util");
const redisGet = promisify(Common.redisClient.get).bind(Common.redisClient);
const redisSet = promisify(Common.redisClient.set).bind(Common.redisClient);
const redisExists = promisify(Common.redisClient.exists).bind(Common.redisClient);
const redisExpire= promisify(Common.redisClient.expire).bind(Common.redisClient);
const redisSmembers = promisify(Common.redisClient.smembers).bind(Common.redisClient);
const redisSadd = promisify(Common.redisClient.sadd).bind(Common.redisClient);
const redisSrem = promisify(Common.redisClient.srem).bind(Common.redisClient);

/**
 * Names of keys in redis
 */
const regPrefix = 'platform_reg_id';
const regIPPrefix = 'platform_reg_ip';
const platformRegs = 'platform_regs';

const statusOK = 0;
const statusError = -1;

/**
 * Time to live of registration entries in redis
 */
const TTL_SECONDS = 60;

class PlatSelfReg {

    constructor() {
    }

    /**
     * Register new platform IP
     * Each new platform get a platform id and added to redis with TTL of TTL_SECONDS
     * @param {*} req 
     * @param {*} res 
     */
    async selfRegisterPlatform(req, res) {
        try {
            // Read platform IP
            let platform_ip = req.params.platform_ip;

            if (platform_ip == "auto") {
                // get IP from request
                platform_ip = req.socket.remoteAddress;
                platform_ip = platform_ip.split(',')[0];
                platform_ip = platform_ip.split(':').slice(-1)[0];
                logger.info(`selfRegisterPlatform. Detected platform_ip: ${platform_ip}`);
            }

            // try to find an existent registration
            let platid = await redisGet(`${regIPPrefix}_${platform_ip}`);

            // loop until we get platform ID
            while (!platid) {
                let arr = await redisSmembers(platformRegs);
                for (let i = 0; i < arr.length; i++) {
                    arr[i] = Number(arr[i]);
                }
                for (let i = 1; i < 100000; i++) {
                    if (arr.indexOf(i) < 0) {
                        platid = i;
                        break;
                    }
                }
                if (!platid) {
                    throw new Error(`Cannot found any platform ID!`);
                }                
                // try to register it
                let reply = await redisSet(`${regPrefix}_${platid}`, platform_ip, 'EX', TTL_SECONDS, 'NX');
                if (!reply) {
                    logger.info(`Unable to set platid. Trying again`);
                    platid = null;
                    continue;
                }

                // register the ip address
                await redisSet(`${regIPPrefix}_${platform_ip}`, platid, 'EX', TTL_SECONDS);

                // add platform id to the set
                await redisSadd(platformRegs, platid);

                logger.info(`Registered platfrom id: ${platid}, platform ip: ${platform_ip}`);

            }
            res.send({
                status: statusOK,
                msg: `Registered`,
                platid
            });

        } catch (err) {
            logger.error(`selfRegisterPlatform error: ${err}`, err);
            res.send({
                status: statusError,
                msg: `Error: ${err}`
            });
        }
    }

    /**
     * Update the registered platfrom TTL to TTL_SECONDS
     * @param {*} req 
     * @param {*} res 
     */
    async selfRegisterPlatformTtl(req, res) {
        try {
            // Read platform IP
            let platform_ip = req.params.platform_ip;
            let idx = req.params.idx;

            if (platform_ip == "auto") {
                // get IP from request
                platform_ip = req.socket.remoteAddress;
                platform_ip = platform_ip.split(',')[0];
                platform_ip = platform_ip.split(':').slice(-1)[0];
                logger.info(`selfRegisterPlatformTtl. Detected platform_ip: ${platform_ip}`);
            }

            // try to find an existent registration
            let platid = await redisGet(`${regPrefix}_${idx}`);
            if (platid && platid ==  platform_ip) {
                await redisExpire(`${regPrefix}_${idx}`,TTL_SECONDS);
                await redisExpire(`${regIPPrefix}_${platform_ip}`,TTL_SECONDS);
                res.send({
                    status: statusOK,
                    msg: `Updated`
                });
            } else {
                throw new Error(`Platform registration not found!`);
            }            

        } catch (err) {
            logger.error(`selfRegisterPlatformTtl error: ${err}`, err);
            res.send({
                status: statusError,
                msg: `Error: ${err}`
            });
        }
    }


    /**
     * Get the IP address of seld register platform
     * @returns {String} IP address or null ifregistration not found
     * @param {Number} platid 
     */
    async getSelfRegisterPlatformIP(platid) {
        try {
            // try to find platform IP
            let ip = await redisGet(`${regPrefix}_${platid}`);
            return ip;            

        } catch (err) {
            logger.error(`getSelfRegisterPlatformPlatformIP error: ${err}`, err);
            return null;
        }
    }

    /**
     * Deamon call this to start service that remove expired platform
     * The service run every 30 seconds
     */
    subscribeToPlatformTTLExpiration() {
        if (this.interval) {
            this.unsubscribeFromPlatformTTLExpiration();
        }
        this.interval = setInterval(removeTTLExpired, 30000);

    }

    /**
     * Stop the service that check expired TTL
     */
    unsubscribeFromPlatformTTLExpiration() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}

/**
 * 
 * @returns Check for expired platform registration and remove them from redis set
 */
async function removeTTLExpired() {
    try {
        //logger.info('removeTTLExpired');
        let arr = await redisSmembers(platformRegs);
        for (let i = 0; i < arr.length; i++) {
            let platid = arr[i];
            if (!await redisExists(`${regPrefix}_${platid}`)) {
                logger.info(`Remove expired platform registration: ${platid}`);
                await redisSrem(platformRegs, platid);
            }
        }
    } catch (err) {
        logger.error(`removeTTLExpired error: ${err}`,err);
        return;
    }
}

module.exports = new PlatSelfReg();