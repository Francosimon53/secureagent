const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const mobilePackagePath = path.resolve(__dirname, '../mobile');

/**
 * Metro configuration for SecureAgent Android
 * https://facebook.github.io/metro/docs/configuration
 */
const config = {
  watchFolders: [mobilePackagePath],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(mobilePackagePath, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
