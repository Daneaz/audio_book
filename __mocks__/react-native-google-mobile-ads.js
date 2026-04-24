const TestIds = {
  BANNER: 'ca-app-pub-3940256099942544/2934735716',
  REWARDED: 'ca-app-pub-3940256099942544/5224354917',
};

module.exports = {
  TestIds,
  BannerAd: 'BannerAd',
  BannerAdSize: { BANNER: 'BANNER' },
  RewardedAd: { createForAdRequest: jest.fn() },
  RewardedAdEventType: { LOADED: 'rewarded_loaded', EARNED_REWARD: 'rewarded_earned_reward' },
  AdEventType: { ERROR: 'error', CLOSED: 'closed' },
};
