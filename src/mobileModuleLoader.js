/**
 * mobileModuleLoaded
 * Dynamically load mobile module code.
 */
        
 
function get() {
    throw new Error("Mobile module is not available");
}

function init() {
    throw new Error("Mobile module is not available");
}

function isPresent() {
    return false;
}

module.exports = {
    get,
    init,
    isPresent
}