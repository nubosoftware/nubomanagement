"use strict";

/**
 * A generic exception thrown when API process cannot continue.
 * The exception status and message should be returened to the caller
 */
 class APIException extends Error {
    /**
     * Creates a new ActivateException with the given message and status.
     *
     * @param message A human readable description of the issue that
     *                occurred.
     * @param status Status code to return to caller.
     */
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

/**
 * An exception thrown when activate process needs to redirect user to another
 * data center
 */
class RedirectException extends Error {
    /**
     * Creates a new redirect exception with the given message and redirect url.
     *
     * @param message A human readable description of the issue that
     *                occurred.
     * @param mgmtURL The new location.
     */
    constructor(message, mgmtURL) {
        super(message);
        this.status = Common.STATUS_CHANGE_URL;
        this.mgmtURL = mgmtURL;
    }
}

module.exports = {
    APIException,
    RedirectException
}