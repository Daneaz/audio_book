import { useState, useEffect } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import MembershipService, { MembershipState } from '../services/MembershipService';
import { MEMBERSHIP_ENTITLEMENT } from '../utils/constants';

export interface UseMembershipReturn {
  isActive: boolean;
  membershipType: MembershipState['type'];
  expiresAt: string | null;
  purchase: (productId: string) => Promise<void>;
  restore: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

function extractState(customerInfo: CustomerInfo): Pick<UseMembershipReturn, 'isActive' | 'membershipType' | 'expiresAt'> {
  const entitlement = customerInfo.entitlements.active[MEMBERSHIP_ENTITLEMENT];
  if (!entitlement) return { isActive: false, membershipType: null, expiresAt: null };
  const id = entitlement.productIdentifier;
  const membershipType: MembershipState['type'] = id.includes('lifetime') ? 'lifetime' : id.includes('yearly') ? 'yearly' : 'monthly';
  return { isActive: true, membershipType, expiresAt: entitlement.expirationDate ?? null };
}

export default function useMembership(): UseMembershipReturn {
  const [isActive, setIsActive] = useState(false);
  const [membershipType, setMembershipType] = useState<MembershipState['type']>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    MembershipService.isActive().then(setIsActive);

    const listener = (info: CustomerInfo) => {
      const state = extractState(info);
      setIsActive(state.isActive);
      setMembershipType(state.membershipType);
      setExpiresAt(state.expiresAt);
    };

    Purchases.addCustomerInfoUpdateListener(listener);

    return () => { Purchases.removeCustomerInfoUpdateListener(listener); };
  }, []);

  const purchase = async (productId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await MembershipService.purchase(productId);
    } catch (e: any) {
      setError(e?.message ?? '购买失败');
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  const restore = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await MembershipService.restore();
    } catch (e: any) {
      setError(e?.message ?? '恢复购买失败');
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return { isActive, membershipType, expiresAt, purchase, restore, isLoading, error };
}
