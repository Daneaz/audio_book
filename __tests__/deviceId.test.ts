import * as Application from 'expo-application';
import { Platform } from 'react-native';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('expo-application', () => ({
  __esModule: true,
  getIosIdForVendorAsync: jest.fn(),
}));

// 模块内有进程级缓存，每个用例重新加载以拿到干净状态
function loadGetDeviceId(): () => Promise<string | null> {
  let fn!: () => Promise<string | null>;
  jest.isolateModules(() => {
    fn = require('../src/utils/deviceId').getDeviceId;
  });
  return fn;
}

describe('getDeviceId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'ios';
  });

  it('returns the iOS identifierForVendor', async () => {
    (Application.getIosIdForVendorAsync as jest.Mock).mockResolvedValue('IDFV-123');
    await expect(loadGetDeviceId()()).resolves.toBe('IDFV-123');
  });

  it('only queries the native module once', async () => {
    (Application.getIosIdForVendorAsync as jest.Mock).mockResolvedValue('IDFV-123');
    const getDeviceId = loadGetDeviceId();
    await getDeviceId();
    await getDeviceId();
    expect(Application.getIosIdForVendorAsync).toHaveBeenCalledTimes(1);
  });

  it('returns null on non-iOS platforms without touching the native module', async () => {
    (Platform as any).OS = 'android';
    await expect(loadGetDeviceId()()).resolves.toBeNull();
    expect(Application.getIosIdForVendorAsync).not.toHaveBeenCalled();
  });

  it('returns null when the native module throws', async () => {
    (Application.getIosIdForVendorAsync as jest.Mock).mockRejectedValue(new Error('boom'));
    await expect(loadGetDeviceId()()).resolves.toBeNull();
  });
});
