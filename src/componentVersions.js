// componentVersions.js

var Common = require('./common.js');
var logger = Common.getLogger(__filename);

/**
 * Manages component versions within the application.
 */
class ComponentVersionManager {
    constructor() {
        if (!ComponentVersionManager.instance) {
            ComponentVersionManager.instance = this;
        }
        return ComponentVersionManager.instance;
    }

    /**
     * Adds or updates a component version in the database.
     * @param {string} componentName - The name of the component.
     * @param {number} componentIndex - The index of the component.
     * @param {string} version - The version of the component.
     * @param {Date} buildTime - The build time of the component.
     * @returns {Promise<{success: boolean, error?: any}>} The result of the operation.
     */
    async addVersion(componentName, componentIndex, version, buildTime) {
        try {
            await Common.db.ComponentVersions.upsert({
                componentName,
                componentIndex,
                version,
                buildTime
            });
            return { success: true };
        } catch (error) {
            logger.info(`ComponentVersionManager. addVersion: error: ${error}`);
            return { success: false, error };
        }
    }

    /**
     * Removes a component record from the database.
     * @param {string} componentName - The name of the component.
     * @param {number} componentIndex - The index of the component.
     * @returns {Promise<{success: boolean}>} The result of the operation.
     */
    async removeRecord(componentName, componentIndex) {
        try {
            const result = await Common.db.ComponentVersions.destroy({
                where: {
                    componentName,
                    componentIndex
                }
            });
            return { success: result > 0 };
        } catch (error) {
            logger.info(`ComponentVersionManager. removeRecord: error: ${error}`);
            return { success: false, error };
        }
    }

    async maintainVersions(componentName, validIndexes) {
        try {
            const result = await Common.db.ComponentVersions.destroy({
                where: {
                    componentName,
                    componentIndex: {
                        [Sequelize.Op.notIn]: validIndexes
                    }
                }
            });
            return { success: true, deleted: result };
        } catch (error) {
            return { success: false, error };
        }
    }

    async getVersions(req,res) {
        try {
            let adminLogin = req.nubodata.adminLogin;
            if (!adminLogin) {
                res.writeHead(403, {
                    "Content-Type": "text/plain"
                });
                res.end("403 Forbidden\n");
                return;
            }
            // read all version from the database
            const results = await Common.db.ComponentVersions.findAll();
            // logger.info(`getRecordings. result: ${JSON.stringify(result,null,2)}`);
            res.send({
                status: 1,
                message: "Request was fulfilled",
                results: results,
            });


    } catch (err) {
        logger.error("getVersions: " + err, err);
        res.send({
            status: "0",
            message: (err.message ? err.message : err)
        });
    }
    }
}

const instance = new ComponentVersionManager();
Object.freeze(instance);

module.exports = instance;