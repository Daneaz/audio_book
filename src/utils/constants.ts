import { Platform } from "react-native";

export const STORAGE_KEYS = {
  BOOKS: '@audio_book_books',
  CHAPTERS_PREFIX: '@audio_book_chapters_',
  READING_PROGRESS_PREFIX: '@audio_book_progress_',
  USER_SETTINGS: '@audio_book_settings',
  MEMBERSHIP: '@audio_book_membership',
  AD_STATE: '@audio_book_ad_state',
};

export const AD_UNIT_IDS = {
  BANNER: Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_AD_BANNER_IOS ?? ""
    : process.env.EXPO_PUBLIC_AD_BANNER_ANDROID ?? "",
  REWARDED: Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_AD_REWARDED_IOS ?? ""
    : process.env.EXPO_PUBLIC_AD_REWARDED_ANDROID ?? "",
};

export const REVENUECAT_API_KEYS = {
  IOS: process.env.EXPO_PUBLIC_REVENUECAT_IOS,
  ANDROID: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID
};

export const MEMBERSHIP_PRODUCT_IDS = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
  LIFETIME: 'lifetime',
};

export const MEMBERSHIP_ENTITLEMENT = 'InkVoice Pro';

export const XFYUN_KEYS = {
    APP_ID: process.env.EXPO_PUBLIC_XFYUN_APP_ID ?? 'MOCK_APPID',                                        
    API_KEY: process.env.EXPO_PUBLIC_XFYUN_API_KEY ?? 'MOCK_API_KEY',                                  
    API_SECRET: process.env.EXPO_PUBLIC_XFYUN_API_SECRET ?? 'MOCK_API_SECRET',     
};
