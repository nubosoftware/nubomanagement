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

    getMaxLoginAttempts() {
        return this.maxLoginAttempts;
    }

    checkIfloginAttemptsExceeded(currentAttempts,adminSecurityConfig) {
        let maxAttempts = adminSecurityConfig ? adminSecurityConfig.maxLoginAttempts : this.maxLoginAttempts;
        // logger.info(`checkIfloginAttemptsExceeded: currentAttempts: ${currentAttempts}, maxAttempts: ${maxAttempts}, isAdminSecurityConfig: ${adminSecurityConfig !== undefined}`);
        return maxAttempts > 0 && currentAttempts >= maxAttempts;
    }

    /**
     * Check and update login attempts for a user device
     * @param {Object|string} loginOrEmail Login object containing user details or email string
     * @param {string} [deviceId] Device ID (required if email is provided directly)
     * @param {string} [mainDomain] Main domain (required if email is provided directly)
     * @param {number} [currentAttempts] Current number of login attempts (optional)
     * @param {boolean} resetAttempts Whether to reset attempts to 0 (on successful login)
     * @returns {Object} Status object containing {exceeded: boolean, attempts: number}
     */
    async checkAndUpdateAttempts(loginOrEmail, deviceId, mainDomain, currentAttempts = null, resetAttempts = false,adminSecurityConfig = null) {
        try {
            // Extract parameters based on whether a login object or direct parameters were provided
            let email, imei, domain;
            
            if (typeof loginOrEmail === 'object' && loginOrEmail !== null) {
                // Login object provided
                email = loginOrEmail.getEmail();
                imei = loginOrEmail.getDeviceID();
                domain = loginOrEmail.getMainDomain();
            } else {
                // Direct parameters provided
                email = loginOrEmail;
                imei = deviceId;
                domain = mainDomain;
            }

            // Validate required parameters
            if (!email || !imei || !domain) {
                throw new Error('Missing required parameters: email, deviceId, and mainDomain are required');
            }

            // If currentAttempts not provided, query it from database
            if (currentAttempts === null) {
                const result = await Common.db.UserDevices.findOne({
                    attributes: ['loginattempts'],
                    where: {
                        email: email,
                        imei: imei,
                    }
                });
                
                if (!result) {
                    throw new Error(`User device not found for email: ${email}, device: ${imei}`);
                }
                
                currentAttempts = result.loginattempts || 0;
            }

            if (resetAttempts) {
                await Common.db.UserDevices.update(
                    { loginattempts: 0 },
                    {
                        where: {
                            email: email,
                            imei: imei,
                            maindomain: domain
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
                        email: email,
                        imei: imei,
                        maindomain: domain
                    }
                }
            );

            const exceeded = this.checkIfloginAttemptsExceeded(newAttempts,adminSecurityConfig);
            
            if (exceeded) {
                logger.error("Login attempts exceeded maximum allowed attempts");
                // Create event in Eventlog
                const extra_info = `Login attempts: ${newAttempts}, max login attempts: ${this.maxLoginAttempts}, device id: ${imei}`;
                await eventLog.createEvent(
                    EV_CONST.EV_USER_LOCKED,
                    email,
                    domain,
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