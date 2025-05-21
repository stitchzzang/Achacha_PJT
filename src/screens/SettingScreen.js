import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Modal,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  NativeEventEmitter,
  NativeModules,
  StatusBar,
  InteractionManager,
} from 'react-native';
import { useTheme, Icon } from 'react-native-elements';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBar } from '../context/TabBarContext';
import { Divider, Text, Button, AlertDialog } from '../components/ui';
import Switch from '../components/ui/Switch';
import { Svg, Path, Line } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchUserById, logout as logoutApi } from '../api/userInfo';
import { ERROR_MESSAGES } from '../constants/errorMessages';
import { getFcmToken } from '../services/NotificationService';
import useAuthStore from '../store/authStore';
import useNotificationStore from '../store/notificationStore';
import GeofencingService from '../services/GeofencingService';
import { geoNotificationService } from '../services/geoNotificationService';
import LocationService from '../services/locationAlarmService';

// 알림 타입 enum (API와 일치)
const NOTIFICATION_TYPES = {
  LOCATION_BASED: 'LOCATION_BASED', // 근접 매장 알림
  EXPIRY_DATE: 'EXPIRY_DATE', // 유효기간 만료 알림
  RECEIVE_GIFTICON: 'RECEIVE_GIFTICON', // 선물 뿌리기 알림
  USAGE_COMPLETE: 'USAGE_COMPLETE', // 사용완료 여부 알림
  SHAREBOX_GIFTICON: 'SHAREBOX_GIFTICON', // 쉐어박스 기프티콘 등록 알림
  SHAREBOX_USAGE_COMPLETE: 'SHAREBOX_USAGE_COMPLETE', // 쉐어박스 기프티콘 사용 알림
  SHAREBOX_MEMBER_JOIN: 'SHAREBOX_MEMBER_JOIN', // 쉐어박스 멤버 참여 알림
  SHAREBOX_DELETED: 'SHAREBOX_DELETED', // 쉐어박스 그룹 삭제 알림
};

// 알림 주기 enum (API와 일치) - 현재 코드에서는 직접 사용하지 않음/* const EXPIRATION_CYCLES = {  ONE_DAY: 'ONE_DAY', // 1일  TWO_DAYS: 'TWO_DAYS', // 2일  THREE_DAYS: 'THREE_DAYS', // 3일  ONE_WEEK: 'ONE_WEEK', // 7일  ONE_MONTH: 'ONE_MONTH', // 30일  TWO_MONTHS: 'TWO_MONTHS', // 60일  THREE_MONTHS: 'THREE_MONTHS', // 90일};*/

/* 현재 사용하지 않는 매핑// 마커 값에 따른 알림 주기 매핑const MARKER_TO_CYCLE = {  0: 'ONE_DAY', // 당일 또는 1일  1: 'ONE_DAY', // 1일  2: 'TWO_DAYS', // 2일  3: 'THREE_DAYS', // 3일  7: 'ONE_WEEK', // 7일  30: 'ONE_MONTH', // 30일  60: 'TWO_MONTHS', // 60일  90: 'THREE_MONTHS', // 90일};// 알림 주기에 따른 마커 값 매핑const CYCLE_TO_MARKER = {  'ONE_DAY': 1,  'TWO_DAYS': 2,  'THREE_DAYS': 3,  'ONE_WEEK': 7,  'ONE_MONTH': 30,  'TWO_MONTHS': 60,  'THREE_MONTHS': 90,};*/

// 슬라이더 마커 값
const markers = [0, 1, 2, 3, 7, 30, 60, 90];

