"use strict";

const Common = require('./common.js');
const logger = Common.getLogger(__filename);
const eventLog = require('./eventLog.js');
const EV_CONST = eventLog.EV_CONST;

class LoginAttempts {
    constructor() {
        this.maxLoginAttempts = Common.hasOwnProperty("maxLoginAttempts") ? 
            Common.maxLoginAttempts : 3;
    }

    /**
     * Check and update login attempts for a user device
     * @param {Object} login Login object containing user details
     * @param {number} [currentAttempts] Current number of login attempts (optional)
     * @param {boolean} resetAttempts Whether to reset attempts to 0 (on successful login)
     * @returns {Object} Status object containing {exceeded: boolean, attempts: number}
     */
    async checkAndUpdateAttempts(login, currentAttempts = null, resetAttempts = false) {
        try {
            // If currentAttempts not provided, query it from database
            if (currentAttempts === null) {
                const result = await Common.db.UserDevices.findOne({
                    attributes: ['loginattempts'],
                    where: {
                        email: login.getEmail(),
                        imei: login.getDeviceID(),
                        maindomain: login.getMainDomain()
                    }
                });
                
                if (!result) {
                    throw new Error(`User device not found for email: ${login.getEmail()}, device: ${login.getDeviceID()}`);
                }
                
                currentAttempts = result.loginattempts || 0;
            }

            if (resetAttempts) {
                await Common.db.UserDevices.update(
                    { loginattempts: 0 },
                    {
                        where: {
                            email: login.getEmail(),
                            imei: login.getDeviceID(),
                            maindomain: login.getMainDomain()
                        }
                    }
                );
                return {
                    exceeded: false,
                    attempts: 0
                };
            }

            const newAttempts = currentAttempts + 1;
            await Common.db.UserDevices.update(
                { loginattempts: newAttempts },
                {
                    where: {
                        email: login.getEmail(),
                        imei: login.getDeviceID(),
                        maindomain: login.getMainDomain()
                    }
                }
            );

            const exceeded = this.maxLoginAttempts > 0 && newAttempts >= this.maxLoginAttempts;
            
            if (exceeded) {
                logger.error("Login attempts exceeded maximum allowed attempts");
                // Create event in Eventlog
                const extra_info = `Login attempts: ${newAttempts}, max login attempts: ${this.maxLoginAttempts}, device id: ${login.getDeviceID()}`;
                await eventLog.createEvent(
                    EV_CONST.EV_USER_LOCKED,
                    login.getEmail(),
                    login.getMainDomain(),
                    extra_info,
                    EV_CONST.WARN
                );
            }

            return {
                exceeded,
                attempts: newAttempts
            };

        } catch (err) {
            logger.error(`Error in checkAndUpdateAttempts: ${err}`, err);
            throw err;
        }
    }
}

module.exports = new LoginAttempts(); 