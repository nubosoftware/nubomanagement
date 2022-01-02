var async = require('async');
var authFilters = require('./authFilters.js');
var logger = require('./common.js').logger;

function AuthFilterValidator(filters, excludeList, permittedMode) {
    if (!(this instanceof AuthFilterValidator)) {
        return new AuthFilterValidator(filters, excludeList, permittedMode);
    }

    this._filters = filters;
    this._excludeList = excludeList;
    this._permittedMode = permittedMode;
}

AuthFilterValidator.prototype.validate = function(req, callback) {

    var reqPath = req.path(req.url);

    var self = this;

    async.eachSeries(this._filters, function(filter, callback) {
        filterFunc = authFilters.getFilter(filter);

        if (filterFunc) {
            filterFunc(req, self._excludeList, function(err) {
                if (self._permittedMode) {
                    if(err){
                        logger.error("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$ AuthFilterValidator: " + err + ". path: " + req.url + " (permitted mode)");
                    }
                    callback(null);
                }
                else{
                    callback(err);
                }
            });

        } else {
            callback("unknown filter");
        }
    }, callback);
}

module.exports = AuthFilterValidator;