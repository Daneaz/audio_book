import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AdService from '../services/AdService';
import { AD_UNIT_IDS } from '../utils/constants';
export const AD_BANNER_HEIGHT = 50;

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
      <BannerAd
        unitId={AD_UNIT_IDS.BANNER}
        size={BannerAdSize.BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
      />
      <TouchableOpacity
        style={styles.upgradeButton}
        onPress={onUpgradePress}
        disabled={loading}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.upgradeText}>升级会员</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.hideButton}
        onPress={handleHidePress}
        disabled={loading}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.hideText}>隐藏</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: AD_BANNER_HEIGHT,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inline: {
    width: '100%',
  },
  hideButton: {
    position: 'absolute',
    top: 4,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  hideText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
  upgradeButton: {
    position: 'absolute',
    top: 4,
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  upgradeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
});
