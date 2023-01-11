const path = require('path')
const webpack = require('webpack')
const nodeExternals = require('webpack-node-externals')
var WebpackObfuscator = require('webpack-obfuscator');
const externalsFunc = nodeExternals();

class IgnoreDynamicRequire {
  apply (compiler) {
    compiler.hooks.normalModuleFactory.tap('IgnoreDynamicRequire', factory => {
      factory.hooks.parser.for('javascript/auto').tap('IgnoreDynamicRequire', (parser, options) => {
        parser.hooks.call.for('require').tap('IgnoreDynamicRequire', expression => {
          // This is a SyncBailHook, so returning anything stops the parser, and nothing allows to continue
          if (expression.arguments.length !== 1 || expression.arguments[0].type === 'Literal') {
            return
          }
          const arg = parser.evaluateExpression(expression.arguments[0])
          if (!arg.isString() && !arg.isConditional()) {
              if (arg.prefix && arg.prefix.string == "./platform_") {
                //console.log(`arg.isString(): ${arg.isString()}, arg.isConditional(): ${arg.isConditional()}, expression.arguments[0]: ${JSON.stringify(expression.arguments[0],null,2)}, arg: ${JSON.stringify(arg,null,2)}`);
                console.log(`disable IgnoreDynamicRequire for "./platform_*.js" require`);
                return;
              }

            return true;
          }
        });
      });
    });
  }
}


//const HtmlWebPackPlugin = require("html-webpack-plugin")
module.exports = {
  mode: 'production',
  entry: {
    multithreadserver: './src/multithreadserver.js',
    daemon: './src/daemon.js',
    restserver: './src/restserver.js',
    upgrade: './src/upgrade.js',
    nuboConfig: './src/nuboConfig.js',
    createAdmin: './src/createAdmin.js',
    'scripts/installNuboApps': './src/scripts/installNuboApps.js',
    'scripts/testLoginLogout': './src/scripts/testLoginLogout.js',
    'scripts/killPlatform': './src/scripts/killPlatform.js',
    'scripts/killSession': './src/scripts/killSession.js',
    'scripts/registerPlatform': './src/scripts/registerPlatform.js',

    readRedisSubscribeMsgs: './src/readRedisSubscribeMsgs.js',
    readOnlineJournal: './src/readOnlineJournal.js',
    moduleExec: './src/moduleExec.js',
    'unittests/createNewUserTarGz': './src/unittests/createNewUserTarGz.js',
    'unittests/deleteUserDevice': './src/unittests/deleteUserDevice.js',
    'unittests/installApks': './src/unittests/installApks.js',
    'unittests/sendEmail': './src/unittests/sendEmail.js',
    'unittests/updateDeviceTelephonySettings': './src/unittests/updateDeviceTelephonySettings.js',

  },
  output: {
    path: path.join(__dirname, 'dist'),
    publicPath: '/',
    filename: '[name].js'
  },
  target: 'node',
  externals: [
    function ({ context, request }, callback) {
      // include nubo-management modules with the project
      if (/^nubo-management-/.test(request)) {
        callback();
        return;
      }
      if (/^\.\.\/scripts\/originalRequire$/.test(request)) {
        console.log(` externals commonjs request: ${request}`);
        return callback(null, 'commonjs ' + request);
      }
      externalsFunc(context,request,callback);
    },
  ], // Need this to avoid error when working with Express
  optimization: {
    splitChunks: {
      chunks: 'all',
    },
  },
  module: {

    rules: [
      {
        // Transpiles ES6-8 into ES5
        test: /\.js$/,
        exclude: [
            /node_modules/,
            /JsSIP/,
            path.resolve(__dirname, 'common.js'),
            path.resolve(__dirname, "node_modules")
        ],
        /*use: {
          loader: "babel-loader"
        }*/
        enforce: 'post',
        use: {
            loader: WebpackObfuscator.loader,
            options: {
                rotateStringArray: true
            }
        }
      },
      { test: /\.pl$/, loader: 'ignore-loader' },
      { test: /\.xml$/, loader: 'ignore-loader' },
      { test: /\.txt$/, loader: 'ignore-loader' },
      { test: /\.sh$/, loader: 'ignore-loader' },
      { test: /\.md$/, loader: 'ignore-loader' },
      { test: /\.pegjs$/, loader: 'ignore-loader' },
      { test: /LICENSE$/, loader: 'ignore-loader' },
      { test: /\.jar$/, loader: 'ignore-loader' },
      //
      /*{
        // Loads the javacript into html template provided.
        // Entry point is set below in HtmlWebPackPlugin in Plugins
        test: /\.html$/,
        use: [{loader: "html-loader"}]
      }*/
    ]
  },
  plugins: [
    new IgnoreDynamicRequire()
  ],
  /*plugins: [
    new WebpackObfuscator ({
        rotateStringArray: true
    }, ['excluded_bundle_name.js'])
  ]*/

  /*plugins: [
    new HtmlWebPackPlugin({
      template: "./index.html",
      filename: "./index.html",
      excludeChunks: [ 'server' ]
    })
  ]*/
}
