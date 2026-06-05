import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, useColorScheme, Alert, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import useMembership from '../hooks/useMembership';
import MembershipService, { AvailablePackage } from '../services/MembershipService';
import useI18n from '../i18n';

export default function MembershipScreen({ navigation }: any) {
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [packages, setPackages] = useState<AvailablePackage[]>([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(true);
  const { purchase, restore, isLoading, isTrial, expiresAt } = useMembership();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t, language } = useI18n();

  const legalBaseUrl = `https://daneaz.github.io/audio_book/?lang=${language}`;
  const privacyUrl = `${legalBaseUrl}#p1`;
  const termsUrl = `${legalBaseUrl}#s1`;

  useEffect(() => {
    MembershipService.getAvailablePackages()
      .then(pkgs => {
        console.log('Available packages:', pkgs);
        setPackages(pkgs);
        const preferred = pkgs.find(p => p.packageType === 'ANNUAL') ?? pkgs[0];
        if (preferred) setSelectedPlan(preferred.productId);
      })
      .catch(e => console.error('[MembershipScreen] getAvailablePackages failed:', e))
      .finally(() => setIsLoadingPackages(false));
  }, []);

  function planLabel(pkg: AvailablePackage): string {
    switch (pkg.packageType) {
      case 'MONTHLY':  return t('membership.planMonthlyLabel');
      case 'THREE_MONTH':  return t('membership.planQuarterlyLabel');
      case 'ANNUAL':   return t('membership.planYearlyLabel');
      case 'LIFETIME': return t('membership.planLifetimeLabel');
      default:         return pkg.productId;
    }
  }

  function planSublabelText(pkg: AvailablePackage): string {
    let base: string;
    switch (pkg.packageType) {
      case 'MONTHLY':  base = t('membership.planMonthlySub'); break;
      case 'THREE_MONTH':  base = t('membership.planQuarterlySub'); break;
      case 'ANNUAL':   base = t('membership.planYearlySub'); break;
      case 'LIFETIME': base = t('membership.planLifetimeSub'); break;
      default:         base = '';
    }
    return pkg.hasIntroOffer ? `${base}  ·  ${t('membership.trialBadge')}` : base;
  }

  function formatPrice(price: number, currencyCode: string): string {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(price);
    } catch {
      return `${price} ${currencyCode}`;
    }
  }

  function planPrice(pkg: AvailablePackage): string {
    const formatted = formatPrice(pkg.price, pkg.currencyCode);
    switch (pkg.packageType) {
      case 'MONTHLY': return formatted + t('membership.perMonth');
      case 'THREE_MONTH': return formatted + t('membership.perQuarter');
      case 'ANNUAL':  return formatted + t('membership.perYear');
      case 'LIFETIME': return formatted;
      default:        return formatted;
    }
  }

  const selectedPackage = packages.find(p => p.productId === selectedPlan);

  const trialDaysLeft = isTrial && expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000))
    : 0;

  const isTrialEligible = selectedPackage?.hasIntroOffer ?? false;

  function buttonLabel(): string {
    if (isTrial) return t('membership.manageSubscription');
    if (isTrialEligible) return t('membership.freeTrial');
    return t('membership.buyNow');
  }

  const BENEFITS = [t('membership.benefitNoAds'), t('membership.benefitVoices')];

  const colors = {
    bg:      isDark ? '#0E0C0A' : '#FAF7F0',
    surface: isDark ? '#1C1916' : '#F3ECE0',
    border:  isDark ? '#2A2520' : '#E0D4C0',
    accent:  isDark ? '#C4A96A' : '#A0621A',
    text:    isDark ? '#E8E0D0' : '#2C1A0E',
    subText: isDark ? '#6A5A44' : '#9A7A5A',
    trial:   '#B8860B',
  };

  const handlePurchase = async () => {
    if (isTrial) {
      Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() => {});
      return;
    }
    try {
      await purchase(selectedPlan);
      navigation.goBack();
    } catch (e: any) {
      if (!e?.userCancelled && !e?.message?.toLowerCase().includes('cancel')) {
        Alert.alert(t('membership.purchaseFailed'), e?.message ?? t('membership.purchaseFailedMsg'));
      }
    }
  };

  const handleRestore = async () => {
    try {
      await restore();
      Alert.alert(t('membership.restoreSuccess'), t('membership.restoreSuccessMsg'), [
        { text: t('common.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert(t('membership.restoreFailed'), e?.message ?? t('membership.restoreFailedMsg'));
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('membership.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isTrial && (
          <View testID="trial-banner" style={[styles.trialBanner, { borderColor: colors.trial }]}>
            <Ionicons name="time-outline" size={16} color={colors.trial} />
            <Text style={[styles.trialBannerText, { color: colors.trial }]}>
              {t('membership.trialActive', { days: trialDaysLeft })}
            </Text>
          </View>
        )}

        <View style={[styles.benefitsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('membership.benefits')}</Text>
          {BENEFITS.map((benefit, i) => (
            <View key={i} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
              <Text style={[styles.benefitText, { color: colors.text }]}>{benefit}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24, marginBottom: 12 }]}>{t('membership.choosePlan')}</Text>
        {isLoadingPackages
          ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
          : packages.map(pkg => {
            const isSelected = selectedPlan === pkg.productId;
            return (
              <TouchableOpacity
                key={pkg.productId}
                style={[
                  styles.planCard,
                  { backgroundColor: colors.surface, borderColor: isSelected ? colors.accent : colors.border },
                ]}
                onPress={() => setSelectedPlan(pkg.productId)}
              >
                <View style={styles.planInfo}>
                  <Text style={[styles.planLabel, { color: colors.text }]}>{planLabel(pkg)}</Text>
                  <Text style={[styles.planSublabel, { color: colors.subText }]}>{planSublabelText(pkg)}</Text>
                </View>
                <Text style={[styles.planPrice, { color: colors.accent }]}>{planPrice(pkg)}</Text>
                {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.accent} style={styles.planCheck} />}
              </TouchableOpacity>
            );
          })
        }
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.purchaseButton, { backgroundColor: colors.accent }, isLoading && styles.disabled]}
          onPress={handlePurchase}
          disabled={isLoading}
        >
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.purchaseButtonText}>{buttonLabel()}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={handleRestore} disabled={isLoading} style={styles.restoreButton}>
          <Text style={[styles.restoreText, { color: colors.subText }]}>{t('membership.restore')}</Text>
        </TouchableOpacity>

        <Text style={[styles.autoRenewText, { color: colors.subText }]}>
          {t('membership.autoRenewNotice')}
        </Text>

        <View style={styles.legalLinks}>
          <TouchableOpacity onPress={() => Linking.openURL(termsUrl).catch(() => {})} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.legalLinkText, { color: colors.subText }]}>{t('membership.termsOfUse')}</Text>
          </TouchableOpacity>
          <Text style={[styles.legalLinkSep, { color: colors.subText }]}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL(privacyUrl).catch(() => {})} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.legalLinkText, { color: colors.subText }]}>{t('membership.privacyPolicy')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17, fontWeight: '600' },
  content: { padding: 20, paddingBottom: 8 },
  trialBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 16, backgroundColor: 'rgba(184,134,11,0.08)',
  },
  trialBannerText: { fontSize: 13, fontWeight: '500' },
  benefitsCard: { borderRadius: 12, padding: 16, borderWidth: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 10 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  benefitText: { fontSize: 14, marginLeft: 8 },
  planCard: {
    borderRadius: 12, padding: 16, borderWidth: 1.5,
    flexDirection: 'row', alignItems: 'center', marginBottom: 12,
  },
  planInfo: { flex: 1 },
  planLabel: { fontSize: 15, fontWeight: '600' },
  planSublabel: { fontSize: 12, marginTop: 2 },
  planPrice: { fontSize: 14, fontWeight: '600' },
  planCheck: { marginLeft: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  purchaseButton: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  purchaseButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  restoreButton: { alignItems: 'center', paddingVertical: 12 },
  restoreText: { fontSize: 13 },
  autoRenewText: { fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 8, marginTop: 4 },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  legalLinkText: { fontSize: 12, textDecorationLine: 'underline' },
  legalLinkSep: { fontSize: 12, marginHorizontal: 8 },
});
