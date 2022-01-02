

function get() {
    throw new Error("Enterprise module is not available");
}

function init(callback) {
    callback(new Error("Enterprise module is not available"));
}

function isPresent() {
    return false;
}


module.exports = {
    get,
    init,
    isPresent
}