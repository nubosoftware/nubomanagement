module.exports = {
    require,
    unrequire: function (moduleName) {
        console.log(`deleteModule: ${moduleName}`);
        delete require.cache[require.resolve(moduleName)];
    }
}