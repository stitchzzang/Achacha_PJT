import { Platform, Alert, Linking, AppState } from 'react-native';
import Geofencing from '@rn-bridge/react-native-geofencing';
import { geoNotificationService } from './geoNotificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

// 싱글톤 인스턴스를 저장할 변수
let instance = null;

class GeofencingService {
  constructor() {
    // 이미 인스턴스가 있으면 그 인스턴스를 반환
    if (instance) {
      return instance;
    }

    // 새 인스턴스 생성
    instance = this;
    this.initialized = false;
    this.initializing = false;
    this.notifiedBrandIdsThisSession = new Set();
    this.userGifticons = [];
    this.uniqueBrands = [];
    this.brandStores = [];

    // 앱 상태 관련 추가
    this.appState = AppState.currentState;
    this.isBackgroundScanning = false; // 백그라운드 스캔 상태

    // 포그라운드/백그라운드 설정
    this.foregroundCooldown = 30 * 60 * 1000; // 30분
    // this.foregroundCooldown = 1 * 60 * 1000; //테스트
    this.backgroundCooldown = 2 * 60 * 60 * 1000; // 2시간

    // 앱 상태 변경 리스너 등록
    this._appStateSubscription = AppState.addEventListener('change', this._handleAppStateChange);

    // console.log(`[GeofencingService] 인스턴스 생성됨. 초기 앱 상태: ${this.appState}`);
  }

  // 앱 상태 변경 핸들러
  _handleAppStateChange = nextAppState => {
    console.log(`[GeofencingService] 앱 상태 변경: ${this.appState} -> ${nextAppState}`);

    // 포그라운드로 전환
    if (
      nextAppState === 'active' &&
      (this.appState === 'background' || this.appState === 'inactive')
    ) {
      this._switchToForegroundMode();
    }
    // 백그라운드로 전환
    else if (nextAppState !== 'active' && this.appState === 'active') {
      this._switchToBackgroundMode();
    }

    this.appState = nextAppState;
  };

  // 포그라운드 모드로 전환
  _switchToForegroundMode = async () => {
    console.log('[GeofencingService] 포그라운드 모드로 전환');

    // 백그라운드 스캔 비활성화 표시
    this.isBackgroundScanning = false;

    // 마지막 알림 시간 불러오기
    try {
      const recentNotificationsStr = await AsyncStorage.getItem('RECENT_NOTIFICATIONS');
      if (recentNotificationsStr) {
        const recentNotifications = JSON.parse(recentNotificationsStr);

        // 백그라운드에서 발생한 알림 정보 반영
        for (const key in recentNotifications) {
          if (key.startsWith('brand_')) {
            const brandId = parseInt(key.replace('brand_', ''));
            this.notifiedBrandIdsThisSession.add(brandId);
          }
        }
      }
    } catch (error) {
      console.error('[GeofencingService] 최근 알림 로드 오류:', error);
    }
  };

  // 백그라운드 모드로 전환
  _switchToBackgroundMode = () => {
    console.log('[GeofencingService] 백그라운드 모드로 전환');

    // 백그라운드 스캔 활성화 표시
    this.isBackgroundScanning = true;
  };

  // 기프티콘 목록 업데이트
  updateUserGifticons(gifticons) {
    if (gifticons && gifticons.gifticons && Array.isArray(gifticons.gifticons)) {
      this.userGifticons = gifticons.gifticons;
      // console.log(`[GeofencingService] 기프티콘 목록 업데이트됨: ${this.userGifticons.length}개`);
    } else {
      // console.error('[GeofencingService] updateUserGifticons - 유효하지 않은 기프티콘 목록 구조.');
      this.userGifticons = [];
    }
  }

  // 위치 서비스 상태 확인 메서드
  async checkLocationServicesEnabled() {
    try {
      if (Platform.OS === 'ios') {
        // iOS에서는 권한 상태에 위치 서비스 활성화 여부가 포함됨
        const authStatus = await Geofencing.getLocationAuthorizationStatus();
        return authStatus !== 'Disabled';
      } else {
        // Android에서는 위치 서비스 상태 직접 확인
        const { locationServicesEnabled } = await Location.getProviderStatusAsync();
        // console.log(
        //   `[GeofencingService] 위치 서비스 상태: ${locationServicesEnabled ? '활성화' : '비활성화'}`
        // );
        return locationServicesEnabled;
      }
    } catch (error) {
      console.error('[GeofencingService] 위치 서비스 상태 확인 오류:', error);
      return false;
    }
  }

