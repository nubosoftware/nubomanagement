

/**
 * desktopModuleLoader
 * Dynamically load desktop module code.
 */

function get() {
    throw new Error("Desktop module is not available");
}

function init(callback) {
    throw new Error("Desktop module is not available");
}

function isPresent() {
    return false;
}


module.exports = {
    get,
    init,
    isPresent
}
