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
    ? 'ca-app-pub-3842092557707512/8003628031"'
    : 'ca-app-pub-3842092557707512/7052886321',
  REWARDED: Platform.OS === 'ios'
    ? 'ca-app-pub-3842092557707512/8347242968'
    : 'ca-app-pub-3842092557707512/4426722985',
};
