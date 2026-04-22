import MembershipService from '../src/services/MembershipService';
import StorageService from '../src/services/StorageService';
import { STORAGE_KEYS } from '../src/utils/constants';

jest.mock('../src/services/StorageService', () => ({
  __esModule: true,
  default: {
    getData: jest.fn(),
    storeData: jest.fn(),
  },
}));

describe('MembershipService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('isActive', () => {
    it('returns false when no membership data', async () => {
      (StorageService.getData as jest.Mock).mockResolvedValue(null);
      expect(await MembershipService.isActive()).toBe(false);
    });

    it('returns false when isActive is false in storage', async () => {
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: false, type: null, expiresAt: null,
      });
      expect(await MembershipService.isActive()).toBe(false);
    });

    it('returns true for lifetime membership', async () => {
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: true, type: 'lifetime', expiresAt: null,
      });
      expect(await MembershipService.isActive()).toBe(true);
    });

    it('returns true for yearly membership that has not expired', async () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: true, type: 'yearly', expiresAt: future,
      });
      expect(await MembershipService.isActive()).toBe(true);
    });

    it('returns false for yearly membership that has expired', async () => {
      const past = new Date(Date.now() - 86400000).toISOString();
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: true, type: 'yearly', expiresAt: past,
      });
      expect(await MembershipService.isActive()).toBe(false);
    });
  });

  describe('setMembership', () => {
    it('writes correct state to storage', async () => {
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      await MembershipService.setMembership('monthly', expiresAt);
      expect(StorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEYS.MEMBERSHIP,
        { isActive: true, type: 'monthly', expiresAt }
      );
    });
  });

  describe('clearMembership', () => {
    it('writes inactive state to storage', async () => {
      await MembershipService.clearMembership();
      expect(StorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEYS.MEMBERSHIP,
        { isActive: false, type: null, expiresAt: null }
      );
    });
  });
});
