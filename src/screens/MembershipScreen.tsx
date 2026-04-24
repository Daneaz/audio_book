import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, useColorScheme, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import useMembership from '../hooks/useMembership';
import { MEMBERSHIP_PRODUCT_IDS } from '../utils/constants';

type PlanId = typeof MEMBERSHIP_PRODUCT_IDS[keyof typeof MEMBERSHIP_PRODUCT_IDS];

const PLANS: { id: PlanId; label: string; sublabel: string; price: string }[] = [
  { id: MEMBERSHIP_PRODUCT_IDS.MONTHLY, label: '月度会员', sublabel: '按月订阅', price: '¥ --/月' },
  { id: MEMBERSHIP_PRODUCT_IDS.YEARLY, label: '年度会员', sublabel: '按年订阅，更划算', price: '¥ --/年' },
  { id: MEMBERSHIP_PRODUCT_IDS.LIFETIME, label: '永久会员', sublabel: '一次买断，终身有效', price: '¥ --' },
];

const BENEFITS = ['去除全部广告', '更多权益即将推出...'];

export default function MembershipScreen({ navigation }: any) {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(MEMBERSHIP_PRODUCT_IDS.YEARLY);
  const { purchase, restore, isLoading } = useMembership();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

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
        Alert.alert('购买失败', e?.message ?? '请稍后重试');
      }
    }
  };

  const handleRestore = async () => {
    try {
      await restore();
      Alert.alert('恢复成功', '会员权益已恢复', [
        { text: '确定', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('恢复失败', e?.message ?? '未找到可恢复的购买记录');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>墨声会员</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.benefitsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>会员权益</Text>
          {BENEFITS.map((benefit, i) => (
            <View key={i} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
              <Text style={[styles.benefitText, { color: colors.text }]}>{benefit}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24, marginBottom: 12 }]}>选择方案</Text>
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
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.purchaseButtonText}>立即订阅</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={handleRestore} disabled={isLoading} style={styles.restoreButton}>
          <Text style={[styles.restoreText, { color: colors.subText }]}>恢复购买</Text>
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
