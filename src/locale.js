"use strict";

const Common = require('./common.js');
const util = require('util');
const logger = Common.getLogger(__filename);
const path = require('path');

const DEFAULT_LOCALE = "en";

class Locale {
    constructor() {
        this.cacheLocales = {};
        this.localesDir = path.join(Common.rootDir,'locales');
        this.format = function(valueid, ...args) {
            //logger.info(`format. valueid: ${valueid}, args: ${args}`);
            let str = this.getValue(valueid);
            if (str) {
                let formatArgs = [str].concat(args);
                let result =  util.format.apply(this, formatArgs);
                 //util.format(str,args);
                //logger.info(`format. result: ${result}`);
                return result;
            } else {
                return "";
            }
        };

        this.getValue = function(valueid, localestr) {
            if (!localestr) {
                localestr = Common.defaultLocale;
            }
            //logger.info(`Locale.getValue. valueid: ${valueid} , localestr:${localestr}`);
            let localestrLocal = localestr;
            while (true) {
                //logger.info(`Checking locale ${localestrLocal}`);
                let locale = this.cacheLocales[localestrLocal];
                if (locale == null) {
                    try {
                        let file = path.join(this.localesDir,`${localestrLocal}.js`);
                        //logger.info(`Loading locale at ${file}`);
                        locale = require(file);
                        if (locale != null) {
                            this.cacheLocales[localestrLocal] = locale;
                        } else {
                            logger.info(`Locale file not found ${file}`);
                        }
                    } catch (error) {
                        //console.error(error);
                        locale = null;
                    }
                }
                if (locale != null) {
                    let result = locale[valueid];
                    if (result != null) {
                        //logger.info(`Value of ${valueid} in locale ${localestrLocal}: ${locale[valueid]}`);
                        if (localestrLocal != localestr) {
                            if (this.cacheLocales[localestr]) {
                                this.cacheLocales[localestr][valueid] = result;
                            } else {
                                this.cacheLocales[localestr] = locale;
                            }
                        }
                        return result;
                    } else if (localestrLocal == DEFAULT_LOCALE) {
                        logger.info(`Locale. Error: value for key ${valueid} not found`);
                        return null;
                    }
                }
                let ind = localestrLocal.lastIndexOf("_");
                if (ind > 0) {
                    localestrLocal = localestrLocal.substring(0, ind);
                } else {
                    if (localestrLocal == DEFAULT_LOCALE) {
                        let file = path.join(this.localesDir,`${localestrLocal}.js`);
                        logger.error(`Locale. Error: default locale file (${file}) not found! key`);
                        return null;
                    }
                    localestrLocal = DEFAULT_LOCALE;
                }
            }
        };
    }
}

let locale = new Locale();

module.exports = {
    locale: locale
};