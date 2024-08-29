import type { Configuration } from 'webpack';
const ExtensionReloader = require('webpack-ext-reloader');
const SetDevManifestPlugin = require('./set-dev-manifest-plugin');
const config = require('./custom-webpack.config');

module.exports = {
  ...config,
  mode: 'development',
  plugins: [
    ...config.plugins,
    new ExtensionReloader({
      reloadPage: true, // Force the reload of the page also
      entries: {
        // The entries used for the content/background scripts or extension pages
        background: 'background',
      },
    }),
    new SetDevManifestPlugin(),
  ],
} as Configuration;