  // 위치 서비스 활성화 요청 메서드
  async requestLocationServicesEnabled() {
    const isEnabled = await this.checkLocationServicesEnabled();

    if (!isEnabled) {
      return new Promise(resolve => {
        Alert.alert(
          '위치 서비스 꺼짐',
          '주변 매장 알림을 받으려면 위치 서비스를 켜야 합니다. 위치 설정을 여시겠습니까?',
          [
            {
              text: '아니오',
              style: 'cancel',
              onPress: () => resolve(false),
            },
            {
              text: '설정',
              onPress: () => {
                this.openLocationSettings();
                resolve(false); // 사용자가 설정으로 이동하므로 false 반환
              },
            },
          ]
        );
      });
    }

    return true;
  }

  // 위치 설정 화면 열기
  openLocationSettings() {
    if (Platform.OS === 'ios') {
      Linking.openURL('App-Prefs:Privacy&path=LOCATION');
    } else {
      // 안드로이드에서는 위치 설정 화면 인텐트 실행
      Linking.openSettings();
      // 또는 더 구체적으로:
      // Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
    }
  }

  // 지오펜싱 초기화
  async initGeofencing() {
    if (this.initializing || this.initialized) {
      // console.log(
      //   `[GeofencingService] 초기화 건너뜀: 이미 ${this.initializing ? '초기화 중' : '초기화됨'}`
      // );
      return;
    }

    this.initializing = true;
    console.log('[GeofencingService] 지오펜싱 초기화 시작');

    try {
      // 위치 서비스 활성화 여부 확인 및 요청
      const locationServicesEnabled = await this.requestLocationServicesEnabled();
      if (!locationServicesEnabled) {
        // console.log('[GeofencingService] 위치 서비스가 비활성화되어 있음, 초기화 종료');
        this.initializing = false;
        return;
      }

      // 백그라운드 위치 권한 확인
      const hasPermission = await this.checkBackgroundLocationPermission();
      if (!hasPermission) {
        // console.log('[GeofencingService] 위치 권한 없음, 초기화 종료');
        this.initializing = false;
        return;
      }

      // 위치 권한 요청
      await Geofencing.requestLocation({ allowAlways: true });
      // console.log('[GeofencingService] 위치 권한 요청 성공');

      // 지오펜스 진입 이벤트 리스너 설정
      Geofencing.onEnter(async ids => {
        if (ids && ids.length > 0) {
          const geofenceId = ids[0];
          const geofenceBrandId = parseInt(geofenceId, 10);

          if (!isNaN(geofenceBrandId)) {
            // console.log(
            //   `[GeofencingService] 지오펜스 진입 감지: 브랜드 ${geofenceBrandId}, 앱 상태: ${this.appState}`
            // );

            // 알림 가능 여부 확인
            const canSend = await this.canSendNotification(geofenceBrandId);
            if (!canSend) {
              console.log(
                `[GeofencingService] 지오펜스 진입 알림 건너뜀: 브랜드 ${geofenceBrandId}`
              );
              return;
            }

            if (!this.userGifticons || this.userGifticons.length === 0) {
              // console.error(
              //   '[GeofencingService] 지오펜스 진입 - userGifticons가 비어있어 알림 처리 불가.'
              // );
              return;
            }

            // 해당 브랜드 ID와 일치하는 첫 번째 기프티콘 찾기
            const relevantGifticon = this.userGifticons.find(g => g.brandId === geofenceBrandId);

            if (relevantGifticon && relevantGifticon.gifticonId) {
              // console.log(
              //   `[GeofencingService] 지오펜스 진입 알림 전송 시도: 브랜드 ${geofenceBrandId}, 기프티콘 ${relevantGifticon.gifticonName || relevantGifticon.gifticonId}`
              // );

              try {
                await geoNotificationService.requestGeoNotification(relevantGifticon.gifticonId);

                // 알림 기록 업데이트
                await this.recordNotification(geofenceBrandId);

                console.log(
                  `[GeofencingService] 지오펜스 진입 알림 전송 성공: 브랜드 ${geofenceBrandId}, 기프티콘 ${relevantGifticon.gifticonName || relevantGifticon.gifticonId}`
                );
              } catch (error) {
                console.error(
                  `[GeofencingService] 지오펜스 진입 알림 전송 실패: 브랜드 ${geofenceBrandId}`,
                  error
                );
              }
            }
          }
        }
      });

      // 지오펜스 이탈 이벤트 리스너 설정 (로깅만)
      // Geofencing.onExit(ids => {
      //   if (ids && ids.length > 0) {
      //     console.log(`[GeofencingService] 지오펜스 이탈 감지: ${ids.join(', ')}`);
      //   }
      // });

      this.initialized = true;
      console.log('[GeofencingService] 지오펜싱 초기화 완료');
    } catch (error) {
      console.error('[GeofencingService] 지오펜싱 초기화 실패:', error);
      this.initialized = false;
    } finally {
      this.initializing = false;
    }
  }

