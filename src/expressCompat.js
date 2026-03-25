"use strict";

var formidable = require('formidable');

/**
 * Setup Express app with legacy compatibility features.
 * Must be called before registering any middleware or routes.
 *
 * @param {Object} app - Express app instance
 * @param {Object} options - Options (name, etc.)
 */
function setup(app, options) {
    options = options || {};

    // app.name property (used in plugin.js and restserver.js logging)
    // Function.name is read-only by default, so we must redefine it
    Object.defineProperty(app, 'name', {
        value: options.name || 'express',
        writable: true,
        configurable: true
    });

    // Wrap route registration methods to return removable route references.
    // Legacy server's server.get/post/etc return a route object used by plugin.js
    // for later removal via server.rm(route). Express returns the app for chaining.
    var httpMethods = ['get', 'post', 'put', 'delete', 'head', 'patch', 'options'];
    httpMethods.forEach(function(method) {
        var original = app[method].bind(app);
        app[method] = function() {
            // app.get(setting) with 1 arg is a setting getter, not route registration
            if (method === 'get' && arguments.length === 1) {
                return original.apply(null, arguments);
            }

            var stackBefore = app._router ? app._router.stack.length : 0;
            original.apply(null, arguments);

            // Return a route reference that can be used with app.rm()
            if (app._router && app._router.stack.length > stackBefore) {
                var layer = app._router.stack[app._router.stack.length - 1];
                return { _layer: layer };
            }
            return app;
        };
    });

    // app.del() alias - legacy server uses .del() instead of .delete()
    app.del = app.delete;

    // app.rm(routeRef) - remove a previously registered route (used by plugin.js)
    app.rm = function(routeRef) {
        if (!routeRef || !routeRef._layer || !app._router) return;
        var idx = app._router.stack.indexOf(routeRef._layer);
        if (idx !== -1) {
            app._router.stack.splice(idx, 1);
        }
    };
}

/**
 * Middleware that polyfills legacy req/res behaviors.
 * Must be registered early (before other middleware that depends on these polyfills).
 */
function compatMiddleware(req, res, next) {
    // req.path() function polyfill
    // Legacy server: req.path(url) is a function that parses URL pathname
    // Express: req.path is a getter on the prototype, must use defineProperty to override
    var origPath = req.path;
    Object.defineProperty(req, 'path', {
        value: function(u) {
            if (u) return new URL(u, 'http://localhost').pathname;
            return origPath;
        },
        writable: true,
        configurable: true
    });

    // res.contentType property setter
    // 99 occurrences across 71 files use: res.contentType = 'json'
    Object.defineProperty(res, 'contentType', {
        set: function(type) { this.type(type); },
        get: function() { return this.get('Content-Type'); },
        configurable: true
    });

    // res.send(statusCode, body, headers) override
    // Legacy server allows res.send(code, body, headers), Express only allows res.send(body)
    var origSend = res.send.bind(res);
    res.send = function(first, second, third) {
        if (typeof first === 'number' && second !== undefined) {
            res.status(first);
            if (third && typeof third === 'object') res.set(third);
            return origSend(second);
        }
        return origSend(first);
    };

    next();
}

/**
 * Middleware that merges req.query and req.body into req.params.
 * Emulates legacy mapParams: true behavior for both queryParser and bodyParser.
 *
 * Uses a getter/setter on req.params because Express's router resets
 * req.params = layer.params for every matched layer. The setter captures
 * route params, and the getter dynamically merges query + body + files + route params.
 */
function mapParamsMiddleware(req, res, next) {
    var _routeParams = {};
    var _merged = {};
    var _dirty = true;

    function rebuild() {
        var keys = Object.keys(_merged);
        for (var i = 0; i < keys.length; i++) delete _merged[keys[i]];
        Object.assign(_merged, req.query || {});
        Object.assign(_merged, req.body || {});
        if (req.files) Object.assign(_merged, req.files);
        Object.assign(_merged, _routeParams); // route params take priority
        _dirty = false;
    }

    Object.defineProperty(req, 'params', {
        get: function() {
            if (_dirty) rebuild();
            return _merged;
        },
        set: function(val) {
            _routeParams = val || {};
            _dirty = true;
        },
        configurable: true
    });

    next();
}

/**
 * Middleware that merges only req.query into req.params.
 * For platform server where bodyParser has mapParams: false.
 */
function mapParamsQueryOnlyMiddleware(req, res, next) {
    var _routeParams = {};
    var _merged = {};
    var _dirty = true;

    function rebuild() {
        var keys = Object.keys(_merged);
        for (var i = 0; i < keys.length; i++) delete _merged[keys[i]];
        Object.assign(_merged, req.query || {});
        Object.assign(_merged, _routeParams);
        _dirty = false;
    }

    Object.defineProperty(req, 'params', {
        get: function() {
            if (_dirty) rebuild();
            return _merged;
        },
        set: function(val) {
            _routeParams = val || {};
            _dirty = true;
        },
        configurable: true
    });

    next();
}

/**
 * Create multipart form-data parsing middleware using formidable.
 * Replaces legacy multipart/form-data handling with mapFiles support.
 */
function createMultipartMiddleware(options) {
    options = options || {};
    return function multipartMiddleware(req, res, next) {
        var contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data')) {
            return next();
        }

        var form = new formidable.IncomingForm({
            uploadDir: options.uploadDir || require('os').tmpdir(),
            keepExtensions: options.keepExtensions || false,
            multiples: options.multiples !== undefined ? options.multiples : true,
            maxFileSize: options.maxFileSize || 200 * 1024 * 1024,
            hashAlgorithm: options.hashAlgorithm || false,
        });

        form.parse(req, function(err, fields, files) {
            if (err) {
                return next(err);
            }
            req.body = req.body || {};
            for (var key in fields) {
                var val = fields[key];
                // Flatten single-element arrays (formidable v2+ may return arrays)
                req.body[key] = Array.isArray(val) && val.length === 1 ? val[0] : val;
            }
            req.files = req.files || {};
            for (var key in files) {
                var val = files[key];
                req.files[key] = Array.isArray(val) && val.length === 1 ? val[0] : val;
            }
            next();
        });
    };
}

module.exports = {
    setup: setup,
    compatMiddleware: compatMiddleware,
    mapParamsMiddleware: mapParamsMiddleware,
    mapParamsQueryOnlyMiddleware: mapParamsQueryOnlyMiddleware,
    createMultipartMiddleware: createMultipartMiddleware
};
