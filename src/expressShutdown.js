"use strict";

const REQUEST_TIMEOUT = 60000;
const WAIT_ON_SHUTDOWN = 30000;

/**
 * Express graceful shutdown handler.
 * Replaces legacy shutdown helper.
 *
 * Tracks open sockets and gracefully closes connections on shutdown.
 * The req.path() polyfill from expressCompat must be registered before this
 * module's middleware runs.
 *
 * @param {Object} options - Options object with logger
 * @param {Object} httpServer - http.Server or https.Server instance
 * @param {Object} app - Express app instance
 */
function shutdown(options, httpServer, app) {
    var sockets = {};
    var inShutdown = false;
    var logger;

    if (!httpServer) {
        httpServer = options;
        options = {};
    }

    if (options && options.logger) {
        logger = options.logger;
    }

    // Track all sockets on the http server
    httpServer.on('connection', function(socket) {
        var key = socket.remoteAddress + ':' + socket.remotePort;

        sockets[key] = {
            socket: socket,
            handled: false,
            routed: false,
            path: "",
            createTime: Date.now()
        };

        socket.on('close', function() {
            delete sockets[key];
        });
    });

    // Middleware to track request handling (replaces legacy pre-handler)
    app.use(function shutdownTracker(req, res, next) {
        var key = req.connection.remoteAddress + ':' + req.connection.remotePort;
        if (sockets[key]) {
            sockets[key].handled = false;
            sockets[key].routed = true;
            sockets[key].path = req.path(req.url);
            sockets[key].routeTime = Date.now();
        }
        req.setTimeout(REQUEST_TIMEOUT);

        res.on('finish', function() {
            if (sockets[key]) {
                sockets[key].handled = true;
                sockets[key].routed = true;
                if (inShutdown) {
                    closeConnections();
                }
            }
        });

        res.on('close', function() {
            if (sockets[key]) {
                sockets[key].handled = true;
                sockets[key].routed = true;
                if (inShutdown) {
                    closeConnections();
                }
            }
        });

        next();
    });

    // Override httpServer.close() for graceful shutdown
    var origClose = httpServer.close;
    httpServer.close = function() {
        if (logger) logger.info("expressShutdown: closing server ...");
        origClose.apply(httpServer, arguments);
        inShutdown = true;
        closeConnections();
    };

    function closeConnections() {
        for (var key in sockets) {
            if (sockets[key].handled === true) {
                sockets[key].socket.destroy();
                delete sockets[key];
            } else if (sockets[key].routed === true) {
                var elapsed = Date.now() - sockets[key].routeTime;
                if (elapsed < WAIT_ON_SHUTDOWN) {
                    if (logger) logger.info("expressShutdown: waiting for " + key + " " + sockets[key].path);
                } else {
                    if (logger) logger.info("expressShutdown: killing connection after more than " + (WAIT_ON_SHUTDOWN / 1000) + " seconds: " + key + " " + sockets[key].path);
                    sockets[key].socket.destroy();
                    delete sockets[key];
                }
            } else {
                sockets[key].socket.destroy();
                delete sockets[key];
            }
        }

        if (Object.keys(sockets).length > 0) {
            setTimeout(function() {
                closeConnections();
            }, 3000);
        } else {
            if (logger) logger.info("expressShutdown: All connections closed");
        }
    }
}

module.exports = shutdown;
