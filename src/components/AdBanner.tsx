import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AdService from '../services/AdService';
import { AD_UNIT_IDS } from '../utils/constants';
export const AD_BANNER_HEIGHT = 78;

interface AdBannerProps {
  visible: boolean;
  onHidden: () => void;
  onUpgradePress: () => void;
  floating?: boolean;
}

export default function AdBanner({ visible, onHidden, onUpgradePress, floating = true }: AdBannerProps) {
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

  const handleHidePress = async () => {
    setLoading(true);
    try {
      await AdService.showRewardedAd();
      onHidden();
    } catch {
      // 激励视频失败或用户中途关闭，不隐藏 banner
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={[styles.container, floating ? { position: 'absolute', bottom: insets.bottom, left: 0, right: 0 } : styles.inline]}>
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.upgradeButton}
          onPress={onUpgradePress}
          disabled={loading}
          activeOpacity={0.75}
        >
          <Text style={styles.upgradeText}>⭐ 升级会员</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.hideButton}
          onPress={handleHidePress}
          disabled={loading}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {loading ? (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
          ) : (
            <Text style={styles.hideText}>×</Text>
          )}
        </TouchableOpacity>
      </View>
      <BannerAd
        unitId={AD_UNIT_IDS.BANNER}
        size={BannerAdSize.BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: AD_BANNER_HEIGHT,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  inline: {
    width: '100%',
  },
  actionBar: {
    width: '100%',
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  upgradeButton: {
    backgroundColor: '#D97706',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 3,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 3,
  },
  upgradeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  hideButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hideText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    lineHeight: 17,
    marginTop: -1,
  },
});
