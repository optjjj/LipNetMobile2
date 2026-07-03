module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [





      // Add this if you are explicitly using react-native-worklets-core
      ['react-native-worklets/plugin', {}, 'worklets-custom-name']
    ],
  };
};