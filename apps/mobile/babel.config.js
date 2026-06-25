/**
 * Babel config for Expo SDK 52. `babel-preset-expo` already includes the
 * react-native preset, expo-router transforms, and reanimated where needed.
 * Keep this file empty of customisation until a real transform is required —
 * every plugin added here is a measurable Metro startup cost.
 */
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};