  // 백그라운드 위치 권한 확인
  async checkBackgroundLocationPermission() {
    const authStatus = await Geofencing.getLocationAuthorizationStatus();
    // console.log(`[GeofencingService] 위치 권한 상태: ${authStatus}`);

    if (Platform.OS === 'android' && Platform.Version >= 29 && authStatus !== 'Always') {
      Alert.alert(
        '백그라운드 위치 권한 필요',
        '기프티콘 알림 기능을 사용하려면 "항상 허용" 위치 권한이 필요합니다. 설정에서 이 앱의 위치 권한을 "항상 허용"으로 변경해주세요.',
        [
          { text: '나중에', style: 'cancel' },
          {
            text: '설정으로 이동',
            onPress: () => {
              Linking.openSettings();
            },
          },
        ]
      );
      return false;
    }

    return true;
  }

  // 알림 가능 여부 확인 함수
  async canSendNotification(brandId) {
    const now = Date.now();
    const brandKey = `brand_${brandId}`;

    try {
      // 최근 알림 시간 가져오기
      const recentNotificationsStr = await AsyncStorage.getItem('RECENT_NOTIFICATIONS');
      let recentNotifications = {};

      if (recentNotificationsStr) {
        recentNotifications = JSON.parse(recentNotificationsStr);
      }

      const lastNotifyTime = recentNotifications[brandKey] || 0;

      // 앱 상태에 따라 쿨다운 시간 결정
      const cooldown =
        this.appState === 'active' ? this.foregroundCooldown : this.backgroundCooldown;

      // 쿨다운 기간 체크
      if (now - lastNotifyTime < cooldown) {
        // console.log(
        //   `[GeofencingService] 브랜드 ${brandId} 알림 쿨다운 중 (${Math.floor((cooldown - (now - lastNotifyTime)) / 60000)}분 남음)`
        // );
        return false;
      }

      // 세션 내 이미 알림을 보낸 브랜드인지 확인 (포그라운드일 때만 적용)
      if (this.appState === 'active' && this.notifiedBrandIdsThisSession.has(parseInt(brandId))) {
        // console.log(`[GeofencingService] 브랜드 ${brandId}는 이미 이 세션에서 알림을 보냄`);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[GeofencingService] 알림 가능 여부 체크 오류:', error);
      return false;
    }
  }

  // 알림 발송 후 기록 업데이트
  async recordNotification(brandId) {
    const now = Date.now();
    const brandKey = `brand_${brandId}`;

    try {
      // 최근 알림 시간 가져오기
      const recentNotificationsStr = await AsyncStorage.getItem('RECENT_NOTIFICATIONS');
      let recentNotifications = {};

      if (recentNotificationsStr) {
        recentNotifications = JSON.parse(recentNotificationsStr);
      }

      // 알림 시간 업데이트
      recentNotifications[brandKey] = now;

      // AsyncStorage에 저장
      await AsyncStorage.setItem('RECENT_NOTIFICATIONS', JSON.stringify(recentNotifications));

      // 세션 내 알림 기록 (앱이 활성 상태일 때만)
      if (this.appState === 'active') {
        this.notifiedBrandIdsThisSession.add(parseInt(brandId));
      }

      // console.log(`[GeofencingService] 브랜드 ${brandId} 알림 기록 업데이트 완료`);
    } catch (error) {
      console.error('[GeofencingService] 알림 기록 업데이트 오류:', error);
    }
  }

  // 백그라운드에서 지오펜싱 체크
  async checkGeofences(location) {
    // 위치 서비스가 활성화되어 있는지 확인 (추가된 부분)
    const locationServicesEnabled = await this.checkLocationServicesEnabled();
    if (!locationServicesEnabled) {
      // console.log('[GeofencingService] 위치 서비스가 비활성화되어 있어 지오펜스 체크 불가');
      return;
    }

    // 앱이 포그라운드에 있고 지오펜싱이 이미 작동 중이면 수동 체크 건너뜀
    if (this.appState === 'active' && this.initialized) {
      // console.log('[GeofencingService] 앱이 포그라운드에 있어 수동 체크 건너뜀');
      return;
    }

    if (!this.userGifticons || this.userGifticons.length === 0) {
      // console.log('[GeofencingService] 지오펜스 체크 불가: 기프티콘 없음');
      return;
    }

    // console.log(
    //   `[GeofencingService] 백그라운드 위치 체크: 앱 상태 ${this.appState}, 위치 (${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)})`
    // );

    try {
      // 현재 위치
      const { latitude, longitude } = location.coords;

      // 매장 데이터 확인
      if (!this.brandStores || !Array.isArray(this.brandStores) || this.brandStores.length === 0) {
        // AsyncStorage에서 저장된 매장 데이터 불러오기 시도
        try {
          const storeDataStr = await AsyncStorage.getItem('GEOFENCE_STORE_DATA');
          if (storeDataStr) {
            this.brandStores = JSON.parse(storeDataStr);
            // console.log(
            //   `[GeofencingService] AsyncStorage에서 ${this.brandStores.length}개 브랜드 매장 데이터 로드됨`
            // );
          } else {
            console.log('[GeofencingService] 매장 데이터 없음');
            return;
          }
        } catch (error) {
          // console.error('[GeofencingService] 매장 데이터 로드 오류:', error);
          return;
        }
      }

      // 각 브랜드별 매장 확인
      for (const brandData of this.brandStores) {
        const { brandId, stores } = brandData;

        // 해당 브랜드의 기프티콘이 있는지 확인
        const brandGifticon = this.userGifticons.find(g => g.brandId === parseInt(brandId));
        if (!brandGifticon) continue;

        // 알림 가능 여부 확인
        const canSend = await this.canSendNotification(brandId);
        if (!canSend) continue;

        // 각 매장의 위치와 현재 위치 비교
        for (const store of stores) {
          const storeLatitude = parseFloat(store.y);
          const storeLongitude = parseFloat(store.x);

          if (isNaN(storeLatitude) || isNaN(storeLongitude)) continue;

          // 거리 계산
          const distance = this.calculateDistance(
            latitude,
            longitude,
            storeLatitude,
            storeLongitude
          );

          // 반경 내에 있는지 확인 (500m)
          if (distance <= 500) {
            // console.log(
            //   `[GeofencingService] 백그라운드 매장 근처 감지: 브랜드 ${brandId}, 매장 ${store.place_name}, 거리 ${distance.toFixed(0)}m`
            // );

            // 알림 보내기
            try {
              await geoNotificationService.requestGeoNotification(brandGifticon.gifticonId);

              // 알림 기록 업데이트
              await this.recordNotification(brandId);

              // console.log(
              //   `[GeofencingService] 백그라운드 알림 전송 성공: 브랜드 ${brandId}, 기프티콘 ${brandGifticon.gifticonName || brandGifticon.gifticonId}`
              // );
              break; // 이 브랜드의 다음 매장은 확인하지 않음
            } catch (error) {
              console.error(
                `[GeofencingService] 백그라운드 알림 전송 실패: 브랜드 ${brandId}`,
                error
              );
            }
          }
        }
      }
    } catch (error) {
      console.error('[GeofencingService] 백그라운드 지오펜스 체크 중 오류:', error);
    }
  }

  // 두 지점 간의 거리 계산 (하버사인 공식)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // 지구 반지름 (미터)
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // 미터 단위 거리
  }

