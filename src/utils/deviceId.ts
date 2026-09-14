import { Platform } from 'react-native';
import * as Application from 'expo-application';

let cached: string | null | undefined;

/**
 * iOS 返回 identifierForVendor，其他平台返回 null。
 * 取不到时返回 null，不抛错，调用方按“非白名单设备”处理。
 */
export async function getDeviceId(): Promise<string | null> {
  if (cached !== undefined) return cached;
  if (Platform.OS !== 'ios') {
    cached = null;
    return cached;
  }
  try {
    cached = await Application.getIosIdForVendorAsync();
  } catch {
    cached = null;
  }
  return cached;
}
