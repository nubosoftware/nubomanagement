// componentVersions.js

const { QueryTypes, Op } = require('sequelize');
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

    /**
     * Removes the records of a component whose index is not in validIndexes (the indexes currently
     * registered in redis). Catches records orphaned when their redis registration disappeared
     * without a clean unregister (redis restart/flush, expiry missed while management was down).
     * Records updated during the last graceMs are kept, so a registration in progress is not removed.
     * @param {string} componentName - The name of the component.
     * @param {Array<number|string>} validIndexes - The indexes that are currently registered.
     * @param {number} [graceMs=60000] - Keep records updated within this window.
     * @returns {Promise<{success: boolean, deleted?: number, error?: any}>} The result of the operation.
     */
    async maintainVersions(componentName, validIndexes, graceMs = 60000) {
        try {
            const where = {
                componentName,
                updatedAt: {
                    [Op.lt]: new Date(Date.now() - graceMs)
                }
            };
            const indexes = (validIndexes || []).map(Number).filter(Number.isInteger);
            if (indexes.length > 0) {
                where.componentIndex = {
                    [Op.notIn]: indexes
                };
            }
            const deleted = await Common.db.ComponentVersions.destroy({ where });
            if (deleted > 0) {
                logger.info(`ComponentVersionManager. maintainVersions: removed ${deleted} stale ${componentName} record(s)`);
            }
            return { success: true, deleted };
        } catch (error) {
            logger.info(`ComponentVersionManager. maintainVersions: error: ${error}`);
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

            // read mysql version by running a query
            const mysqlVersion = await Common.sequelize.query("SELECT VERSION() as version", { type: QueryTypes.SELECT });
            if (mysqlVersion && mysqlVersion.length > 0) {
                const mysqlRow = {
                    componentName: "mysql",
                    componentIndex: 1,
                    version: mysqlVersion[0].version,
                    buildTime: null
                }
                results.push(mysqlRow);
            }

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