const SettingScreen = () => {
  const { theme } = useTheme();
  const { WearSyncModule } = NativeModules;
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets(); // 안전 영역 정보 가져오기
  const { hideTabBar, showTabBar } = useTabBar();

  // 라우트 파라미터에서 keepTabBarVisible 옵션 확인
  const keepTabBarVisible = route.params?.keepTabBarVisible || false;

  // Zustand 스토어에서 알림 설정 상태 및 함수 가져오기
  const {
    expiryNotification,
    giftSharingNotification,
    nearbyStoreNotification,
    expiryNotificationInterval,
    usageCompletionNotification,
    shareboxGiftRegistration,
    shareboxGiftUsage,
    shareboxMemberJoin,
    shareboxGroupDelete,
    error,
    fetchNotificationSettings,
    updateNotificationTypeStatus,
    updateExpirationCycle,
    loadLocalExpirationCycle,
  } = useNotificationStore();

  // 로그인 타입 (추후 API 연동 시 실제 데이터로 대체)
  // eslint-disable-next-line no-unused-vars
  const [loginType, setLoginType] = useState('kakao'); // 'kakao' 또는 'google'
  const [nickname, setNickname] = useState('');

  // 워치 모달 상태
  const [watchModalVisible, setWatchModalVisible] = useState(false);
  const [connectionStep, setConnectionStep] = useState(0); // 0: 초기, 1: 연결 중, 2: 연결 완료

  // 편집 모드 상태 추가
  const [editingInterval, setEditingInterval] = useState(false);
  // 임시 값을 저장할 상태 추가
  const [tempExpiryInterval, setTempExpiryInterval] = useState(7);

  // 알림 다이얼로그 상태 추가
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState('info');
  const [alertCallback, setAlertCallback] = useState(() => {});

  // 알림 다이얼로그 표시 함수
  const showAlert = (title, message, callback = () => {}, type = 'info') => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertCallback(() => callback);
    setAlertType(type);
    setAlertVisible(true);
  };

  // 뒤로가기 처리
  const handleGoBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // 알림 설정 토글 핸들러 함수
  const handleNotificationToggle = useCallback(
    async (type, enabled) => {
      console.log(`[알림설정] ${type} 알림 상태 변경 요청:`, enabled);

      // 낙관적 UI 업데이트 - 상태를 즉시 변경하여 깜빡임 방지
      // 스토어에서 제공하는 함수를 직접 호출하지 않고, 내부 구현에서 처리
      const updateOptimistically = async () => {
        // 해당 타입의 상태값을 직접 가져와서 현재 어떤 상태인지 확인
        let currentState = false;

        switch (type) {
          case NOTIFICATION_TYPES.EXPIRY_DATE:
            currentState = expiryNotification;
            break;
          case NOTIFICATION_TYPES.LOCATION_BASED:
            currentState = nearbyStoreNotification;
            break;
          case NOTIFICATION_TYPES.USAGE_COMPLETE:
            currentState = usageCompletionNotification;
            break;
          case NOTIFICATION_TYPES.RECEIVE_GIFTICON:
            currentState = giftSharingNotification;
            break;
          case NOTIFICATION_TYPES.SHAREBOX_GIFTICON:
            currentState = shareboxGiftRegistration;
            break;
          case NOTIFICATION_TYPES.SHAREBOX_USAGE_COMPLETE:
            currentState = shareboxGiftUsage;
            break;
          case NOTIFICATION_TYPES.SHAREBOX_MEMBER_JOIN:
            currentState = shareboxMemberJoin;
            break;
          case NOTIFICATION_TYPES.SHAREBOX_DELETED:
            currentState = shareboxGroupDelete;
            break;
          default:
            break;
        }

        // 이미 같은 상태면 아무것도 하지 않음 (중복 호출 방지)
        if (currentState === enabled) {
          return true;
        }

        try {
          // API 호출하여 설정 업데이트
          const success = await updateNotificationTypeStatus(type, enabled);

          if (!success && error) {
            // 실패 시 이전 상태로 되돌리기 위한 알림
            showAlert('알림 설정 실패', error);
            return false;
          }

          return success;
        } catch (err) {
          console.error('[알림설정] 토글 오류:', err);
          showAlert('오류', '알림 설정 변경 중 문제가 발생했습니다.');
          return false;
        }
      };

      updateOptimistically();
    },
    [
      expiryNotification,
      nearbyStoreNotification,
      usageCompletionNotification,
      giftSharingNotification,
      shareboxGiftRegistration,
      shareboxGiftUsage,
      shareboxMemberJoin,
      shareboxGroupDelete,
      updateNotificationTypeStatus,
      error,
    ]
  );

  // 수정/저장 버튼 클릭 핸들러
  const handleEditSaveClick = useCallback(async () => {
    if (editingInterval) {
      // 저장 모드 - API 호출하여 서버에 저장
      console.log('[알림설정] 알림 주기 변경 저장:', tempExpiryInterval);

      try {
        const success = await updateExpirationCycle(tempExpiryInterval);

        if (success) {
          // 저장 성공 시 모드 전환 즉시 진행
          setEditingInterval(false);
          showAlert('설정 완료', '알림 주기가 설정되었습니다.');
        } else if (error) {
          showAlert('알림 주기 설정 실패', error);
        }
      } catch (err) {
        console.error('[알림설정] 저장 중 오류:', err);
        showAlert('오류', '알림 주기 설정 중 오류가 발생했습니다.');
      }
    } else {
      // 수정 모드로 전환 - 현재 서버에 저장된 값으로 슬라이더 초기화
      setTempExpiryInterval(expiryNotificationInterval);
      console.log('[알림설정] 수정 모드 전환, 현재 값:', expiryNotificationInterval);
      // 모드 전환
      setEditingInterval(true);
    }
  }, [
    editingInterval,
    tempExpiryInterval,
    expiryNotificationInterval,
    updateExpirationCycle,
    error,
  ]);

  // Google 로고 SVG 컴포넌트
  // eslint-disable-next-line react/no-unstable-nested-components
  const GoogleLogo = () => (
    <Svg width="20" height="20" viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );

  // 워치 연결 모달 열기
  const openWatchModal = () => {
    setWatchModalVisible(true);
    setConnectionStep(0);
  };

  // 워치 연결 시작
  const startConnection = async () => {
    setConnectionStep(1);

    if (Platform.OS !== 'android') {
      showAlert('미지원', 'Nearby Advertising은 안드로이드에서만 사용 가능합니다.');
      setConnectionStep(0);
      return;
    }

    try {
      // 필요한 권한 목록 정의
      const permissionsToRequest = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];

      const granted = await PermissionsAndroid.requestMultiple(permissionsToRequest);

      // 모든 필수 권한이 승인되었는지 확인
      const allPermissionsGranted =
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
          PermissionsAndroid.RESULTS.GRANTED;

      if (allPermissionsGranted) {
        const result = await WearSyncModule.startNearbyAdvertising();
        console.log('[Nearby] Advertising started:', result);
      } else {
        showAlert('권한 거부됨', '워치 연결을 시작하려면 필요한 모든 권한이 필요합니다.');
        setConnectionStep(0);
      }
    } catch (error) {
      console.error('[Nearby] Failed to start advertising:', error);
      showAlert('오류', '워치 연결 중 오류가 발생했습니다: ' + error.message);
      setConnectionStep(0);
    }
  };

  // 워치 연결 모달 닫기
  const closeWatchModal = async () => {
    if (connectionStep === 2) {
      try {
        await WearSyncModule.stopNearbyAdvertising();
        console.log('[Nearby] Advertising stopped');
      } catch (error) {
        console.error('[Nearby] Failed to stop advertising:', error);
      }
    } else if (connectionStep === 1) {
      // 연결 중 상태에서 취소 시에도 광고 중지
      try {
        await WearSyncModule.stopNearbyAdvertising();
        console.log('[Nearby] Advertising stopped');
      } catch (error) {
        console.error('[Nearby] Failed to stop advertising:', error);
      }
    }
    setWatchModalVisible(false);
    setConnectionStep(0);
  };

  // 모달 내용 렌더링
  const renderModalContent = () => {
    // 초기 연결 화면
    if (connectionStep === 0) {
      return (
        <>
          <View style={styles.modalContent}>
            <View style={styles.watchImageContainer}>
              <Image
                source={require('../assets/images/watch.png')}
                style={styles.watchImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.modalText}>스마트 워치에서 연결하기 버튼을 눌러주세요.</Text>
          </View>
          <View style={styles.modalFooter}>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.buttonContainer, styles.cancelButton]}
                onPress={closeWatchModal}
              >
                <Text style={styles.cancelbuttonText}>취소</Text>
              </TouchableOpacity>
              <View style={styles.buttonSpacer} />
              <TouchableOpacity
                style={[styles.buttonContainer, styles.connectButton]}
                onPress={startConnection}
              >
                <Text style={styles.buttonText}>연결</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      );
    }

    // 연결 중 화면
    else if (connectionStep === 1) {
      return (
        <>
          <View style={styles.modalContent}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>연결 중입니다...</Text>
            </View>
          </View>
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.confirmButton, { marginTop: 10 }]}
              onPress={closeWatchModal}
            >
              <Text style={styles.buttonText}>취소</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }

    // 연결 완료 화면
    else if (connectionStep === 2) {
      return (
        <>
          <View style={styles.modalContent}>
            <View style={styles.successContainer}>
              <View style={styles.watchImageContainer}>
                <Image
                  source={require('../assets/images/watch.png')}
                  style={styles.watchImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.successText}>성공적으로 연결이 완료되었습니다.</Text>
            </View>
          </View>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.confirmButton} onPress={closeWatchModal}>
              <Text style={styles.buttonText}>확인</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }
  };

  useEffect(() => {
    if (Platform.OS === 'android' && WearSyncModule) {
      const eventEmitter = new NativeEventEmitter(WearSyncModule);
      const subscription = eventEmitter.addListener('NearbyConnected', event => {
        // event.endpointId가 특정 값이어야만 성공 처리 등 추가 검증 가능
        if (event && event.endpointId) {
          setConnectionStep(2);
        } else {
          // 연결 실패 처리
          showAlert('연결 실패', '실제 연결이 성립되지 않았습니다.');
        }
      });
      return () => subscription.remove();
    }
  }, []);

  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        if (!userId) return;
        const user = await fetchUserById(userId);
        setNickname(user.userName);
      } catch (e) {
        const errorCode = e?.response?.data?.errorCode;
        let message = '유저 정보 조회에 실패했습니다.';
        if (errorCode && ERROR_MESSAGES[errorCode]) {
          message = ERROR_MESSAGES[errorCode];
        } else if (e?.response?.data?.message) {
          message = e.response.data.message;
        }
        showAlert('오류', message);
        console.error('유저 정보 조회 실패:', e);
      }
    };
    fetchUserName();
  }, []);

  // 앱 시작 시 로컬 설정 및 서버 설정 로드
  useEffect(() => {
    const initSettings = async () => {
      try {
        // 로컬 저장소에서 알림 주기 값 로드
        await loadLocalExpirationCycle();

        // 서버에서 모든 알림 설정 로드
        await fetchNotificationSettings();
      } catch (e) {
        console.error('[알림설정] 설정 초기화 실패:', e);
      }
    };

    initSettings();
  }, [loadLocalExpirationCycle, fetchNotificationSettings]);

  // 앱 시작 시 tempExpiryInterval 초기화
  useEffect(() => {
    // 앱 시작 시 서버 값으로 tempExpiryInterval 초기화
    setTempExpiryInterval(expiryNotificationInterval);
  }, [expiryNotificationInterval]);

  // 탭바 처리 - 화면 진입 시 및 이탈 시
  useEffect(() => {
    // 애니메이션이 완료된 후에 탭바 숨기기
    const interactionComplete = InteractionManager.runAfterInteractions(() => {
      if (!keepTabBarVisible) {
        hideTabBar();
      }
    });

    // 화면 이탈 시 탭바 복원 및 리소스 정리
    return () => {
      interactionComplete.cancel();
      showTabBar();
    };
  }, [hideTabBar, showTabBar, keepTabBarVisible]);

  // 로그아웃 핸들러
  const handleLogout = async () => {
    try {
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      let fcmToken = await AsyncStorage.getItem('fcmToken');
      const bleToken = await AsyncStorage.getItem('bleToken');
      // fcmToken이 저장소에 없으면 서비스에서 직접 가져오기
      if (!fcmToken) {
        fcmToken = await getFcmToken();
      }
      console.log('현재 저장된 FCM 토큰:', fcmToken);
      if (!refreshToken || !fcmToken) {
        showAlert('오류', '로그아웃 정보가 올바르지 않습니다.');
        return;
      }
      await logoutApi(refreshToken, fcmToken, bleToken);
      // 토큰 등 인증정보 삭제
      await AsyncStorage.removeItem('accessToken');
      await AsyncStorage.removeItem('refreshToken');
      await AsyncStorage.removeItem('bleToken');
      await AsyncStorage.removeItem('userId');
      await AsyncStorage.removeItem('fcmToken');

      // zustand 상태도 초기화
      await useAuthStore.getState().logout();

      showAlert('알림', '로그아웃 되었습니다.', () => {
        // 필요시 로그인 화면 등으로 이동
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      });
    } catch (e) {
      console.error('로그아웃 실패:', e);
      showAlert('오류', '로그아웃에 실패했습니다.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />

      {/* 안전 영역 고려한 상단 여백 */}
      <View style={{ height: insets.top, backgroundColor: theme.colors.background }} />

      {/* 커스텀 헤더 */}
      <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
        <Button
          variant="ghost"
          onPress={handleGoBack}
          style={styles.backButton}
          leftIcon={
            <Icon name="arrow-back-ios" type="material" size={22} color={theme.colors.black} />
          }
        />
        <Text variant="h3" style={styles.headerTitle}>
          설정
        </Text>
        <View style={styles.emptyRightSpace} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* 회원정보 섹션 */}
        <View style={styles.section}>
          <Text variant="h3" style={styles.sectionTitle}>
            회원정보
          </Text>
          <View style={styles.infoItem}>
            <Text variant="body1" color="grey3" style={styles.infoLabel}>
              연결된 소셜 서비스
            </Text>
            <View style={styles.socialServiceContainer}>
              {loginType === 'kakao' ? (
                <>
                  <Image
                    source={require('../assets/images/login_kakaotalk.png')}
                    style={styles.socialIcon}
                    resizeMode="contain"
                  />
                  <Text variant="body1" style={styles.infoValue}>
                    카카오톡
                  </Text>
                </>
              ) : (
                <>
                  <GoogleLogo />
                  <Text variant="body1" style={styles.infoValue2}>
                    Google
                  </Text>
                </>
              )}
            </View>
          </View>
          <View style={styles.infoItem}>
            <Text variant="body1" color="grey3" style={styles.infoLabel}>
              닉네임
            </Text>
            <Text variant="body1" style={styles.infoValue}>
              {nickname || '-'}
            </Text>
          </View>
        </View>

        {/* 회원정보와 알림 사이 구분선 */}
        <Divider style={styles.sectionDivider} />

        {/* 알림 섹션 */}
        <View style={styles.section}>
          <Text variant="h3" style={styles.sectionTitle}>
            알림
          </Text>

          {/* 유효기간 만료 알림 */}
          <View style={styles.notificationItem}>
            <View style={styles.notificationInfo}>
              <Text variant="body1" style={styles.notificationLabel}>
                유효기간 만료 알림
              </Text>
              <Text variant="caption" color="grey3" style={styles.notificationDescription}>
                유효기간 임박 시 알림
              </Text>
            </View>
            <Switch
              value={expiryNotification}
              onValueChange={value => {
                // 낙관적 UI 업데이트를 위해 상태를 먼저 변경
                useNotificationStore.setState(state => ({
                  ...state,
                  expiryNotification: value,
                }));
                handleNotificationToggle(NOTIFICATION_TYPES.EXPIRY_DATE, value);
              }}
            />
          </View>

          {/* 유효기간 알림 주기 설정 - 만료 알림이 활성화된 경우에만 표시 */}
          {expiryNotification && (
            <View style={styles.sliderContainer}>
              <View style={styles.notificationTitleRow}>
                <View style={styles.notificationInfo}>
                  <Text variant="body1" style={styles.notificationLabel}>
                    유효기간 알림 주기 설정
                  </Text>
                  <Text variant="caption" color="grey3" style={styles.notificationDescription}>
                    만료 알림은 오전 9시 전송, 당일/1/2/3/7/30/60/90일 단위
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.editSaveButton,
                    editingInterval ? styles.saveButton : styles.editButton,
                  ]}
                  onPress={handleEditSaveClick}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.editSaveButtonText,
                      editingInterval ? styles.saveButtonText : styles.editButtonText,
                    ]}
                  >
                    {editingInterval ? '저장' : '수정'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.customSliderContainer,
                  editingInterval ? styles.activeSlider : styles.disabledSlider,
                ]}
              >
                <View style={styles.adjustmentTextContainer}>
                  <Text
                    variant="body1"
                    weight="medium"
                    color="#56AEE9"
                    style={styles.adjustmentText}
                  >
                    {tempExpiryInterval === 0
                      ? '당일만'
                      : `당일 ~ ${tempExpiryInterval === 1 ? '1일 전' : tempExpiryInterval === 2 ? '2일 전' : tempExpiryInterval === 3 ? '3일 전' : tempExpiryInterval === 7 ? '일주일 전' : tempExpiryInterval === 30 ? '30일 전' : tempExpiryInterval === 60 ? '60일 전' : tempExpiryInterval === 90 ? '90일 전' : `${tempExpiryInterval}일 전`}`}
                  </Text>
                </View>

                <View style={styles.markersContainer}>
                  {/* 연결선 추가 - 배경에 깔리는 회색 선 */}
                  <Svg height="30" width="100%" style={styles.markerLine}>
                    <Line x1="15" y1="15" x2="95%" y2="15" stroke="#E0E0E0" strokeWidth="2" />
                    {/* 활성화된 연결선 - 선택된 마커까지의 선 */}
                    <Line
                      x1="15"
                      y1="15"
                      x2={`${(markers.indexOf(tempExpiryInterval) / (markers.length - 1)) * 90 + 5}%`}
                      y2="15"
                      stroke="#56AEE9"
                      strokeWidth="2"
                    />
                  </Svg>

                  {markers.map((val, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => {
                        if (editingInterval) {
                          setTempExpiryInterval(val);
                        }
                      }}
                      disabled={!editingInterval}
                      style={styles.markerTouchable}
                    >
                      <View
                        style={[
                          styles.marker,
                          tempExpiryInterval >= val && styles.activeMarker,
                          !editingInterval && styles.disabledMarker,
                        ]}
                      >
                        <Text
                          style={[
                            styles.markerText,
                            tempExpiryInterval >= val && styles.activeMarkerText,
                            !editingInterval && styles.disabledMarkerText,
                          ]}
                        >
                          {val}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* 주변 매장 알림 */}
          <View style={styles.notificationItem}>
            <View style={styles.notificationInfo}>
              <Text variant="body1" style={styles.notificationLabel}>
                주변 매장 알림
              </Text>
              <Text variant="caption" color="grey3" style={styles.notificationDescription}>
                각 매장 기준 50m 이내 접근 시 알림
              </Text>
            </View>
            <Switch
              value={nearbyStoreNotification}
              onValueChange={async value => {
                // 낙관적 UI 업데이트를 위해 상태를 먼저 변경
                useNotificationStore.setState(state => ({
                  ...state,
                  nearbyStoreNotification: value,
                }));
                // API 호출
                await handleNotificationToggle(NOTIFICATION_TYPES.LOCATION_BASED, value);

                // 스위치가 켜질 때만 위치 추적 시작 및 geoNotificationService 호출
                if (value) {
                  try {
                    // 위치 추적 시작
                    await LocationService.startAllLocationServices();

                    const gifticons = await AsyncStorage.getItem('USER_GIFTICONS');
                    if (gifticons) {
                      const parsedGifticons = JSON.parse(gifticons);
                      if (parsedGifticons && parsedGifticons.length > 0) {
                        await geoNotificationService.requestGeoNotification(
                          parsedGifticons[0].gifticonId
                        );
                      }
                    }
                    const geofencingService = new GeofencingService();
                    await geofencingService.resetNotificationCooldowns();
                  } catch (error) {
                    console.error('주변 매장 알림 초기화 중 오류:', error);
                  }
                } else {
                  // 스위치가 꺼질 때는 위치 추적 중지
                  try {
                    await LocationService.stopAllLocationServices();
                  } catch (error) {
                    console.error('위치 추적 중지 중 오류:', error);
                  }
                }
              }}
            />
          </View>

          {/* 사용 완료 여부 알림 */}
          <View style={styles.notificationItem}>
            <View style={styles.notificationInfo}>
              <Text variant="body1" style={styles.notificationLabel}>
                사용완료 여부 알림
              </Text>
              <Text variant="caption" color="grey3" style={styles.notificationDescription}>
                사용완료 처리 여부 알림
              </Text>
            </View>
            <Switch
              value={usageCompletionNotification}
              onValueChange={value => {
                // 낙관적 UI 업데이트를 위해 상태를 먼저 변경
                useNotificationStore.setState(state => ({
                  ...state,
                  usageCompletionNotification: value,
                }));
                handleNotificationToggle(NOTIFICATION_TYPES.USAGE_COMPLETE, value);
              }}
            />
          </View>

          {/* 기프티콘 뿌리기 알림 */}
          <View style={styles.notificationItem}>
            <View style={styles.notificationInfo}>
              <Text variant="body1" style={styles.notificationLabel}>
                기프티콘 뿌리기 알림
              </Text>
              <Text variant="caption" color="grey3" style={styles.notificationDescription}>
                기프티콘 뿌리기 수신 알림
              </Text>
            </View>
            <Switch
              value={giftSharingNotification}
              onValueChange={value => {
                // 낙관적 UI 업데이트를 위해 상태를 먼저 변경
                useNotificationStore.setState(state => ({
                  ...state,
                  giftSharingNotification: value,
                }));
                handleNotificationToggle(NOTIFICATION_TYPES.RECEIVE_GIFTICON, value);
              }}
            />
          </View>

          {/* 쉐어박스 기프티콘 등록 알림 */}
          <View style={styles.notificationItem}>
            <View style={styles.notificationInfo}>
              <Text variant="body1" style={styles.notificationLabel}>
                쉐어박스 기프티콘 등록 알림
              </Text>
              <Text variant="caption" color="grey3" style={styles.notificationDescription}>
                쉐어박스 신규 기프티콘 등록 시 알림
              </Text>
            </View>
            <Switch
              value={shareboxGiftRegistration}
              onValueChange={value => {
                // 낙관적 UI 업데이트를 위해 상태를 먼저 변경
                useNotificationStore.setState(state => ({
                  ...state,
                  shareboxGiftRegistration: value,
                }));
                handleNotificationToggle(NOTIFICATION_TYPES.SHAREBOX_GIFTICON, value);
              }}
            />
          </View>

          {/* 쉐어박스 기프티콘 사용 알림 */}
          <View style={styles.notificationItem}>
            <View style={styles.notificationInfo}>
              <Text variant="body1" style={styles.notificationLabel}>
                쉐어박스 기프티콘 사용 알림
              </Text>
              <Text variant="caption" color="grey3" style={styles.notificationDescription}>
                쉐어박스 기프티콘 사용 완료 시 알림
              </Text>
            </View>
            <Switch
              value={shareboxGiftUsage}
              onValueChange={value => {
                // 낙관적 UI 업데이트를 위해 상태를 먼저 변경
                useNotificationStore.setState(state => ({
                  ...state,
                  shareboxGiftUsage: value,
                }));
                handleNotificationToggle(NOTIFICATION_TYPES.SHAREBOX_USAGE_COMPLETE, value);
              }}
            />
          </View>

          {/* 쉐어박스 멤버 참여 알림 */}
          <View style={styles.notificationItem}>
            <View style={styles.notificationInfo}>
              <Text variant="body1" style={styles.notificationLabel}>
                쉐어박스 멤버 참여 알림
              </Text>
              <Text variant="caption" color="grey3" style={styles.notificationDescription}>
                새 멤버 참여 시 알림
              </Text>
            </View>
            <Switch
              value={shareboxMemberJoin}
              onValueChange={value =>
                handleNotificationToggle(NOTIFICATION_TYPES.SHAREBOX_MEMBER_JOIN, value)
              }
            />
          </View>

          {/* 쉐어박스 그룹 삭제 알림 */}
          <View style={styles.notificationItem}>
            <View style={styles.notificationInfo}>
              <Text variant="body1" style={styles.notificationLabel}>
                쉐어박스 그룹 삭제 알림
              </Text>
              <Text variant="caption" color="grey3" style={styles.notificationDescription}>
                그룹 삭제 시 알림
              </Text>
            </View>
            <Switch
              value={shareboxGroupDelete}
              onValueChange={value =>
                handleNotificationToggle(NOTIFICATION_TYPES.SHAREBOX_DELETED, value)
              }
            />
          </View>
        </View>

        {/* 알림과 워치 섹션 사이 구분선 */}
        <Divider style={styles.sectionDivider} />

        {/* 워치 섹션 */}
        <View style={styles.section}>
          <Text variant="h3" style={styles.sectionTitle}>
            워치 설정
          </Text>
          <TouchableOpacity style={styles.watchItem} onPress={openWatchModal}>
            <View style={styles.notificationInfo}>
              <Text variant="body1" style={styles.notificationLabel}>
                워치 연결하기
              </Text>
              <Text variant="caption" color="grey3" style={styles.notificationDescription}>
                스마트폰과 워치 연동 설정
              </Text>
            </View>
            <View style={styles.arrowContainer}>
              <Text style={styles.arrowText}>{'>'}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 버튼 영역 */}
        <View style={styles.footerButtonsWrapper}>
          <TouchableOpacity style={styles.logoutTouchable} onPress={handleLogout}>
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 워치 연결 모달 */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={watchModalVisible}
        onRequestClose={closeWatchModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: 'white' }]}>
            {renderModalContent()}
          </View>
        </View>
      </Modal>

      {/* AlertDialog 추가 */}
      <AlertDialog
        isVisible={alertVisible}
        onBackdropPress={() => setAlertVisible(false)}
        onConfirm={() => {
          setAlertVisible(false);
          alertCallback();
        }}
        title={alertTitle}
        message={alertMessage}
        confirmText="확인"
        type={alertType}
        hideCancel={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  backButton: {
    padding: 0,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptyRightSpace: {
    width: 48,
    height: 48,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 10,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    marginBottom: 2,
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: 'semiBold',
  },
  infoValue: {
    fontSize: 16,
  },
  infoValue2: {
    fontsize: 16,
    marginLeft: 5,
  },
  notificationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    marginBottom: 10,
  },
  notificationInfo: {
    flex: 1,
  },
  notificationLabel: {
    fontSize: 16,
    marginBottom: 4,
  },
  notificationDescription: {
    fontSize: 12,
  },
  sliderContainer: {
    paddingVertical: 5,
    marginBottom: 5,
  },
  customSliderContainer: {
    marginTop: 15,
    marginBottom: 10,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 15,
    borderRadius: 10,
    backgroundColor: 'rgba(86, 174, 233, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(86, 174, 233, 0.2)',
  },
  footerButtonsWrapper: {
    marginVertical: 25,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutTouchable: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    width: '40%',
  },
  logoutText: {
    color: '#737373',
    fontSize: 18,
    textDecorationLine: 'underline',
  },
  sectionDivider: {
    marginBottom: 20,
    marginTop: 8,
  },
  watchItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    marginBottom: 4,
  },
  arrowContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    marginLeft: -30,
    fontSize: 20,
    color: '#aaa',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    width: '85%',
    borderRadius: 15,
    paddingHorizontal: 20,
    paddingVertical: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalContent: {
    marginBottom: 10,
    alignItems: 'center',
  },
  modalText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  modalFooter: {
    alignItems: 'center',
    width: '100%',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: 'rgba(86, 174, 233, 0.2)',
    color: '#278CCC',
    paddingHorizontal: 5,
    marginRight: 10,
  },
  cancelbuttonText: {
    color: '#278CCC',
    fontSize: 16,
    fontWeight: '600',
  },
  connectButton: {
    backgroundColor: '#56AEE9',
    paddingHorizontal: 5,
  },
  confirmButton: {
    backgroundColor: '#56AEE9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    width: '100%',
  },
  buttonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    flex: 1,
  },
  watchImageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  watchImage: {
    width: 150,
    height: 150,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  successText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  socialServiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  socialIcon: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  notificationTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  editSaveButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  editButton: {
    backgroundColor: '#E6F7FF',
    borderWidth: 1,
    borderColor: '#A7DAF9',
  },
  saveButton: {
    backgroundColor: '#56AEE9',
  },
  editSaveButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  editButtonText: {
    color: '#278CCC',
  },
  saveButtonText: {
    color: '#FFFFFF',
  },
  activeSlider: {
    backgroundColor: 'rgba(86, 174, 233, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(86, 174, 233, 0.2)',
  },
  disabledSlider: {
    opacity: 0.8,
  },
  adjustmentTextContainer: {
    alignItems: 'center',
    marginBottom: 15,
    width: '100%',
  },
  adjustmentText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    color: '#56AEE9',
  },
  markersContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    marginVertical: 5,
    width: '100%',
    position: 'relative',
    alignItems: 'center',
  },
  markerLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  markerTouchable: {
    zIndex: 1,
  },
  marker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(86, 174, 233, 0.1)',
    borderWidth: 1,
    borderColor: '#56AEE9',
  },
  activeMarker: {
    backgroundColor: '#A7DAF9',
    borderColor: '#278CCC',
  },
  disabledMarker: {
    opacity: 0.5,
  },
  markerText: {
    fontSize: 12,
    color: '#737373',
  },
  activeMarkerText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  disabledMarkerText: {
    color: '#999',
  },
});

export default SettingScreen;
