import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, useColorScheme, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import useMembership from '../hooks/useMembership';
import { MEMBERSHIP_PRODUCT_IDS } from '../utils/constants';
import useI18n from '../i18n';

type PlanId = typeof MEMBERSHIP_PRODUCT_IDS[keyof typeof MEMBERSHIP_PRODUCT_IDS];

export default function MembershipScreen({ navigation }: any) {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(MEMBERSHIP_PRODUCT_IDS.YEARLY);
  const { purchase, restore, isLoading } = useMembership();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useI18n();

  const PLANS: { id: PlanId; label: string; sublabel: string; price: string }[] = [
    { id: MEMBERSHIP_PRODUCT_IDS.MONTHLY, label: t('membership.planMonthlyLabel'), sublabel: t('membership.planMonthlySub'), price: t('membership.planMonthlyPrice') },
    { id: MEMBERSHIP_PRODUCT_IDS.YEARLY, label: t('membership.planYearlyLabel'), sublabel: t('membership.planYearlySub'), price: t('membership.planYearlyPrice') },
    { id: MEMBERSHIP_PRODUCT_IDS.LIFETIME, label: t('membership.planLifetimeLabel'), sublabel: t('membership.planLifetimeSub'), price: t('membership.planLifetimePrice') },
  ];

  const BENEFITS = [t('membership.benefitNoAds'), t('membership.benefitMoreSoon')];

  const colors = {
    bg:      isDark ? '#0E0C0A' : '#FAF7F0',
    surface: isDark ? '#1C1916' : '#F3ECE0',
    border:  isDark ? '#2A2520' : '#E0D4C0',
    accent:  isDark ? '#C4A96A' : '#A0621A',
    text:    isDark ? '#E8E0D0' : '#2C1A0E',
    subText: isDark ? '#6A5A44' : '#9A7A5A',
  };

  const handlePurchase = async () => {
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
        {PLANS.map(plan => {
          const isSelected = selectedPlan === plan.id;
          return (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planCard,
                { backgroundColor: colors.surface, borderColor: isSelected ? colors.accent : colors.border },
              ]}
              onPress={() => setSelectedPlan(plan.id)}
            >
              <View style={styles.planInfo}>
                <Text style={[styles.planLabel, { color: colors.text }]}>{plan.label}</Text>
                <Text style={[styles.planSublabel, { color: colors.subText }]}>{plan.sublabel}</Text>
              </View>
              <Text style={[styles.planPrice, { color: colors.accent }]}>{plan.price}</Text>
              {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.accent} style={styles.planCheck} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.purchaseButton, { backgroundColor: colors.accent }, isLoading && styles.disabled]}
          onPress={handlePurchase}
          disabled={isLoading}
        >
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.purchaseButtonText}>{t('membership.subscribe')}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={handleRestore} disabled={isLoading} style={styles.restoreButton}>
          <Text style={[styles.restoreText, { color: colors.subText }]}>{t('membership.restore')}</Text>
        </TouchableOpacity>
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
});
