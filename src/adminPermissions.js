"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);

class AdminPermissions {

    constructor (json) {
        this.perms = {}; // empty
        if (json) {
            try {
                this.perms = JSON.parse(json);
            } catch (err) {
                logger.error(`Error parsing permission json: ${json}`,err);
            }
        }
    }

    getJSON() {
        return JSON.stringify(this.perms);
    }

    /**
     *
     * @param {*} perm
     * @param {*} accessType  ("r" or "rw")
     */
    checkPermission(perm,accessType) {
        let perms = this.perms;
        let hasPerm = false;
        let v = (perms["@/"] ? perms["@/"] : perms["/"]);
        if (perm != "@/" && v && (v == "rw")) {
            // admin return all true
            hasPerm = true;
        } else {
            // check specific permission for non admins
            v = perms[perm];
            if (v && (v.includes(accessType) || v == "rw")) {
                hasPerm = true;
            }

        }
        //console.log(`checkPermission ${perm},${accessType}: ${hasPerm}`);
        return hasPerm;
    }
}

module.exports = AdminPermissions;