  // 지오펜스 설정
  async setupGeofences(brandResults, selectedBrand) {
    // 위치 서비스가 활성화되어 있는지 확인 (추가된 부분)
    const locationServicesEnabled = await this.checkLocationServicesEnabled();
    if (!locationServicesEnabled) {
      const enabled = await this.requestLocationServicesEnabled();
      if (!enabled) {
        // console.log('[GeofencingService] 위치 서비스가 비활성화되어 있어 지오펜스 설정 불가');
        return [];
      }
    }

    // console.log(
    //   `[GeofencingService] setupGeofences 호출됨: ${brandResults ? brandResults.length : 0}개 브랜드, 선택된 브랜드: ${selectedBrand || '없음'}`
    // );
    // console.log(`[GeofencingService] 현재 userGifticons: ${this.userGifticons.length}개`);

    if (!brandResults || !Array.isArray(brandResults) || brandResults.length === 0) {
      console.error(
        '[GeofencingService] setupGeofences: 유효하지 않거나 비어있는 매장 데이터',
        brandResults
      );
      return [];
    }

    console.log('[GeofencingService] setupGeofences 시작:', {
      브랜드_수: brandResults.length,
      선택된_브랜드: selectedBrand || '없음',
      앱_상태: this.appState,
    });

    if (this.initializing) {
      // console.log('[GeofencingService] 초기화 중, 대기 시작');
      await new Promise(r => setTimeout(r, 1000));
      // console.log('[GeofencingService] 초기화 대기 완료');
    }

    try {
      if (!this.initialized) {
        console.log('[GeofencingService] 초기화되지 않음, 초기화 시도');
        await this.initGeofencing();
      }

      if (!this.userGifticons || this.userGifticons.length === 0) {
        // console.log('[GeofencingService] 기프티콘 없음, 지오펜스 설정 취소');
        // 기존 지오펜스 제거
        const registered = await Geofencing.getRegisteredGeofences();
        if (registered && registered.length > 0) {
          // console.log(`[GeofencingService] 기존 ${registered.length}개 지오펜스 제거 시작`);
          for (const id of registered) {
            await Geofencing.removeGeofence(id);
            // console.log(`[GeofencingService] 지오펜스 ${id} 제거됨`);
          }
        }
        return [];
      }

      // 매장 정보 저장
      this.brandStores = brandResults;
      // console.log(`[GeofencingService] 매장 정보 저장됨: ${brandResults.length}개 브랜드`);

      try {
        // AsyncStorage에도 저장
        await AsyncStorage.setItem('GEOFENCE_STORE_DATA', JSON.stringify(brandResults));
        // console.log('[GeofencingService] 매장 정보 AsyncStorage에 저장됨');
      } catch (error) {
        console.error('[GeofencingService] AsyncStorage 저장 오류:', error);
      }

      // 기존 지오펜스 제거
      // console.log('[GeofencingService] 기존 지오펜스 제거 시도');
      try {
        const registeredGeofences = await Geofencing.getRegisteredGeofences();
        // console.log(`[GeofencingService] 제거할 지오펜스: ${registeredGeofences.length}개`);

        if (registeredGeofences && registeredGeofences.length > 0) {
          for (const id of registeredGeofences) {
            try {
              await Geofencing.removeGeofence(id);
              // console.log(`[GeofencingService] 지오펜스 ${id} 제거됨`);
            } catch (removeError) {
              console.error(`[GeofencingService] 지오펜스 ${id} 제거 오류:`, removeError);
            }
          }
        }
      } catch (error) {
        console.error('[GeofencingService] 지오펜스 제거 중 오류:', error);
      }

      // 앱이 백그라운드 상태이고 포그라운드 모드로 전환되지 않은 경우 지오펜스 추가 건너뜀
      if (this.appState !== 'active' && this.isBackgroundScanning) {
        // console.log('[GeofencingService] 앱이 백그라운드 상태. 지오펜스 설정 건너뜀');
        return [];
      }

      // 새 지오펜스 설정
      console.log('[GeofencingService] 새 지오펜스 설정 시작');
      let count = 0;
      const successfulGeofences = [];

      for (const brandResult of brandResults) {
        const { brandId, stores } = brandResult;

        if (!stores || !Array.isArray(stores) || stores.length === 0) {
          // console.log(`[GeofencingService] 브랜드 ${brandId}의 매장 데이터 없음`);
          continue;
        }

        // 선택된 브랜드가 있으면 해당 브랜드만 설정
        if (
          selectedBrand !== null &&
          selectedBrand !== undefined &&
          brandId.toString() !== selectedBrand.toString()
        ) {
          // console.log(
          //   `[GeofencingService] 브랜드 ${brandId} 건너뜀 (선택된 브랜드: ${selectedBrand})`
          // );
          continue;
        }

        // 해당 브랜드의 기프티콘이 있는지 확인
        const hasGifticon = this.userGifticons.some(g => g.brandId === parseInt(brandId));
        if (!hasGifticon) {
          // console.log(`[GeofencingService] 브랜드 ${brandId}의 기프티콘 없음, 건너뜀`);
          continue;
        }

        // console.log(`[GeofencingService] 브랜드 ${brandId}의 매장 수: ${stores.length}개`);

        // 대표 매장 하나만 지오펜스로 등록 (성능 최적화)
        const representativeStore = stores[0];
        const geofenceId = `${brandId}`;

        try {
          const storeLatitude = parseFloat(representativeStore.y);
          const storeLongitude = parseFloat(representativeStore.x);

          if (isNaN(storeLatitude) || isNaN(storeLongitude)) {
            console.error(`[GeofencingService] 브랜드 ${brandId} 좌표 변환 오류`);
            continue;
          }

          // console.log(
          //   `[GeofencingService] 지오펜스 추가 시도: 브랜드 ${brandId}, 위치 (${storeLatitude.toFixed(6)}, ${storeLongitude.toFixed(6)})`
          // );

          await Geofencing.addGeofence({
            id: geofenceId,
            latitude: storeLatitude,
            longitude: storeLongitude,
            radius: 500,
            notifyOnEntry: true,
            notifyOnExit: false,
          });

          successfulGeofences.push(geofenceId);
          count++;
          console.log(`[GeofencingService] 지오펜스 추가 성공: 브랜드 ${brandId}`);
        } catch (error) {
          console.error(
            `[GeofencingService] 지오펜스 설정 실패: 브랜드 ${brandId}, 매장 ${representativeStore.place_name}`,
            error
          );
        }
      }

      console.log(`[GeofencingService] 지오펜스 설정 완료: ${count}개 설정됨`);

      // 설정 확인
      try {
        const finalGeofences = await Geofencing.getRegisteredGeofences();
        console.log(
          // `[GeofencingService] 최종 등록된 지오펜스(${finalGeofences.length}개):`,
          finalGeofences
        );
        return successfulGeofences;
      } catch (error) {
        console.error('[GeofencingService] 최종 지오펜스 확인 중 오류:', error);
        return successfulGeofences;
      }
    } catch (error) {
      console.error('[GeofencingService] setupGeofences - 설정 중 오류:', error);
      return [];
    }
  }

