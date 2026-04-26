module.exports = function (api) {
  const isTest = api.env('test');
  api.cache.using(() => process.env.NODE_ENV);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          reanimated: !isTest,
        },
      ],
    ],
  };
};
