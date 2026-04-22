import StorageService from './StorageService';
import { STORAGE_KEYS } from '../utils/constants';

export interface MembershipState {
  isActive: boolean;
  type: 'lifetime' | 'monthly' | 'yearly' | null;
  expiresAt: string | null;
}

class MembershipService {
  async getState(): Promise<MembershipState> {
    const state = await StorageService.getData(STORAGE_KEYS.MEMBERSHIP);
    if (!state) return { isActive: false, type: null, expiresAt: null };
    return state as MembershipState;
  }

  async isActive(): Promise<boolean> {
    const state = await this.getState();
    if (!state.isActive || !state.type) return false;
    if (state.type === 'lifetime') return true;
    if (!state.expiresAt) return false;
    return new Date(state.expiresAt) > new Date();
  }

  async setMembership(
    type: 'lifetime' | 'monthly' | 'yearly',
    expiresAt: string | null
  ): Promise<void> {
    await StorageService.storeData(STORAGE_KEYS.MEMBERSHIP, {
      isActive: true,
      type,
      expiresAt,
    });
  }

  async clearMembership(): Promise<void> {
    await StorageService.storeData(STORAGE_KEYS.MEMBERSHIP, {
      isActive: false,
      type: null,
      expiresAt: null,
    });
  }
}

export default new MembershipService();