  // 알림 쿨다운 초기화
  async resetNotificationCooldowns() {
    try {
      // console.log('[GeofencingService] 알림 쿨다운 초기화 시작');
      // AsyncStorage에서 RECENT_NOTIFICATIONS 항목 제거
      await AsyncStorage.removeItem('RECENT_NOTIFICATIONS');
      // 세션 내 알림 기록 초기화
      this.notifiedBrandIdsThisSession.clear();
      console.log('[GeofencingService] 알림 쿨다운 초기화 완료');
    } catch (error) {
      console.error('[GeofencingService] 알림 쿨다운 초기화 중 오류 발생:', error);
    }
  }

  async cleanup() {
    try {
      // console.log('[GeofencingService] 정리 시작');

      // 이벤트 리스너 제거
      if (this._appStateSubscription) {
        this._appStateSubscription.remove();
        this._appStateSubscription = null;
        // console.log('[GeofencingService] 앱 상태 리스너 제거됨');
      }

      // 등록된 지오펜스 제거
      if (this.initialized) {
        try {
          const geofenceIds = await Geofencing.getRegisteredGeofences();
          if (geofenceIds && geofenceIds.length > 0) {
            // console.log(`[GeofencingService] 등록된 지오펜스 제거 중: ${geofenceIds.length}개`);
            for (const id of geofenceIds) {
              try {
                await Geofencing.removeGeofence(id);
                // console.log(`[GeofencingService] 지오펜스 ${id} 제거됨`);
              } catch (removeError) {
                console.error(`[GeofencingService] 지오펜스 ${id} 제거 오류:`, removeError);
              }
            }
          }
        } catch (geofenceError) {
          console.error('[GeofencingService] 지오펜스 제거 중 오류:', geofenceError);
        }
      }

      // 상태 초기화
      this.initialized = false;
      this.initializing = false;
      this.notifiedBrandIdsThisSession.clear();
      this.isBackgroundScanning = false;

      // console.log('[GeofencingService] 정리 완료');
    } catch (error) {
      console.error('[GeofencingService] 정리 중 오류 발생:', error);
    }
  }
}

export default GeofencingService;
