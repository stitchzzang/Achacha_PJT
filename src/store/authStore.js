import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import NearbyUsersService from '../services/NearbyUsersService';
const { WearSyncModule } = NativeModules;

/**
 * 인증 관련 상태를 관리하는 Zustand 스토어
- Zustand 기반 전역 상태 관리
- 인증 정보 저장 및 관리 (토큰, 사용자 정보 등)
- AsyncStorage와 연동하여 영구 저장소 처리
 */

const useAuthStore = create((set, get) => ({
  // 상태
  user: null,
  isLoggedIn: false,
  accessToken: null,
  refreshToken: null,
  loginType: null, // 'kakao' 또는 'google'
  bleToken: null,
  userId: null,

  // 로그인 성공 시 상태 업데이트
  setAuth: async (userData, tokens, type) => {
    try {
      await AsyncStorage.setItem('accessToken', tokens.accessToken);
      await AsyncStorage.setItem('refreshToken', tokens.refreshToken);
      if (tokens.bleToken) {
        await AsyncStorage.setItem('bleToken', tokens.bleToken);
        const savedBleToken = await AsyncStorage.getItem('bleToken');
        console.log('[BLE] AsyncStorage 저장된 bleToken (setAuth):', savedBleToken);
        if (tokens.bleToken !== savedBleToken) {
          console.warn('[BLE] setAuth: 서버 응답값과 AsyncStorage 값이 다릅니다!', tokens.bleToken, savedBleToken);
        }
      }
      // 저장 후 바로 읽어서 로그 출력
      const savedAccessToken = await AsyncStorage.getItem('accessToken');
      const savedRefreshToken = await AsyncStorage.getItem('refreshToken');
      console.log('[저장된 accessToken]', savedAccessToken);
      console.log('[저장된 refreshToken]', savedRefreshToken);
      // userId도 AsyncStorage에서 불러와서 상태에 반영
      const userId = await AsyncStorage.getItem('userId');
      set({
        user: userData,
        isLoggedIn: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        bleToken: tokens.bleToken || null,
        loginType: type,
        userId: userId || null,
      });

      // ✅ 네이티브에도 토큰 저장 (Bridge 호출)
      if (WearSyncModule && tokens.accessToken) {
        try {
          await WearSyncModule.saveAccessTokenToNative(tokens.accessToken);
          // 필요하다면 refreshToken도 같이 전달 가능
        } catch (e) {
          console.error('네이티브에 토큰 저장 실패', e);
        }
      }

      return true;
    } catch (error) {
      console.error('인증 정보 저장 실패:', error);
      return false;
    }
  },

  // 로그아웃
  logout: async () => {
    try {
      await AsyncStorage.removeItem('accessToken');
      await AsyncStorage.removeItem('refreshToken');
      await AsyncStorage.removeItem('bleToken');
      set({
        user: null,
        isLoggedIn: false,
        accessToken: null,
        refreshToken: null,
        bleToken: null,
        loginType: null,
        userId: null,
      });
      return true;
    } catch (error) {
      console.error('로그아웃 실패:', error);
      return false;
    }
  },

  // 앱 실행 시 토큰 복원
  restoreAuth: async () => {
    try {
      const accessToken = await AsyncStorage.getItem('accessToken');
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      const bleToken = await AsyncStorage.getItem('bleToken');
      const userId = await AsyncStorage.getItem('userId');
      if (accessToken && refreshToken) {
        set({
          isLoggedIn: true,
          accessToken,
          refreshToken,
          bleToken,
          userId: userId || null,
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('인증 정보 복원 실패:', error);
      return false;
    }
  },

  // 토큰 업데이트
  updateTokens: async (newAccessToken, newRefreshToken, newBleToken, newUserId) => {
    try {
      const prevBleToken = get().bleToken;
      if (newAccessToken) {
        await AsyncStorage.setItem('accessToken', newAccessToken);
      }
      if (newRefreshToken) {
        await AsyncStorage.setItem('refreshToken', newRefreshToken);
      }
      if (newBleToken) {
        await AsyncStorage.setItem('bleToken', newBleToken);
        const savedBleToken = await AsyncStorage.getItem('bleToken');
        console.log('[BLE] AsyncStorage 저장된 bleToken (updateTokens):', savedBleToken);
        if (newBleToken !== savedBleToken) {
          console.warn('[BLE] updateTokens: 서버 응답값과 AsyncStorage 값이 다릅니다!', newBleToken, savedBleToken);
        }
      }
      if (newUserId) {
        await AsyncStorage.setItem('userId', newUserId);
      }
      set({
        accessToken: newAccessToken || get().accessToken,
        refreshToken: newRefreshToken || get().refreshToken,
        bleToken: newBleToken || get().bleToken,
        userId: newUserId || get().userId,
      });

      // BLE 토큰이 변경된 경우 && 광고가 중지 상태일 때만 광고 시작
      if (
        newBleToken &&
        newBleToken !== prevBleToken &&
        !NearbyUsersService.isAdvertising // 광고 중이 아닐 때만
      ) {
        await NearbyUsersService.startAdvertising();
      }
      return true;
    } catch (error) {
      console.error('토큰 업데이트 실패:', error);
      return false;
    }
  },
}));

export default useAuthStore;
