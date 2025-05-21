import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { PermissionsAndroid, Platform, Alert, AppState, NativeModules } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import useAuthStore from '../store/authStore';
import apiClient from '../api/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

// BLE 서비스 및 특성 UUID
const SERVICE_UUID = '1bf0cbce-7af3-4b59-93f2-0c4c6d170164'; // 하이픈 포함된 형식
const SERVICE_UUID_NO_HYPHENS = SERVICE_UUID.replace(/-/g, ''); // 하이픈 제거된 형식

// BLE 광고 권한 요청 함수 (Android 12+)
async function requestBleAdvertisePermission() {
  if (Platform.OS === 'android' && Platform.Version >= 31) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      {
        title: 'BLE 광고 권한 요청',
        message: '주변 기기와 통신하려면 BLE 광고 권한이 필요합니다.',
        buttonNeutral: '나중에',
        buttonNegative: '거부',
        buttonPositive: '허용',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
}

class NearbyUsersService {
  constructor() {
    this.tokenExpiry = null; // 토큰 만료 시간 저장용
    this.nearbyUsers = [];
    this.isScanning = false;
    this.isAdvertising = false;
    this.serviceUUID = SERVICE_UUID; // 하이픈 포함된 UUID
    this.serviceUUIDNoHyphens = SERVICE_UUID_NO_HYPHENS; // 광고용 (하이픈 제거)
    this.SCAN_DURATION = 5000; // 스캔 시간 5초로 설정 (밀리초 단위)
    this.scanSubscription = null;
    this.manager = new BleManager();
    this.isGeneratingToken = false;

    console.log('[NearbyUsersService:constructor] 인스턴스 생성됨:', this);
    // 앱 상태 변경 이벤트 리스너 설정
    this.setupAppStateListener();
  }

  // 앱 상태 변경 이벤트 리스너 설정
  setupAppStateListener() {
    this.appStateListener = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        // 포그라운드 상태
        this.resumeBleOperations();
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        // 백그라운드 또는 낫러닝상태
        this.pauseBleOperations();
      }
    });
  }

  // BLE 작업 일시 중지 (백그라운드 진입 시)
  async pauseBleOperations() {
    try {
      // 스캔 중지
      if (this.isScanning) {
        await this.stopScan();
      }

      // 광고 중지
      if (this.isAdvertising) {
        await this.stopAdvertising();
      }
    } catch (error) {
      console.error('BLE 작업 중지 실패:', error);
    }
  }

  // BLE 작업 재개 (포그라운드 복귀 시)
  async resumeBleOperations() {
    try {
      let bleToken = useAuthStore.getState().bleToken;
      console.log('[NearbyUsersService:resumeBleOperations] 진입, bleToken:', bleToken, '인스턴스:', this);

      if (!bleToken) {
        // AsyncStorage에서 직접 한 번 더 읽기
        const storageBleToken = await AsyncStorage.getItem('bleToken');
        console.log('[resumeBleOperations] AsyncStorage에서 bleToken 읽음:', storageBleToken);

        if (storageBleToken) {
          // store에도 반영
          useAuthStore.setState({ bleToken: storageBleToken });
          bleToken = storageBleToken;
        }
      }

      if (bleToken) {
        console.log('[resumeBleOperations] BLE 토큰이 이미 존재합니다. 추가 발급을 건너뜁니다. (최종 bleToken:', bleToken, ')');
      } else {
        console.log('[resumeBleOperations] BLE 토큰이 없으므로 새 토큰 요청...');
        await this.generateBleToken();
      }
      // 스캔 중이 아닐 때만 광고 시작
      if (!this.isScanning) {
        await this.startAdvertising();
      }
    } catch (error) {
      console.error('BLE 작업 재개 실패:', error);
    }
  }

  // 블루투스 상태 확인 및 활성화 요청
  async checkBluetoothState() {
    try {
      const state = await this.manager.state();

      if (state === 'PoweredOn') {
        return true;
      } else {
        // iOS에서는 시스템 설정으로 이동하도록 안내
        if (Platform.OS === 'ios') {
          Alert.alert(
            '블루투스가 꺼져 있습니다',
            '설정에서 블루투스를 켜주세요.',
            [{ text: '확인', onPress: () => console.log('OK Pressed') }],
            { cancelable: false }
          );
          return false;
        }
        // Android에서는 활성화 요청
        else {
          if (state === 'PoweredOff') {
            Alert.alert(
              '블루투스가 꺼져 있습니다',
              '블루투스를 켜주세요.',
              [{ text: '확인', onPress: () => console.log('OK Pressed') }],
              { cancelable: false }
            );
          }
          return false;
        }
      }
    } catch (error) {
      console.error('블루투스 상태 확인 실패:', error);
      return false;
    }
  }

  // 블루투스 권한 요청 (Android)
  async requestBluetoothPermissions() {
    if (Platform.OS === 'android') {
      try {
        if (Platform.Version >= 31) {
          // Android 12 이상
          const permissions = [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ];

          const results = await PermissionsAndroid.requestMultiple(permissions);

          return (
            results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
            results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted' &&
            results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE] === 'granted' &&
            results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === 'granted'
          );
        } else {
          // Android 12 미만
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: '위치 권한 필요',
              message: '근처 사용자를 찾기 위해 위치 권한이 필요합니다.',
              buttonNeutral: '나중에 묻기',
              buttonNegative: '취소',
              buttonPositive: '확인',
            }
          );

          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
      } catch (error) {
        console.error('권한 요청 오류:', error);
        return false;
      }
    }

    return true; // iOS는 항상 true 반환 (권한은 앱 설치 시 요청)
  }

  // 저장된 토큰 불러오기
  async loadStoredToken() {
    try {
      const bleToken = useAuthStore.getState().bleToken;
      console.log('[NearbyUsersService:loadStoredToken] 호출됨, bleToken:', bleToken);
      if (bleToken) {
        console.log('[NearbyUsersService:loadStoredToken] bleToken에 할당:', bleToken);
      }
    } catch (error) {
      console.error('저장된 BLE 토큰 불러오기 실패:', error);
    }
  }

  // BLE 토큰 생성 API 호출
  async generateBleToken() {
    if (this.isGeneratingToken) {
      console.log('이미 토큰 발급 중입니다. 중복 호출 방지');
      return;
    }
    this.isGeneratingToken = true;
    try {
      const bleToken = useAuthStore.getState().bleToken;
      console.log('[NearbyUsersService:generateBleToken] 발급 전, bleToken:', bleToken);
      const response = await apiClient.post('/api/ble', {
        bleTokenValue: bleToken, // 현재 가지고 있는 토큰 값 (없으면 null)
      });

      // console.log('BLE 토큰 응답:', response.data);

      // bleToken 필드를 찾아서 사용 (서버가 이 필드로 응답함)
      const tokenValue = response.data?.bleToken;

      if (tokenValue) {
        // console.log('새 BLE 토큰 받음:', tokenValue);
        await useAuthStore.getState().updateTokens(null, null, tokenValue);
        console.log('[NearbyUsersService:generateBleToken] 발급 후 bleToken:', tokenValue);
        // 새 토큰의 만료 시간 설정
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 7); // 7일 후 만료로 설정
        this.tokenExpiry = expiry;
        // console.log('[generateBleToken] 새 토큰 만료 시간 설정됨:', this.tokenExpiry);
      } else {
        console.error('서버 응답에 토큰이 없습니다:', response.data);
      }

      return response.data;
    } catch (error) {
      console.error('BLE 토큰 생성 중 오류:', error);
      throw error;
    } finally {
      this.isGeneratingToken = false;
    }
  }

  // 블루투스 초기화 및 권한 설정
  async initialize() {
    // 로그인 상태 확인
    const isLoggedIn = useAuthStore.getState().isLoggedIn;
    if (!isLoggedIn) {
      // console.log('[Initialize] 사용자가 로그인하지 않았습니다. BLE 초기화를 건너뜁니다.');
      return false;
    }

    if (AppState.currentState !== 'active') {
      // console.log('[Initialize] 앱이 포그라운드 상태가 아닙니다. BLE 초기화를 건너뜁니다.');
      return false;
    }

    // 기존 BLE 매니저 정리 (캐시된 기기 정보 제거)
    try {
      // console.log('[Initialize] BLE 매니저 완전 재초기화 시작');
      this.manager.destroy();
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.manager = new BleManager();
      // console.log('[Initialize] BLE 매니저 완전 재초기화 완료');
    } catch (error) {
      console.error('[Initialize] BLE 매니저 재초기화 실패:', error);
    }

    const hasPermissions = await this.requestBluetoothPermissions();
    if (!hasPermissions) {
      return false;
    }

    const isBluetoothOn = await this.checkBluetoothState();
    if (!isBluetoothOn) {
      return false;
    }

    try {
      if (useAuthStore.getState().bleToken) {
        console.log('[Initialize] BLE 토큰이 이미 존재합니다. 추가 발급을 건너뜁니다.');
      } else {
        console.log('[Initialize] BLE 토큰이 없으므로 새 토큰 요청...');
        const bleTokenResponse = await this.generateBleToken();
        if (!useAuthStore.getState().bleToken) {
          console.error('[Initialize] generateBleToken 호출 후에도 유효한 BLE 토큰을 얻지 못했습니다.');
          return false;
        }
      }
      return true;
    } catch (error) {
      console.error('[Initialize] BLE 초기화 실패:', error);
      return false;
    }
  }

  // 광고 시작 (자신을 다른 기기에 알림)
  async startAdvertising() {
    const bleToken = useAuthStore.getState().bleToken;
    console.log('[NearbyUsersService:startAdvertising] 광고 시작, bleToken:', bleToken);
    // 앱이 포그라운드인지 확인
    if (AppState.currentState !== 'active') {
      return false;
    }

    // 스캔 중이면 광고를 시작하지 않음
    if (this.isScanning) {
      console.log('현재 스캔 중입니다. 스캔이 완료된 후 광고를 시작합니다.');
      return false;
    }

    // Android 12+ BLE 광고 권한 체크
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      const hasAdvertisePermission = await requestBleAdvertisePermission();
      if (!hasAdvertisePermission) {
        console.error('BLE 광고 권한이 없습니다. 광고를 시작할 수 없습니다.');
        return false;
      }
    }

    try {
      // 광고 시작 전 반드시 광고 중지
      if (this.isAdvertising) {
        await this.stopAdvertising();
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
      }

      if (!bleToken) {
        return false;
      }

      // 네이티브 모듈 사용 (BleModule)
      if (NativeModules.BleModule) {
        try {
          // UUID 문자열을 실제 바이트로 변환
          const uuidBytes = new TextEncoder().encode(this.serviceUUID);
          const tokenBytes = new TextEncoder().encode(bleToken);

          console.log('\n2. 광고 데이터 준비:');
          console.log('- Service UUID:', this.serviceUUID);
          console.log('- BLE 토큰:', bleToken);

          // 토큰 크기 검사 및 조정 (13바이트 제한)
          let tokenToUse = bleToken;
          if (tokenBytes.length > 13) {
            // console.log(`토큰 크기 초과 (${tokenBytes.length} > 13바이트). 축소 필요`);

            // 문자열을 UTF-8 인코딩 고려하여 13바이트 이내로 자르기
            let adjustedToken = '';
            const encoder = new TextEncoder();

            for (let i = 0; i < bleToken.length; i++) {
              const newToken = adjustedToken + bleToken[i];
              const newTokenBytes = encoder.encode(newToken);

              if (newTokenBytes.length > 13) {
                break;
              }

              adjustedToken = newToken;
            }

            tokenToUse = adjustedToken;
            // console.log(
            //   `조정된 토큰: "${tokenToUse}" (${encoder.encode(tokenToUse).length}바이트)`
            // );
          }

          try {
            // 방법 1: startAdvertising 메서드 사용 (있다면)
            if (typeof NativeModules.BleModule.startAdvertising === 'function') {
              await NativeModules.BleModule.startAdvertising(this.serviceUUID, tokenToUse);
              console.log('\n✅ 광고 시작됨 (방법 1)');
              this.isAdvertising = true;
              return true;
            }
          } catch (error1) {
            console.error('\n❌ 방법 1 실패:', error1);

            try {
              // 방법 2: Base64로 인코딩된 UUID+토큰 결합 데이터 사용
              const uuidNoHyphens = this.serviceUUID.replace(/-/g, '');
              const uuidArray = new Uint8Array(16);

              for (let i = 0; i < 16; i++) {
                uuidArray[i] = parseInt(uuidNoHyphens.substr(i * 2, 2), 16);
              }

              const adjustedTokenBytes = new TextEncoder().encode(tokenToUse);
              const combinedBytes = new Uint8Array(uuidArray.length + adjustedTokenBytes.length);
              combinedBytes.set(uuidArray, 0);
              combinedBytes.set(adjustedTokenBytes, uuidArray.length);

              const base64Data = btoa(String.fromCharCode.apply(null, combinedBytes));
              await NativeModules.BleModule.startAdvertisingOptimized(base64Data);
              console.log('\n✅ 광고 시작됨 (방법 2)');
              this.isAdvertising = true;
              return true;
            } catch (error2) {
              console.error('\n❌ 방법 2 실패:', error2);

              try {
                const shortToken = bleToken.substring(0, 8);
                await NativeModules.BleModule.startAdvertising(this.serviceUUID, shortToken);
                console.log('\n✅ 광고 시작됨 (방법 3)');
                this.isAdvertising = true;
                return true;
              } catch (error3) {
                console.error('\n❌ 모든 방법 실패:', error3);
                this.isAdvertising = false;
                return false;
              }
            }
          }
        } catch (error) {
          console.error('\n❌ 광고 시작 실패:', error);
          this.isAdvertising = false;
          return false;
        }
      } else {
        console.error('BleModule을 찾을 수 없습니다.');
        return false;
      }
    } catch (error) {
      console.error('광고 시작 과정에서 예상치 못한 오류:', error);
      this.isAdvertising = false;
      return false;
    }
  }

  // 광고 중지
  async stopAdvertising() {
    try {
      // BleModule 확인
      if (!NativeModules.BleModule) {
        console.error('[BLE 광고] BleModule을 찾을 수 없습니다.');
        this.isAdvertising = false;
        return false;
      }

      try {
        // 광고 중지 명령 실행
        await NativeModules.BleModule.stopAdvertising();
        console.log('[BLE 광고] 광고 중지 완료');

        // 상태 업데이트 전 잠시 대기 (안정성 위해)
        await new Promise(resolve => setTimeout(resolve, 500));

        this.isAdvertising = false;
        return true;
      } catch (error) {
        console.error('[BLE 광고] 네이티브 모듈 광고 중지 오류:', error);

        // 오류가 발생해도 상태는 초기화
        this.isAdvertising = false;
        return false;
      }
    } catch (error) {
      console.error('[BLE 광고] 광고 중지 처리 중 오류:', error);
      this.isAdvertising = false;
      return false;
    }
  }

  // 서비스 데이터 디코딩
  decodeServiceData(data) {
    try {
      if (typeof data === 'string') {
        // Base64 문자열 처리
        if (data.startsWith('data:')) {
          // Base64 URI 스키마 처리
          const base64Data = data.split(',')[1];
          return atob(base64Data);
        } else {
          // 일반 Base64 문자열
          return atob(data);
        }
      } else if (data instanceof Uint8Array || Array.isArray(data)) {
        // 바이트 배열을 문자열로 변환
        return Array.from(data)
          .map(byte => String.fromCharCode(byte))
          .join('');
      }
      // 그 외 형식은 문자열로 반환
      return String(data);
    } catch (error) {
      console.error('서비스 데이터 디코딩 실패:', error);
      return String(data);
    }
  }

  // BLE 스캔 시작
  async startScan(onUserFound, onScanComplete) {
    if (AppState.currentState !== 'active') {
      console.log('앱이 포그라운드 상태가 아닙니다. 스캔을 시작할 수 없습니다.');
      if (onScanComplete) onScanComplete([]);
      return;
    }

    if (this.isScanning) {
      // console.log('이미 스캔 중입니다.');
      return;
    }

    // 스캔 시작 전 광고 중지
    const wasAdvertising = this.isAdvertising;
    if (wasAdvertising) {
      // console.log('스캔 시작 전 광고 중지 중...');
      await this.stopAdvertising();
      // 광고 중지 후 1초 대기
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    try {
      // 블루투스 상태 확인
      const state = await this.manager.state();
      // console.log('블루투스 상태:', state);

      if (state !== 'PoweredOn') {
        // console.log('블루투스가 켜져있지 않습니다. 현재 상태:', state);
        if (onScanComplete) onScanComplete([]);

        // 블루투스 상태 문제 시 이전에 광고 중이었다면 광고 재시작
        if (wasAdvertising) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          this.startAdvertising().catch(e =>
            console.error('블루투스 상태 문제 후 광고 재시작 오류:', e)
          );
        }
        return;
      }

      // 권한 확인
      const hasPermissions = await this.requestBluetoothPermissions();
      // console.log('블루투스 권한 상태:', hasPermissions);

      if (!hasPermissions) {
        // console.log('블루투스 권한이 없습니다.');
        if (onScanComplete) onScanComplete([]);

        // 권한 문제 시 이전에 광고 중이었다면 광고 재시작
        if (wasAdvertising) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          this.startAdvertising().catch(e => console.error('권한 문제 후 광고 재시작 오류:', e));
        }
        return;
      }

      // 이전 스캔 결과 초기화
      this.nearbyUsers = [];
      this.isScanning = true;

      console.log('\n=== BLE 스캔 시작 ===');
      console.log('현재 디바이스 ID:', useAuthStore.getState().bleToken);

      // 정확한 16비트 UUID 준비 (0x1BF0 형식 변환)
      const uuidNoHyphens = this.serviceUUID.replace(/-/g, '');
      const shortUuidHex = uuidNoHyphens.substring(0, 4).toLowerCase(); // 앞 4자리(2바이트)만 사용
      const scanUUID = `0000${shortUuidHex}-0000-1000-8000-00805f9b34fb`;

      // console.log('원본 UUID:', this.serviceUUID);
      // console.log('스캔에 사용할 16비트 UUID:', scanUUID);

      // 처음에는 필터링 없이 모든 기기 스캔 (디버그용)
      const useFiltering = true; // 필터링 사용 여부 (true로 설정)

      // 스캔 시작 - BLE-PLX 방식 - 개선된 옵션 사용
      this.scanSubscription = this.manager.startDeviceScan(
        useFiltering ? [scanUUID] : null, // UUID 필터링 사용
        {
          allowDuplicates: false, // 중복 기기 필터링
          scanMode: 2, // SCAN_MODE_LOW_LATENCY (Android)
          numberOfMatches: 5, // 최대 5개 기기만 찾기 (Android)
        },
        (error, device) => {
          if (error) {
            console.error('스캔 중 오류:', error);
            return;
          }

          if (device) {
            // 신호가 너무 약한 기기는 무시 (비활성 기기일 가능성 높음)
            if (device.rssi < -80) {
              return;
            }

            // 서비스 UUID 확인
            if (device.serviceUUIDs) {
              // 우리 서비스 UUID가 있는지 확인
              const hasMatchingService = device.serviceUUIDs.some(
                uuid => uuid.toLowerCase() === scanUUID.toLowerCase()
              );

              if (hasMatchingService) {
                // 이 기기와 연결하여 서비스 데이터 읽기 시도
                this.handleDiscoveredDevice(device, onUserFound);
              }
            }
          }
        }
      );

      // 지정된 시간 후 스캔 중지
      setTimeout(async () => {
        await this.stopScan();
        // console.log('\n=== 스캔 완료 ===');

        // 발견 시간이 최근인 사용자만 필터링 (오래된/비활성 기기 제거)
        const now = Date.now();
        const activeUsers = this.nearbyUsers.filter(
          user => user.discoveryTime && now - user.discoveryTime < 5000
        );

        console.log(
          `총 발견된 기기 수: ${this.nearbyUsers.length}, 활성 기기 수: ${activeUsers.length}`
        );

        // 활성 기기만 사용
        this.nearbyUsers = activeUsers;

        // 스캔이 완료되면 광고 다시 시작 (이전에 광고 중이었다면)
        if (wasAdvertising) {
          try {
            // console.log('스캔 완료 후 광고 재시작 중...');
            // 확실하게 중간 과정을 기다리기 위해 타이밍 조정
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 광고 상태 초기화 후 재시작
            this.isAdvertising = false;
            await this.startAdvertising();
          } catch (error) {
            console.error('스캔 완료 후 광고 재시작 실패:', error);
          }
        }

        if (onScanComplete) onScanComplete(this.nearbyUsers);
      }, this.SCAN_DURATION);
    } catch (error) {
      console.error('스캔 시작 실패. 에러:', error);
      this.isScanning;

      console.error('스캔 시작 실패. 에러:', error);
      this.isScanning = false;

      // 스캔 실패 시 이전에 광고 중이었다면 광고 재시작
      if (wasAdvertising) {
        // console.log('스캔 실패 후 광고 재시작 중...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.startAdvertising().catch(e => console.error('스캔 실패 후 광고 재시작 오류:', e));
      }

      if (onScanComplete) onScanComplete([]);
    }
  }

  // 스캔 중지
  stopScan() {
    if (!this.isScanning) return;

    try {
      this.manager.stopDeviceScan();
      this.isScanning = false;

      if (this.scanSubscription) {
        this.scanSubscription = null;
      }

      // console.log('스캔 중지 완료');
    } catch (error) {
      console.error('스캔 중지 실패:', error);
    }
  }

  // 발견된 기기 처리
  async handleDiscoveredDevice(device, onUserFound) {
    try {
      // 발견 시간 기록 (최신성 확인용)
      const discoveryTime = Date.now();

      // 이미 처리한 기기인지 확인
      const existingIndex = this.nearbyUsers.findIndex(user => user.uuid === device.id);
      if (existingIndex !== -1) {
        // 이미 발견한 기기면 RSSI 업데이트 및 발견 시간 갱신
        this.nearbyUsers[existingIndex].rssi = device.rssi;
        this.nearbyUsers[existingIndex].distance = this.calculateDistance(device.rssi);
        this.nearbyUsers[existingIndex].discoveryTime = discoveryTime;
        return;
      }

      // console.log('발견된 기기 상세 정보:', {
      //   id: device.id,
      //   name: device.name || '이름 없음',
      //   rssi: device.rssi,
      //   discoveryTime: new Date(discoveryTime).toISOString(),
      // });

      // device에 있는 모든 속성 로깅
      // console.log('기기 전체 속성:', Object.keys(device));

      // Short UUID 확인 (광고와 동일한 방식 사용)
      const uuidNoHyphens = this.serviceUUID.replace(/-/g, '');
      const shortUuidHex = uuidNoHyphens.substring(0, 4).toLowerCase();
      const expectedShortUUID = `0000${shortUuidHex}-0000-1000-8000-00805f9b34fb`.toLowerCase();

      // 기기가 해당 서비스 UUID를 광고하는지 확인
      const hasMatchingService =
        device.serviceUUIDs &&
        device.serviceUUIDs.some(uuid => uuid.toLowerCase() === expectedShortUUID);

      if (hasMatchingService) {
        // console.log('일치하는 Short UUID 발견:', expectedShortUUID);
        // console.log('전체 serviceUUIDs:', JSON.stringify(device.serviceUUIDs));

        let bleToken = null;

        // BLE-PLX에서 serviceData에 접근하는 방법
        if (device.serviceData) {
          // console.log('수신된 Service Data 전체:', JSON.stringify(device.serviceData));

          // 모든 키 확인
          const serviceDataKeys = Object.keys(device.serviceData);

          // 모든 키에 대해 시도해보기
          for (const key of serviceDataKeys) {
            // 시도: 이 키의 데이터가 우리 토큰인지 확인
            try {
              const possibleToken = this.decodeServiceData(device.serviceData[key]);
              // console.log(`키 "${key}"에서 디코딩된 가능한 토큰:`, possibleToken);

              // 유효한 토큰인지 확인 (예: 길이, 형식 등)
              if (possibleToken && possibleToken.length > 0) {
                bleToken = possibleToken;
                // console.log('적합한 BLE 토큰 발견:', bleToken);
                break;
              }
            } catch (e) {
              console.log(`키 "${key}" 데이터 디코딩 실패:`, e.message);
            }
          }

          // expectedShortUUID로 시도했는데 실패했다면
          if (!bleToken && serviceDataKeys.length > 0) {
            // 첫 번째 키로 시도
            const firstKey = serviceDataKeys[0];
            try {
              bleToken = this.decodeServiceData(device.serviceData[firstKey]);
              // console.log('첫 번째 키로 추출한 BLE 토큰:', bleToken);
            } catch (e) {
              console.log('첫 번째 키 디코딩 실패:', e.message);
            }
          }
        } else {
          console.log('Service Data가 없습니다.');
        }

        // 거리 계산
        const distance = this.calculateDistance(device.rssi);

        // 이모지 결정
        const emojiOptions = [
          require('../assets/images/emoji1.png'),
          require('../assets/images/emoji2.png'),
          require('../assets/images/emoji3.png'),
          require('../assets/images/emoji4.png'),
          require('../assets/images/emoji5.png'),
        ];
        const emoji = emojiOptions[Math.floor(Math.random() * emojiOptions.length)];

        // 사용자 이름 생성 (bleToken 또는 기본값)
        const userName = `사용자${this.nearbyUsers.length + 1}`;

        // 근처 사용자 목록에 추가
        const user = {
          id: device.id,
          name: userName,
          uuid: device.id,
          serviceUUID: expectedShortUUID,
          bleToken: bleToken,
          rssi: device.rssi,
          distance: distance,
          timestamp: new Date().getTime(),
          discoveryTime: discoveryTime, // 발견 시간 기록
          deviceId: device.id,
          emoji: emoji,
        };

        this.nearbyUsers.push(user);

        // 콜백 호출
        if (onUserFound) onUserFound(user);
      } else {
        console.log('Short UUID 불일치. 다른 앱의 기기로 판단');
      }
    } catch (error) {
      console.error('기기 처리 중 오류:', error);
    }
  }

  // RSSI를 거리(미터)로 변환
  calculateDistance(rssi) {
    // 간단한 거리 계산식 (대략적인 추정)
    // txPower는 1미터 거리에서의 RSSI 값 (보통 -59 ~ -65 dBm)
    const txPower = -59;
    if (rssi === 0) {
      return -1; // 계산 불가
    }

    const ratio = (rssi * 1.0) / txPower;
    if (ratio < 1.0) {
      return Math.pow(ratio, 10);
    } else {
      return 0.89976 * Math.pow(ratio, 7.7095) + 0.111;
    }
  }

  // 모든 근처 사용자 가져오기
  getAllNearbyUsers() {
    return [...this.nearbyUsers];
  }

  // 100m 이내의 사용자만 필터링
  getNearbyUsersWithin100m() {
    return this.nearbyUsers.filter(user => user.distance <= 100);
  }

  // 최근에 발견된 사용자만 필터링 (활성 상태로 판단)
  getActiveNearbyUsers(maxAgeMs = 10000) {
    const now = Date.now();
    return this.nearbyUsers.filter(
      user => user.discoveryTime && now - user.discoveryTime < maxAgeMs
    );
  }

  // 리소스 정리
  cleanup() {
    // 스캔 중지
    if (this.isScanning) {
      this.stopScan();
    }

    // 앱 상태 리스너 제거
    if (this.appStateListener) {
      this.appStateListener.remove();
      this.appStateListener = null;
    }

    // 광고 중지 (네이티브 모듈 사용)
    if (this.isAdvertising) {
      this.stopAdvertising();
    }

    // 모든 구독 취소
    if (this.scanSubscription) {
      this.scanSubscription = null;
    }

    // BLE 매니저 파괴 (선택적)
    this.manager.destroy();
  }
}

export default new NearbyUsersService();
