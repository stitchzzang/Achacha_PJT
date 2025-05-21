import React, { useCallback, useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import * as SplashScreen from 'expo-splash-screen';
import {
  View,
  StyleSheet,
  LogBox,
  Text,
  TextInput,
  Platform,
  AppState,
  NativeModules,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TabBarProvider } from './src/context/TabBarContext';
import { HeaderBarProvider } from './src/context/HeaderBarContext';
import { ThemeProvider } from 'react-native-elements';
import theme from './src/theme/theme';
import * as Font from 'expo-font';
import { navigationRef } from './src/navigation/NavigationService';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppQueryClientProvider from './src/context/QueryClientProvider';
import useAuthStore from './src/store/authStore';
import { Linking } from 'react-native';
import NavigationService from './src/navigation/NavigationService';
import { KAKAO_REST_API_KEY } from '@env';
import Geofencing from '@rn-bridge/react-native-geofencing';
import useGifticonListStore from './src/store/gifticonListStore';

// FCM 알림 관련 서비스 import
import {
  requestUserPermission,
  handleForegroundMessage,
  setupBackgroundHandler,
  handleNotificationOpen,
  setupTokenRefresh,
} from './src/services/NotificationService';
import ShareMenu from 'react-native-share-menu';
// Toast 메시지 추가
import Toast from 'react-native-toast-message';
import { toastConfig } from './src/utils/toastService';
// 네이티브 알림 리스너 추가
import NotificationListener from './src/components/notification/NotificationListener';

// 지오펜싱 관련 import 추가
import GeofencingService from './src/services/GeofencingService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

// 알람 서비스 import
const { LocationAlarmModule } = NativeModules;

// 백그라운드 위치 추적을 위한 task 이름 정의 - Native 코드와 일치시켜야 함
const LOCATION_TRACKING = 'background-location-tracking';

// 백그라운드 위치 추적 Task 정의
TaskManager.defineTask(LOCATION_TRACKING, async ({ data, error }) => {
  if (error) {
    console.error('[BackgroundLocationTask] 오류:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    const location = locations[0];
    if (location) {
      // console.log('[BackgroundLocationTask] 위치 업데이트:', location.coords);

      try {
        // AsyncStorage에서 기프티콘 불러오기 (백그라운드에서는 주스탠드 스토어 접근 불가)
        const gifticonsStr = await AsyncStorage.getItem('USER_GIFTICONS');
        const storeDataStr = await AsyncStorage.getItem('GEOFENCE_STORE_DATA');

        if (!gifticonsStr) {
          console.log('[BackgroundLocationTask] 기프티콘 데이터 없음');
          return;
        }
        if (!storeDataStr) {
          console.log('[BackgroundLocationTask] 매장 데이터 없음');
          return;
        }

        let gifticons;
        let storeData;
        try {
          gifticons = JSON.parse(gifticonsStr);
          storeData = JSON.parse(storeDataStr);
        } catch (parseError) {
          console.error('[BackgroundLocationTask] 데이터 파싱 오류:', parseError);
          return;
        }

        if (!Array.isArray(gifticons) || gifticons.length === 0) {
          console.error('[BackgroundLocationTask] 유효한 기프티콘 데이터가 아님');
          return;
        }
        if (!Array.isArray(storeData) || storeData.length === 0) {
          console.error('[BackgroundLocationTask] 유효한 매장 데이터가 아님');
          return;
        }

        // GeofencingService 인스턴스 생성
        const geofencingService = new GeofencingService();

        // 데이터 주입
        geofencingService.userGifticons = gifticons;
        geofencingService.brandStores = storeData;

        // console.log('[BackgroundLocationTask] GeofencingService에 데이터 주입 완료:', {
        //   numGifticons: gifticons.length,
        //   numBrandStores: storeData.length,
        // });

        // 지오펜싱 서비스 초기화 (권한 확인 등)
        if (!geofencingService.initialized) {
          await geofencingService.initGeofencing();
        }

        if (geofencingService.initialized) {
          // 현재 위치 기반으로 지오펜스 체크
          // console.log('[BackgroundLocationTask] geofencingService.checkGeofences 호출');
          await geofencingService.checkGeofences(location);
        } else {
          console.log(
            '[BackgroundLocationTask] GeofencingService 초기화 실패, checkGeofences 건너뜀'
          );
        }
      } catch (e) {
        console.error('[BackgroundLocationTask] 처리 중 오류:', e);
      }
    }
  }
});

// 특정 경고 무시 설정
LogBox.ignoreLogs([
  'Unexpected call to useState in a strict pure component',
  'Non-serializable values were found in the navigation state',
  'Component is not a function',
]);

// 텍스트 컴포넌트에 전역 스타일 적용 함수
const setDefaultFontFamily = () => {
  // 폰트 굵기에 따른 폰트 패밀리 매핑 함수
  const getFontFamily = style => {
    // 기본 폰트 패밀리
    let fontWeight = null;

    // style에서 fontWeight 추출
    if (style) {
      if (Array.isArray(style)) {
        // 배열 스타일에서 마지막에 정의된 fontWeight를 사용
        for (let i = style.length - 1; i >= 0; i--) {
          if (style[i] && style[i].fontWeight) {
            fontWeight = style[i].fontWeight;
            break;
          }
        }
      } else if (typeof style === 'object' && style.fontWeight) {
        fontWeight = style.fontWeight;
      }
    }

    // fontWeight에 따른 적절한 폰트 패밀리 반환
    if (fontWeight === '100' || fontWeight === 100) return 'Pretendard-Thin';
    if (fontWeight === '200' || fontWeight === 200) return 'Pretendard-ExtraLight';
    if (fontWeight === '300' || fontWeight === 300) return 'Pretendard-Light';
    if (fontWeight === '400' || fontWeight === 400 || fontWeight === 'normal')
      return 'Pretendard-Regular';
    if (fontWeight === '500' || fontWeight === 500) return 'Pretendard-Medium';
    if (fontWeight === '600' || fontWeight === 600) return 'Pretendard-SemiBold';
    if (fontWeight === '700' || fontWeight === 700 || fontWeight === 'bold')
      return 'Pretendard-Bold';
    if (fontWeight === '800' || fontWeight === 800) return 'Pretendard-ExtraBold';
    if (fontWeight === '900' || fontWeight === 900) return 'Pretendard-Black';

    // 기본값
    return 'Pretendard-Regular';
  };

  // 기본 Text 컴포넌트 오버라이드
  const defaultTextProps = Object.getOwnPropertyDescriptor(Text, 'render');
  if (defaultTextProps) {
    const oldRender = defaultTextProps.value;
    const newRender = function (...args) {
      const origin = oldRender.call(this, ...args);
      const fontFamily = getFontFamily(origin.props.style);

      // 기존 스타일을 유지하면서 fontFamily만 새로 적용
      return React.cloneElement(origin, {
        style: [
          {
            fontFamily,
            includeFontPadding: false,
            textAlignVertical: 'center',
          },
          origin.props.style,
        ],
        allowFontScaling: false,
      });
    };

    Object.defineProperty(Text, 'render', {
      ...defaultTextProps,
      value: newRender,
    });
  }

  // TextInput 컴포넌트 오버라이드
  const defaultTextInputProps = Object.getOwnPropertyDescriptor(TextInput, 'render');
  if (defaultTextInputProps) {
    const oldRender = defaultTextInputProps.value;
    const newRender = function (...args) {
      const origin = oldRender.call(this, ...args);
      const fontFamily = getFontFamily(origin.props.style);

      // 기존 스타일을 유지하면서 fontFamily만 새로 적용
      return React.cloneElement(origin, {
        style: [
          {
            fontFamily,
            includeFontPadding: false,
            textAlignVertical: 'center',
          },
          origin.props.style,
        ],
        allowFontScaling: false,
      });
    };

    Object.defineProperty(TextInput, 'render', {
      ...defaultTextInputProps,
      value: newRender,
    });
  }
};

// AppWrapper 컴포넌트 - 폰트 설정 초기화
const AppWrapper = ({ children }) => {
  useEffect(() => {
    setDefaultFontFamily();
  }, []);

  return children;
};

// 스플래시 화면 표시 유지
SplashScreen.preventAutoHideAsync();

const linking = {
  prefixes: ['achacha://'],
  config: {
    screens: {
      Main: {
        screens: {
          TabSharebox: {
            path: 'sharebox',
            parse: {
              code: code => code,
            },
          },
        },
      },
    },
  },
};

// 위치 서비스 유틸리티 함수들
const LocationService = {
  // 위치 권한 요청 함수
  requestLocationPermissions: async () => {
    try {
      // 포그라운드 위치 권한 요청
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();

      if (foregroundStatus !== 'granted') {
        // console.log('[LocationService] 포그라운드 위치 권한이 거부됨');
        return false;
      }

      // 백그라운드 위치 권한 요청 (Android만)
      if (Platform.OS === 'android') {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

        if (backgroundStatus !== 'granted') {
          // console.log('[LocationService] 백그라운드 위치 권한이 거부됨');
          return false;
        }
      }

      // console.log('[LocationService] 위치 권한 획득 성공');
      return true;
    } catch (error) {
      console.error('[LocationService] 위치 권한 요청 오류:', error);
      return false;
    }
  },

  // 백그라운드 위치 추적 시작
  startBackgroundLocationTracking: async () => {
    try {
      // 이미 등록된 태스크가 있는지 확인
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING).catch(
        () => false
      );

      if (hasStarted) {
        // console.log('[LocationService] 이미 백그라운드 위치 추적 중');
        return true;
      }

      // 백그라운드 위치 추적 시작
      await Location.startLocationUpdatesAsync(LOCATION_TRACKING, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 300000, // 5분마다
        distanceInterval: 100, // 100미터마다
        foregroundService: {
          notificationTitle: '위치 추적 중',
          notificationBody: '주변 매장 알림 서비스가 실행 중입니다',
        },
        pausesUpdatesAutomatically: false,
      });

      console.log('[LocationService] 백그라운드 위치 추적 시작됨');
      return true;
    } catch (error) {
      console.error('[LocationService] 백그라운드 위치 추적 시작 오류:', error);
      return false;
    }
  },

  // 백그라운드 위치 추적 중지
  stopBackgroundLocationTracking: async () => {
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING).catch(
        () => false
      );

      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_TRACKING);
        console.log('[LocationService] 백그라운드 위치 추적 중지됨');
      }
      return true;
    } catch (error) {
      console.error('[LocationService] 백그라운드 위치 추적 중지 오류:', error);
      return false;
    }
  },

  // 네이티브 알람 시작
  startLocationAlarm: async () => {
    if (Platform.OS === 'android' && LocationAlarmModule) {
      try {
        const result = await LocationAlarmModule.startLocationAlarm();
        console.log('[LocationService] 위치 알람 시작됨:', result);
        return result;
      } catch (error) {
        console.error('[LocationService] 위치 알람 시작 실패:', error);
        return false;
      }
    }
    return false;
  },

  // 네이티브 알람 중지
  stopLocationAlarm: async () => {
    if (Platform.OS === 'android' && LocationAlarmModule) {
      try {
        const result = await LocationAlarmModule.stopLocationAlarm();
        console.log('[LocationService] 위치 알람 중지됨:', result);
        return result;
      } catch (error) {
        console.error('[LocationService] 위치 알람 중지 실패:', error);
        return false;
      }
    }
    return false;
  },
  // 위치 서비스 상태 확인 함수
  checkLocationServicesEnabled: async () => {
    try {
      const status = await Location.getProviderStatusAsync();
      return status.locationServicesEnabled;
    } catch (error) {
      console.error('[LocationService] 위치 서비스 상태 확인 오류:', error);
      return false;
    }
  },

  // 위치 서비스 활성화 요청 함수
  requestLocationServicesEnabled: async () => {
    try {
      const isEnabled = await LocationService.checkLocationServicesEnabled();

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
                  LocationService.openLocationSettings();
                  resolve(false); // 사용자가 설정으로 이동하므로 false 반환
                },
              },
            ]
          );
        });
      }

      return true;
    } catch (error) {
      console.error('[LocationService] 위치 서비스 활성화 요청 오류:', error);
      return false;
    }
  },

  // 위치 설정 화면 열기 함수
  openLocationSettings: () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('App-Prefs:Privacy&path=LOCATION');
    } else {
      IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS);
    }
  },

  // 수정된 백그라운드 위치 추적 시작 함수
  startBackgroundLocationTracking: async () => {
    try {
      // 위치 서비스 활성화 여부 확인 및 요청 (추가된 부분)
      const locationServicesEnabled = await LocationService.requestLocationServicesEnabled();
      if (!locationServicesEnabled) {
        // console.log(
        //   '[LocationService] 위치 서비스가 비활성화되어 있음, 백그라운드 위치 추적 시작 불가'
        // );
        return false;
      }

      // 이미 등록된 태스크가 있는지 확인
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING).catch(
        () => false
      );

      if (hasStarted) {
        // console.log('[LocationService] 이미 백그라운드 위치 추적 중');
        return true; // 이미 실행 중이면 true 반환하고 종료
      }

      // 백그라운드 위치 추적 시작
      await Location.startLocationUpdatesAsync(LOCATION_TRACKING, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 300000, // 5분마다
        distanceInterval: 100, // 100미터마다
        foregroundService: {
          notificationTitle: '위치 추적 중',
          notificationBody: '주변 매장 알림 서비스가 실행 중입니다',
        },
        pausesUpdatesAutomatically: false,
      });

      // console.log('[LocationService] 백그라운드 위치 추적 시작됨');
      return true;
    } catch (error) {
      console.error('[LocationService] 백그라운드 위치 추적 시작 오류:', error);
      return false;
    }
  },
};

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const [pendingShareItem, setPendingShareItem] = useState(null);
  // Zustand 스토어의 토큰 복원 함수
  const restoreAuth = useAuthStore(state => state.restoreAuth);
  const restoreGifticons = useGifticonListStore(state => state.restoreGifticons);
  // 지오펜싱 서비스 참조
  const geofencingServiceRef = useRef(null);

  // 기프티콘 목록 복원 (앱 초기화 시 리소스 로드)
  useEffect(() => {
    const loadAllResources = async () => {
      await loadResources();
      await restoreGifticons(); // 기프티콘 데이터 복원
    };

    loadAllResources();
  }, []);

  // FCM 설정 초기화
  useEffect(() => {
    const initFCM = async () => {
      // 푸시 알림 권한 요청
      const permissionEnabled = await requestUserPermission();

      if (permissionEnabled) {
        // 포그라운드 메시지 처리 구독
        const unsubscribeForeground = handleForegroundMessage();

        // 백그라운드 메시지 핸들러 설정
        setupBackgroundHandler();

        // 알림 클릭 이벤트 처리 - navigationRef가 준비된 후에만 처리
        const handleNavigationReady = () => {
          if (navigationRef.current) {
            handleNotificationOpen(navigationRef.current);
          } else {
            // navigationRef가 아직 준비되지 않았다면 짧은 지연 후 재시도
            setTimeout(handleNavigationReady, 500);
          }
        };

        // 앱 로딩이 완료된 후 실행
        setIsReady(prevIsReady => {
          if (prevIsReady) {
            handleNavigationReady();
          }
          return prevIsReady;
        });

        // 토큰 갱신 리스너 설정
        const unsubscribeTokenRefresh = setupTokenRefresh();

        // 컴포넌트 언마운트 시 리소스 정리
        return () => {
          unsubscribeForeground();
          unsubscribeTokenRefresh();
        };
      }
    };

    initFCM();
  }, []);

  // 매장 데이터 로드 함수
  const fetchInitialStoreData = async () => {
    try {
      // console.log('[App] 초기 매장 데이터 로드 시작');

      // 1. 기프티콘 데이터 확인
      const storedGifticons = await AsyncStorage.getItem('USER_GIFTICONS');
      if (!storedGifticons) {
        console.log('[App] 기프티콘 데이터가 없어 매장 검색 불가');
        return;
      }

      // 2. 기프티콘에서 브랜드 정보 추출
      const gifticons = JSON.parse(storedGifticons);
      if (!Array.isArray(gifticons) || gifticons.length === 0) {
        console.log('[App] 유효한 기프티콘 없음');
        return;
      }

      // 중복 없는 브랜드 정보 추출
      const uniqueBrands = gifticons.reduce((acc, gifticon) => {
        if (!acc[gifticon.brandId]) {
          acc[gifticon.brandId] = {
            brandId: gifticon.brandId,
            brandName: gifticon.brandName,
          };
        }
        return acc;
      }, {});

      const brandsList = Object.values(uniqueBrands);
      // console.log('[App] 추출된 브랜드:', brandsList.map(b => b.brandName).join(', '));

      // 3. 기존 매장 데이터 확인 - 먼저 확인하여 위치 요청 실패해도 사용할 수 있게 함
      const existingStoresStr = await AsyncStorage.getItem('GEOFENCE_STORE_DATA');
      let existingStores = null;

      if (existingStoresStr) {
        try {
          existingStores = JSON.parse(existingStoresStr);
          // console.log(
          //   '[App] 저장된 매장 데이터 확인됨:',
          //   existingStores.reduce((sum, brand) => sum + brand.stores.length, 0),
          //   '개 매장'
          // );
        } catch (e) {
          console.error('[App] 저장된 매장 데이터 파싱 오류:', e);
        }
      }

      // 4. 현재 위치 가져오기 시도
      let location;
      let locationSuccess = false;

      try {
        // 위치 서비스 활성화 확인
        const providerStatus = await Location.getProviderStatusAsync();

        if (!providerStatus.locationServicesEnabled) {
          console.log('[App] 위치 서비스 비활성화 상태');
          // 위치 서비스가 꺼져 있으면 알림을 표시하고 위치 획득 시도 건너뜀
          Alert.alert(
            '위치 서비스 꺼짐',
            '주변 매장 정보를 가져오려면 위치 서비스를 켜야 합니다. 위치 설정을 열까요?',
            [
              {
                text: '아니오',
                style: 'cancel',
                onPress: () => console.log('[App] 위치 서비스 활성화 요청 거부됨'),
              },
              {
                text: '설정',
                onPress: () => {
                  if (Platform.OS === 'ios') {
                    Linking.openURL('App-Prefs:Privacy&path=LOCATION');
                  } else {
                    IntentLauncher.startActivityAsync(
                      IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS
                    );
                  }
                },
              },
            ]
          );
        } else {
          // 위치 정보 가져오기 시도
          location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeOut: 10000, // 10초 타임아웃
          });
          locationSuccess = true;
          // console.log('[App] 위치 정보 획득 성공:', location.coords);
        }
      } catch (locationError) {
        console.error('[App] 현재 위치 가져오기 실패:', locationError.message);
      }

      // 5. 위치 정보 성공/실패에 따른 처리
      if (locationSuccess && location?.coords) {
        // 5-1. 위치 정보 획득 성공 - 새로운 매장 데이터 검색
        const { latitude, longitude } = location.coords;
        console.log('[App] 사용 위치:', latitude, longitude);

        // 브랜드별 주변 매장 검색
        const storeResults = [];

        for (const brand of brandsList) {
          try {
            const response = await fetch(
              `https://dapi.kakao.com/v2/local/search/keyword.json?` +
                `query=${encodeURIComponent(brand.brandName)}&` +
                `x=${longitude}&` +
                `y=${latitude}&` +
                `radius=500&` +
                `sort=distance`,
              {
                headers: {
                  Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
                },
              }
            );

            if (!response.ok) {
              console.log(`[App] ${brand.brandName} 검색 실패:`, response.status);
              continue;
            }

            const data = await response.json();
            // console.log(`[App] ${brand.brandName} 검색 결과: ${data.documents.length}개 매장`);

            if (data.documents.length > 0) {
              storeResults.push({
                brandId: brand.brandId,
                brandName: brand.brandName,
                stores: data.documents,
              });
            }
          } catch (error) {
            console.error(`[App] ${brand.brandName} 검색 중 오류:`, error);
          }
        }

        // 새 매장 데이터 저장 및 지오펜스 설정
        if (storeResults.length > 0) {
          // console.log(
          //   '[App] 총 매장 데이터:',
          //   storeResults.reduce((sum, brand) => sum + brand.stores.length, 0)
          // );

          // AsyncStorage에 저장
          await AsyncStorage.setItem('GEOFENCE_STORE_DATA', JSON.stringify(storeResults));
          // console.log('[App] 새 매장 데이터 저장 완료');

          // 지오펜싱 서비스에 데이터 설정 및 지오펜스 등록
          if (geofencingServiceRef.current) {
            geofencingServiceRef.current.brandStores = storeResults;
            await geofencingServiceRef.current.setupGeofences(storeResults);

            // 설정 확인
            const geofences = await Geofencing.getRegisteredGeofences();
            console.log('[App] 지오펜스 설정 완료:', geofences?.length || 0);
          }
        } else {
          console.log('[App] 주변에 매장 없음');

          // 새 매장 데이터가 없지만 기존 데이터가 있으면 기존 데이터 사용
          if (existingStores && existingStores.length > 0 && geofencingServiceRef.current) {
            console.log('[App] 주변 매장이 없어 기존 매장 데이터 유지');
            geofencingServiceRef.current.brandStores = existingStores;
            await geofencingServiceRef.current.setupGeofences(existingStores);
          }
        }
      } else if (existingStores && existingStores.length > 0) {
        // 5-2. 위치 정보 획득 실패했지만 기존 데이터가 있는 경우
        console.log('[App] 위치 정보 획득 실패, 기존 매장 데이터 사용');

        if (geofencingServiceRef.current) {
          geofencingServiceRef.current.brandStores = existingStores;
          await geofencingServiceRef.current.setupGeofences(existingStores);

          // 설정 확인
          const geofences = await Geofencing.getRegisteredGeofences();
          console.log('[App] 기존 데이터로 지오펜스 설정 완료:', geofences?.length || 0);
        }
      } else {
        // 5-3. 위치 정보 획득 실패하고 기존 데이터도 없는 경우
        // console.log('[App] 위치 정보 획득 실패 & 기존 매장 데이터 없음');
        Alert.alert(
          '위치 정보 필요',
          '주변 매장 알림을 받으려면 위치 권한과 위치 서비스가 필요합니다. 설정에서 위치 서비스를 켜고 앱을 다시 실행해주세요.',
          [{ text: '확인', style: 'default' }]
        );
      }
    } catch (error) {
      console.error('[App] 초기 매장 데이터 로드 중 오류:', error);
    }
  };

  // 지오펜싱 초기화 함수
  const initializeGeofencing = async () => {
    try {
      // console.log('[App] 지오펜싱 서비스 초기화 시작');

      // 1. 지오펜싱 서비스 인스턴스 생성
      if (!geofencingServiceRef.current) {
        geofencingServiceRef.current = new GeofencingService();
        // console.log('[App] 지오펜싱 서비스 인스턴스 생성됨');
      }

      // 2. 위치 권한 요청
      const hasPermission = await LocationService.requestLocationPermissions();
      if (!hasPermission) {
        console.log('[App] 위치 권한 획득 실패, 지오펜싱 기능이 제한됩니다');
        return;
      }

      // 3. 저장된 기프티콘 데이터 로드
      const storedGifticons = await AsyncStorage.getItem('USER_GIFTICONS');
      if (storedGifticons) {
        try {
          const gifticons = JSON.parse(storedGifticons);
          if (Array.isArray(gifticons) && gifticons.length > 0) {
            geofencingServiceRef.current.updateUserGifticons({ gifticons });
            // console.log('[App] 저장된 기프티콘 로드됨:', gifticons.length);

            // 저장된 기프티콘 목록을 앱 재시작 후에도 사용할 수 있도록 AsyncStorage에 유지
            await AsyncStorage.setItem('USER_GIFTICONS', JSON.stringify(gifticons));
          } else {
            console.log('[App] 유효한 기프티콘 데이터가 없습니다');
          }
        } catch (error) {
          console.error('[App] 저장된 기프티콘 파싱 오류:', error);
        }
      } else {
        console.log('[App] 저장된 기프티콘 데이터가 없습니다');
      }

      // 4. 지오펜싱 서비스 초기화
      await geofencingServiceRef.current.initGeofencing();
      console.log('[App] 지오펜싱 서비스 초기화됨');

      // 5. 매장 데이터 로드 및 지오펜스 설정
      await fetchInitialStoreData();

      // 6. Expo 위치 추적 시작
      await LocationService.startBackgroundLocationTracking();
      // console.log('[App] Expo 백그라운드 위치 추적 시작됨');

      // 7. 네이티브 알람 시작 (Not Running 상태에서도 동작하기 위함)
      if (Platform.OS === 'android' && LocationAlarmModule) {
        const alarmStarted = await LocationService.startLocationAlarm();
        // console.log('[App] 네이티브 위치 알람 시작 ' + (alarmStarted ? '성공' : '실패'));
      }

      console.log('[App] 지오펜싱 초기화 완료');
    } catch (error) {
      console.error('[App] 지오펜싱 초기화 오류:', error);
    }
  };

  // 앱 초기화 시 인증 상태 복원 및 지오펜싱 초기화
  useEffect(() => {
    const init = async () => {
      await restoreAuth(); // Zustand의 토큰 복원(비동기)

      // 지오펜싱 초기화
      await initializeGeofencing();

      // 복원이 끝난 뒤에만 딥링크 처리
      Linking.getInitialURL().then(url => {
        if (url) {
          NavigationService.handleDeepLink(url);
        }
      });
      // 실시간 딥링크(앱 실행 중)도 동일하게 처리
      const subscription = Linking.addEventListener('url', event => {
        NavigationService.handleDeepLink(event.url);
      });
      return () => subscription.remove();
    };
    init();
  }, []);

  // 공유 인텐트(이미지) 처리
  useEffect(() => {
    ShareMenu.getInitialShare(item => {
      if (item && item.data && item.mimeType && item.mimeType.startsWith('image/')) {
        // navigationReady가 false면 일단 보류
        if (!navigationReady) {
          setPendingShareItem(item);
        } else {
          navigationRef.current?.navigate('Register', { sharedImageUri: item.data });
        }
      }
    });

    const listener = ShareMenu.addNewShareListener(item => {
      if (item && item.data && item.mimeType && item.mimeType.startsWith('image/')) {
        navigationRef.current?.navigate('Register', { sharedImageUri: item.data });
      }
    });

    return () => {
      listener.remove();
    };
  }, [navigationReady]);

  // navigationReady가 true가 되면 보류된 공유 인텐트 처리
  useEffect(() => {
    if (navigationReady && pendingShareItem) {
      navigationRef.current?.navigate('Register', { sharedImageUri: pendingShareItem.data });
      setPendingShareItem(null);
    }
  }, [navigationReady, pendingShareItem]);

  // 앱 상태 변경 감지 (백그라운드에서 포그라운드로)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && geofencingServiceRef.current) {
        // 앱이 포그라운드로 돌아왔을 때 지오펜싱 초기화 상태 확인
        if (!geofencingServiceRef.current.initialized) {
          console.log('[App] 앱 활성화 상태 - 지오펜싱 초기화');
          geofencingServiceRef.current.initGeofencing();
        }

        // 앱이 돌아왔을 때 매장 데이터 갱신 (선택적)
        fetchInitialStoreData();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // 폰트 및 인증 상태 로딩 함수
  const loadResources = async () => {
    try {
      // 폰트 로딩
      await Font.loadAsync({
        'Pretendard-Thin': require('./src/assets/fonts/Pretendard-Thin.otf'),
        'Pretendard-ExtraLight': require('./src/assets/fonts/Pretendard-ExtraLight.otf'),
        'Pretendard-Light': require('./src/assets/fonts/Pretendard-Light.otf'),
        'Pretendard-Regular': require('./src/assets/fonts/Pretendard-Regular.otf'),
        'Pretendard-Medium': require('./src/assets/fonts/Pretendard-Medium.otf'),
        'Pretendard-SemiBold': require('./src/assets/fonts/Pretendard-SemiBold.otf'),
        'Pretendard-Bold': require('./src/assets/fonts/Pretendard-Bold.otf'),
        'Pretendard-ExtraBold': require('./src/assets/fonts/Pretendard-ExtraBold.otf'),
        'Pretendard-Black': require('./src/assets/fonts/Pretendard-Black.otf'),
      });

      // 인증 상태 복원
      await restoreAuth();
    } catch (error) {
      console.error('리소스 로딩 중 오류 발생:', error);
    } finally {
      setIsReady(true);
    }
  };

  // 앱 초기화 시 리소스 로드
  useEffect(() => {
    loadResources();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    // 모든 리소스가 준비되었을 때만 스플래시 화면 숨기기
    if (isReady) {
      try {
        await SplashScreen.hideAsync();
      } catch (e) {
        console.error('스플래시 화면 숨기기 실패:', e);
      }
    }
  }, [isReady]);

  // 리소스 로딩이 완료될 때까지 아무것도 렌더링하지 않음
  if (!isReady) {
    return null;
  }

  return (
    <AppWrapper>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* React Query Provider 추가 */}
        <AppQueryClientProvider>
          <ThemeProvider theme={theme}>
            <SafeAreaProvider>
              <View style={styles.container} onLayout={onLayoutRootView}>
                <HeaderBarProvider>
                  <TabBarProvider>
                    <NavigationContainer
                      ref={navigationRef}
                      linking={linking}
                      onReady={() => setNavigationReady(true)}
                    >
                      <AppNavigator />
                      {/* 네이티브 알림 리스너 추가 */}
                      <NotificationListener />
                      <StatusBar style="auto" />
                    </NavigationContainer>
                  </TabBarProvider>
                </HeaderBarProvider>
              </View>
            </SafeAreaProvider>
          </ThemeProvider>
        </AppQueryClientProvider>
        {/* Toast 메시지 컴포넌트 추가 */}
        <Toast config={toastConfig} />
      </GestureHandlerRootView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
