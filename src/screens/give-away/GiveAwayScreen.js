import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
  Text,
  Alert,
  StatusBar,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import GiveAwayGifticonList from '../../components/GiveAwayGifticonList';
import GifticonConfirmModal from '../../components/GifticonConfirmModal';
import Tooltip from '../../components/Tooltip';
import NoUsersScreen from './NoUsersScreen';
import LottieView from 'lottie-react-native';
import nearbyUsersService from '../../services/NearbyUsersService';
import { giveAwayService } from '../../services/giveAwayService';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useNavigation } from '@react-navigation/native';
import { mapGifticonService } from '../../services/mapGifticonService';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  withSequence,
} from 'react-native-reanimated';
import useGifticonListStore from '../../store/gifticonListStore';
import {
  BottomSheetModal,
  BottomSheetModalProvider,
  BottomSheetBackdrop,
} from '@gorhom/bottom-sheet';

const { width, height } = Dimensions.get('window');
const giveAwayButtonImg = require('../../assets/images/giveaway_button.png');
const emoji1 = require('../../assets/images/emoji1.png');
const emoji2 = require('../../assets/images/emoji2.png');
const emoji3 = require('../../assets/images/emoji3.png');
const emoji4 = require('../../assets/images/emoji4.png');
const emoji5 = require('../../assets/images/emoji5.png');

// 사용 가능한 이미지 (5개)
const availableImages = [emoji1, emoji2, emoji3, emoji4, emoji5];

// 사용 가능한 설명 (7개)
const availableDescriptions = [
  '익명의 도넛',
  '익명의 개구리',
  '익명의 그림자',
  '익명의 거북이',
  '익명의 만두',
  '익명의 펭귄',
  '익명의 유령',
];
const lottieAnimationSize = width * 1.2;

const GiveAwayScreen = ({ onClose }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState([]);
  const [userPositions, setUserPositions] = useState([]);
  const [userDataReady, setUserDataReady] = useState(false);
  const userPositionsRef = useRef([]);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [selectedGifticon, setSelectedGifticon] = useState(null);
  const [buttonVisible, setButtonVisible] = useState(false);
  const [centerButtonVisible, setCenterButtonVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const bleServiceRef = useRef(null);
  const navigation = useNavigation();
  const [giftSentUserId, setGiftSentUserId] = useState(null);
  const receivedUserPulse = useSharedValue(1);
  const receivedUserOpacity = useSharedValue(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipOpacityShared = useSharedValue(0);

  const [giveAwayGifticons, setGiveAwayGifticons] = useState({
    gifticons: [],
    hasNextPage: false,
    nextPage: null,
  });
  const [isLoadingGifticons, setIsLoadingGifticons] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [bluetoothReady, setBluetoothReady] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isGifticonsPreloaded, setIsGifticonsPreloaded] = useState(false);

  const buttonTranslateX = useSharedValue(0);
  const buttonTranslateY = useSharedValue(0);
  const buttonScale = useSharedValue(1);
  const buttonOpacity = useSharedValue(1);
  const gestureContext = useSharedValue({ startX: 0, startY: 0 });

  // BottomSheet 참조 및 스냅 포인트
  const bottomSheetModalRef = useRef(null);
  const snapPoints = ['35%']; // 바텀시트 높이 조절

  const renderBackdrop = useCallback(
    props => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5} // 배경 어둡게 처리
        pressBehavior="close" // 배경 클릭 시 닫기
      />
    ),
    []
  );

  const animatedButtonStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: buttonTranslateX.value },
        { translateY: buttonTranslateY.value },
        { scale: buttonScale.value },
      ],
      opacity: buttonOpacity.value,
    };
  });

  const receivedUserAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: receivedUserPulse.value }],
    };
  });

  const giftGlowAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: receivedUserOpacity.value,
    };
  });

  const centerX = width / 2;
  const centerY = height / 2;
  const smallestRadius = width * 0.15;
  const diameter = smallestRadius * 2;
  const circleSpacing = diameter * 0.7;
  const radiusArray = [
    smallestRadius,
    smallestRadius + circleSpacing,
    smallestRadius + circleSpacing * 2,
    smallestRadius + circleSpacing * 3,
  ];

  const secondCircleDiameter = radiusArray[1] * 2;

  const selectedGifticonRef = useRef(null);
  const usersRef = useRef([]);
  const userDataRef = useRef({
    hasSelectedGifticon: false,
    selectedGifticon: null,
    users: [],
    bleTokens: [],
    dataReady: false,
  });

  const calculateUserPositions = users => {
    if (userPositionsRef.current.length === users.length) {
      return userPositionsRef.current;
    }

    const positions = [];
    const startAngle = Math.random() * Math.PI * 2;
    const angleStep = (2 * Math.PI) / users.length;

    const maxAllowedPhysicalRadius = radiusArray[2];
    const emojiDisplayBaseSize = 90;
    const screenEdgePadding = 15;

    for (let i = 0; i < users.length; i++) {
      const distanceIndex = Math.floor(Math.random() * 3);

      let userRadius;
      const radiusVariation = Math.random() * 0.2 - 0.1;

      if (distanceIndex === 0) {
        userRadius = (smallestRadius + circleSpacing * 0.7) * (1 + radiusVariation);
      } else if (distanceIndex === 1) {
        userRadius = (smallestRadius + circleSpacing * 1.5) * (1 + radiusVariation);
      } else {
        userRadius = (smallestRadius + circleSpacing * 2.2) * (1 + radiusVariation);
      }

      userRadius = Math.min(userRadius, maxAllowedPhysicalRadius);

      const angleVariation = (Math.random() - 0.5) * (Math.PI / 12);
      const angle = startAngle + angleStep * i + angleVariation;

      let x = centerX + userRadius * Math.cos(angle);
      let y = centerY + userRadius * Math.sin(angle);

      const scale = 1 - distanceIndex * 0.15;
      const opacity = 1 - distanceIndex * 0.1;

      const currentEmojiSize = emojiDisplayBaseSize * scale;

      if (x - currentEmojiSize / 2 < screenEdgePadding) {
        x = screenEdgePadding + currentEmojiSize / 2;
      } else if (x + currentEmojiSize / 2 > width - screenEdgePadding) {
        x = width - screenEdgePadding - currentEmojiSize / 2;
      }

      if (y - currentEmojiSize / 2 < screenEdgePadding) {
        y = screenEdgePadding + currentEmojiSize / 2;
      } else if (y + currentEmojiSize / 2 > height - screenEdgePadding) {
        y = height - screenEdgePadding - currentEmojiSize / 2;
      }

      positions.push({ x, y, scale, opacity, distanceIndex });
    }

    userPositionsRef.current = positions;
    return positions;
  };

  useEffect(() => {
    if (users.length > 0) {
      const positions = calculateUserPositions(users);
      userPositionsRef.current = positions;
      setUserPositions(positions);

      setUserDataReady(true);
    } else {
      setUserPositions([]);
      userPositionsRef.current = [];
      setUserDataReady(false);
    }
  }, [users]);

  useEffect(() => {
    if (users.length > 0) {
      usersRef.current = users;
      userDataRef.current = {
        ...userDataRef.current,
        users: users,
        bleTokens: users.map(u => u.bleToken),
        dataReady: true,
      };
    }
  }, [users]);

  const onScanComplete = allUsers => {
    setIsScanning(false);
    setLoading(false);

    console.log('[BLE 탐색 결과] 전체 사용자 명단:', allUsers);
    if (allUsers && allUsers.length > 0) {
      const mappedUsers = allUsers
        .map((user, index) => {
          const randomImageIndex = Math.floor(Math.random() * availableImages.length);
          const randomDescriptionIndex = Math.floor(Math.random() * availableDescriptions.length);

          return {
            uuid: user.uuid || `user-${index}`,
            name: user.name || `사용자 ${index + 1}`,
            displayImageIndex: randomImageIndex,
            displayDescriptionIndex: randomDescriptionIndex,
            deviceId: user.deviceId || `device-${index}`,
            bleToken: user.bleToken || `token-${index}`,
          };
        })
        .slice(0, 5);

      console.log('[BLE 탐색 결과] 매핑된 사용자 명단:', mappedUsers);
      setUsers(mappedUsers);
      userDataRef.current = {
        ...userDataRef.current,
        users: mappedUsers,
        bleTokens: mappedUsers.map(user => user.bleToken),
        dataReady: true,
      };
      usersRef.current = mappedUsers;

      const hasSelectedGifticon = userDataRef.current.hasSelectedGifticon;
      setButtonVisible(mappedUsers.length > 0 && !hasSelectedGifticon);
      setCenterButtonVisible(mappedUsers.length > 0 && hasSelectedGifticon);

      const positions = calculateUserPositions(mappedUsers);
      setUserPositions(positions);
      userPositionsRef.current = positions;
      setUserDataReady(true);
    } else {
      setUsers([]);
      setUserPositions([]);
      userPositionsRef.current = [];
      userDataRef.current = {
        ...userDataRef.current,
        users: [],
        bleTokens: [],
        dataReady: false,
      };
      usersRef.current = [];
      setUserDataReady(false);
      setButtonVisible(false);
      setCenterButtonVisible(false);
    }
  };

  const startScanning = async () => {
    if (!bleServiceRef.current || isScanning) {
      // console.log(
      //   '[BLE 스캔] 스캔 시작 불가:',
      //   !bleServiceRef.current ? 'BLE 서비스가 초기화되지 않음' : '이미 스캔 중'
      // );
      setLoading(false);
      return;
    }

    try {
      setIsScanning(true);
      setLoading(true);

      let discoveredUsers = [];

      const onUserFound = user => {
        if (user && user.uuid && !discoveredUsers.some(u => u.uuid === user.uuid)) {
          discoveredUsers.push(user);
        }
      };

      await bleServiceRef.current.startScan(onUserFound, onScanComplete);

      setTimeout(() => {
        if (isScanning) {
          stopScanning();

          if (discoveredUsers.length === 0) {
            onScanComplete([]);
          }
        }
      }, 5000);
    } catch (error) {
      console.error('[BLE 스캔] 스캔 중 오류 발생:', error);
      setUsers([]);
      setUserPositions([]);
      userPositionsRef.current = [];
      setButtonVisible(false);
      setLoading(false);
      setIsScanning(false);
    }
  };

  const stopScanning = async () => {
    if (!bleServiceRef.current) {
      // console.log('[BLE 스캔] BLE 서비스가 초기화되지 않아 스캔 중지 불가');
      return;
    }

    try {
      console.log('[BLE 스캔] 스캔 중지 시도');
      await bleServiceRef.current.stopScan();
      setIsScanning(false);
      setLoading(false);
      console.log('[BLE 스캔] 스캔 중지 완료');
    } catch (error) {
      console.error('[BLE 스캔] 스캔 중지 중 오류 발생:', error.message);
      setIsScanning(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        bleServiceRef.current = nearbyUsersService;
        console.log('BLE 서비스 초기화 중...');

        // 위치 추적 중지 안전하게 처리
        try {
          if (bleServiceRef.current && bleServiceRef.current.stopLocationTracking) {
            await bleServiceRef.current.stopLocationTracking();
            console.log('위치 추적 중지됨');
          }
        } catch (err) {
          console.log('위치 추적 중지 시도 중 오류 (무시됨):', err.message);
        }

        try {
          await bleServiceRef.current.stopAdvertising();
          console.log('광고 중지됨');
        } catch (err) {
          console.log('광고 중지 시도 중 오류 (무시됨):', err.message);
        }

        const initResult = await bleServiceRef.current.initialize();
        setBluetoothReady(initResult);
        // console.log(`BLE 초기화 ${initResult ? '성공' : '실패'}`);

        if (initResult) {
          if (Platform.OS === 'android') {
            const granted = await PermissionsAndroid.requestMultiple(permissions);
            const allPermissionsGranted = Object.values(granted).every(
              status => status === PermissionsAndroid.RESULTS.GRANTED
            );

            if (allPermissionsGranted) {
              console.log('모든 BLE 관련 권한 획득');
              try {
                await bleServiceRef.current.startAdvertising();
                console.log('광고 시작됨');
              } catch (err) {
                console.error('광고 시작 중 오류:', err);
                Alert.alert('오류', '광고 시작 중 문제가 발생했습니다: ' + err.message);
              }
            } else {
              console.log('BLE 관련 권한 중 일부 또는 전체가 거부됨');
              Alert.alert(
                '권한 필요',
                '주변 사용자를 찾고 연결하려면 블루투스 및 위치 권한이 필요합니다.'
              );
              setLoading(false);
              return;
            }
          } else {
            // iOS 또는 다른 플랫폼의 경우
            try {
              await bleServiceRef.current.startAdvertising();
              console.log('광고 시작됨 (iOS 또는 기타 플랫폼)');
            } catch (err) {
              console.error('광고 시작 중 오류:', err);
              Alert.alert('오류', '광고 시작 중 문제가 발생했습니다: ' + err.message);
            }
          }
          // 권한 처리 후 스캔 시작
          await startScanning();
        } else {
          console.log('BLE 초기화 실패');
          setLoading(false);
          Alert.alert('알림', '블루투스 초기화에 실패했습니다. 블루투스 설정을 확인해주세요.');
        }
      } catch (error) {
        console.error('초기화 중 오류 발생:', error);
        setUsers([]);
        setUserPositions([]);
        userPositionsRef.current = [];
        setButtonVisible(false);
        setLoading(false);
        Alert.alert('오류', '초기화 중 문제가 발생했습니다: ' + error.message);
      }
    };

    initialize();

    return () => {
      if (bleServiceRef.current) {
        try {
          stopScanning();
        } catch (e) {
          console.error('정리 중 오류:', e);
        }
      }
    };
  }, []);

  const handleRefresh = async () => {
    if (isScanning || loading) {
      return;
    }

    try {
      console.log('[새로고침] 시작');
      setLoading(true);

      setUsers([]);
      setUserPositions([]);
      setUserDataReady(false);
      userPositionsRef.current = [];
      setSelectedGifticon(null);

      setButtonVisible(false);
      setCenterButtonVisible(false);

      setConfirmModalVisible(false);
      setShowTooltip(false);

      selectedGifticonRef.current = null;
      usersRef.current = [];
      userDataRef.current = {
        hasSelectedGifticon: false,
        selectedGifticon: null,
        users: [],
        bleTokens: [],
        dataReady: false,
      };

      console.log('[새로고침] 상태 초기화 완료');

      if (isScanning) {
        await stopScanning();
      }

      await startScanning();

      console.log('[새로고침] 완료');
    } catch (error) {
      console.error('[새로고침] 오류 발생:', error);
      setLoading(false);
      setIsScanning(false);
      setButtonVisible(false);
      Alert.alert('새로고침 실패', '사용자 검색 중 오류가 발생했습니다.');
    }
  };

  useEffect(() => {
    // 화면이 마운트될 때 백그라운드에서 기프티콘 데이터 미리 로드
    const preloadGifticons = async () => {
      try {
        console.log('기프티콘 데이터 미리 로드 중...');
        const response = await mapGifticonService.getGiveAwayGifticons();

        // 조용히 데이터 캐싱
        if (response && response.gifticons) {
          setGiveAwayGifticons(response);
          // 데이터가 이미 로드되었음을 표시하는 플래그 설정
          setIsGifticonsPreloaded(true);
        }
      } catch (error) {
        console.log('기프티콘 미리 로드 실패:', error);
        // 실패해도 사용자에게 알리지 않음 - 버튼 클릭 시 다시 시도
      }
    };

    // 주변 사용자 검색이 완료된 후 기프티콘 미리 로드
    if (userDataReady && users.length > 0 && !isGifticonsPreloaded) {
      preloadGifticons();
    }
  }, [userDataReady, users.length, isGifticonsPreloaded]);

  const loadGiveAwayGifticons = async () => {
    try {
      const response = await mapGifticonService.getGiveAwayGifticons();
      if (response && response.gifticons) {
        setGiveAwayGifticons(response);
      } else {
        setGiveAwayGifticons({ gifticons: [], hasNextPage: false, nextPage: null });
      }
    } catch (error) {
      console.error('뿌리기용 기프티콘 목록 로드 실패:', error);
      setGiveAwayGifticons({ gifticons: [], hasNextPage: false, nextPage: null });
      Alert.alert('오류', '기프티콘 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoadingGifticons(false);
    }
  };

  const handleButtonClick = () => {
    setButtonVisible(false);

    // 바텀시트 즉시 표시
    bottomSheetModalRef.current?.present();

    // 이미 데이터가 로드되어 있는지 확인
    if (isGifticonsPreloaded && giveAwayGifticons.gifticons.length > 0) {
      setIsLoadingGifticons(false);
    } else {
      setIsLoadingGifticons(true);
      setTimeout(() => {
        loadGiveAwayGifticons();
      }, 0);
    }
  };

  const handleGifticonSelect = gifticon => {
    console.log('[기프티콘 선택 시작] 선택된 기프티콘:', {
      gifticonId: gifticon?.gifticonId,
      gifticonName: gifticon?.gifticonName,
      fullGifticon: gifticon,
    });

    if (!gifticon || !gifticon.gifticonId) {
      Alert.alert('오류', '유효하지 않은 기프티콘입니다.');
      return;
    }

    setSelectedGifticon(gifticon);
    selectedGifticonRef.current = gifticon;
    userDataRef.current = {
      ...userDataRef.current,
      hasSelectedGifticon: true,
      selectedGifticon: gifticon,
    };
    setConfirmModalVisible(true);
    bottomSheetModalRef.current?.dismiss();
  };

  const handleConfirm = () => {
    // console.log('[기프티콘 선택 확인] 현재 상태:', {
    //   hasSelectedGifticon: !!selectedGifticon,
    //   selectedGifticonDetails: selectedGifticon
    //     ? {
    //         id: selectedGifticon.gifticonId,
    //         name: selectedGifticon.gifticonName,
    //       }
    //     : '선택된 기프티콘 없음',
    //   bleTokens: users.map(u => u.bleToken),
    // });

    if (!selectedGifticon || !selectedGifticon.gifticonId) {
      Alert.alert('오류', '유효한 기프티콘을 선택해주세요.');
      return;
    }

    setConfirmModalVisible(false);
    setButtonVisible(false);
    setCenterButtonVisible(usersRef.current.length > 0 && !!selectedGifticonRef.current);

    setShowTooltip(true);
  };

  const handleCancel = () => {
    setSelectedGifticon(null);
    setConfirmModalVisible(false);
    setButtonVisible(usersRef.current.length > 0 && !selectedGifticonRef.current);
    setCenterButtonVisible(false);

    selectedGifticonRef.current = null;
    userDataRef.current = {
      ...userDataRef.current,
      hasSelectedGifticon: false,
      selectedGifticon: null,
    };
    setShowTooltip(false);

    setCenterButtonVisible(false);
    setButtonVisible(usersRef.current.length > 0);

    setSelectedGifticon(null);
    userDataRef.current.selectedGifticon = null;
    userDataRef.current.hasSelectedGifticon = false;
  };

  const handleOutsidePress = () => {
    // if (listVisible) { // listVisible 대신 바텀시트 상태를 확인해야 하지만,
    // BottomSheetBackdrop의 pressBehavior="close"가 이 역할을 수행
    //   bottomSheetModalRef.current?.dismiss();
    //   setButtonVisible(true);
    // }
  };

  const handleGoBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const permissions = [
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ];

  const triggerSendGifticonAPI = userWithPosition => {
    console.log('[runOnJS] triggerSendGifticonAPI 호출됨, user:', userWithPosition.name);
    setIsTransferring(true);
    sendGifticonToUser(userWithPosition);
  };

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      console.log('[Gesture.Pan] onBegin');
      gestureContext.value = { startX: buttonTranslateX.value, startY: buttonTranslateY.value };
      buttonScale.value = withTiming(1.2, { duration: 150 });
    })
    .onUpdate(event => {
      buttonTranslateX.value = gestureContext.value.startX + event.translationX;
      buttonTranslateY.value = gestureContext.value.startY + event.translationY;
    })
    .onEnd(event => {
      console.log('[Gesture.Pan] onEnd. Velocity:', event.velocityX, event.velocityY);
      const dragDistance = Math.sqrt(event.translationX ** 2 + event.translationY ** 2);
      const { selectedGifticon: currentSelectedGifticon, users: currentUsers } =
        userDataRef.current;

      if (!currentSelectedGifticon || !currentUsers || currentUsers.length === 0) {
        buttonTranslateX.value = withSpring(0);
        buttonTranslateY.value = withSpring(0);
        buttonScale.value = withSpring(1);
        return;
      }

      if (dragDistance > 100) {
        const randomIndex = Math.floor(Math.random() * currentUsers.length);
        const selectedUser = currentUsers[randomIndex];
        const userPosition = userPositions[randomIndex] || { x: width / 2, y: height / 2 };

        if (selectedUser && selectedUser.bleToken) {
          const targetX = userPosition.x - centerX;
          const targetY = userPosition.y - centerY;

          buttonOpacity.value = withTiming(0, { duration: 300 }, () => {
            buttonTranslateX.value = 0;
            buttonTranslateY.value = 0;
          });
          buttonScale.value = withTiming(0.5, { duration: 250 });
          buttonTranslateX.value = withTiming(targetX, { duration: 250 });
          buttonTranslateY.value = withTiming(targetY, { duration: 250 }, finished => {
            if (finished) {
              const userWithPositionForAPI = { ...selectedUser, position: userPosition };
              runOnJS(triggerSendGifticonAPI)(userWithPositionForAPI);
            }
          });
        } else {
          buttonTranslateX.value = withSpring(0);
          buttonTranslateY.value = withSpring(0);
          buttonScale.value = withSpring(1);
        }
      } else {
        buttonTranslateX.value = withSpring(0);
        buttonTranslateY.value = withSpring(0);
        buttonScale.value = withSpring(1);
      }
    })
    .onFinalize(() => {
      if (buttonScale.value !== 1 && buttonTranslateX.value === 0 && buttonTranslateY.value === 0) {
        buttonScale.value = withSpring(1);
      }
    });

  const resetButtonPositionReanimated = () => {
    buttonTranslateX.value = withSpring(0);
    buttonTranslateY.value = withSpring(0);
    buttonScale.value = withSpring(1);
    buttonOpacity.value = withTiming(1);
  };

  const resetAfterSendReanimated = () => {
    // console.log('[Reanimated] resetButtonPositionReanimated 호출됨');
    buttonTranslateX.value = withSpring(0);
    buttonTranslateY.value = withSpring(0);
    buttonScale.value = withSpring(1);
    buttonOpacity.value = withTiming(1);

    setGiftSentUserId(null);
    setIsTransferring(false);
    setShowTooltip(false);

    setCenterButtonVisible(false);
    setButtonVisible(true);

    setSelectedGifticon(null);
    userDataRef.current.selectedGifticon = null;
    userDataRef.current.hasSelectedGifticon = false;
  };

  // API 성공 시 알림창 확인 버튼 핸들러
  const handleApiSuccessAlertConfirm = () => {
    resetAfterSendReanimated();
    navigation.navigate('Main', { screen: 'TabMap' });
  };

  // API 에러 시 알림창 확인 버튼 핸들러 (이전과 동일, 현재 화면 유지)
  const handleApiErrorAlertConfirm = () => {
    resetAfterSendReanimated();
  };

  const sendGifticonToUser = async user => {
    const gifticonToSend = userDataRef.current.selectedGifticon;
    console.log('[DEBUG] sendGifticonToUser 시작:', {
      user,
      gifticonToSend,
      bleToken: user?.bleToken,
      userDataRef: userDataRef.current,
    });

    if (!gifticonToSend || !user || !user.bleToken) {
      console.error('[API] 전송 실패: 필요한 정보 누락.', { gifticonToSend, user });
      Alert.alert('오류', 'API 호출에 필요한 정보가 부족합니다.');
      runOnJS(setIsTransferring)(false);
      runOnJS(resetButtonPositionReanimated)();
      return;
    }

    setGiftSentUserId(user.uuid);

    try {
      addReceivedAnimationReanimated(user.uuid);
      const gifticonIdToUse = gifticonToSend.gifticonId;
      console.log('[API] 기프티콘 전송 대상 bleToken:', user.bleToken);
      console.log('[API] 호출 파라미터:', {
        gifticonId: gifticonIdToUse,
        bleTokens: [user.bleToken],
      });
      const apiResponse = await giveAwayService.giveAwayGifticon(gifticonIdToUse, [user.bleToken]);
      // console.log('[API] 호출 성공:', response);

      // 로컬 스토어에서 기프티콘 제거
      useGifticonListStore.getState().removeGifticon(gifticonIdToUse);

      // 커스텀 모달 관련 호출 제거하고 Alert 사용
      // runOnJS(setLastSentUserInfo)({
      //   userName: user.name,
      //   gifticonName: gifticonToSend.gifticonName || '기프티콘',
      // });
      // runOnJS(setIsSuccessModalVisible)(true); // 이 부분이 에러의 원인이었을 가능성이 높음

      Alert.alert('뿌리기 성공', '성공적으로 기프티콘을 뿌렸습니다!', [
        { text: '확인', onPress: () => runOnJS(handleApiSuccessAlertConfirm)() },
      ]);
    } catch (apiError) {
      console.error('[API] 호출 실패:', apiError);
      Alert.alert('실패', apiError.message || '기프티콘 전송 중 오류 발생', [
        { text: '확인', onPress: () => runOnJS(handleApiErrorAlertConfirm)() },
      ]);
    } finally {
      // console.log('[API] sendGifticonToUser 함수 finally 블록.');
    }
  };

  const addReceivedAnimationReanimated = userId => {
    receivedUserPulse.value = 1;
    receivedUserOpacity.value = 0;

    receivedUserPulse.value = withTiming(1.3, { duration: 150 }, () => {
      receivedUserPulse.value = withTiming(1, { duration: 150 }, () => {
        receivedUserPulse.value = withTiming(1.2, { duration: 150 }, () => {
          receivedUserPulse.value = withTiming(1, { duration: 150 });
        });
      });
    });
    receivedUserOpacity.value = withSequence(
      withTiming(0.8, { duration: 300 }),
      withTiming(0, { duration: 300, delay: 200 })
    );
  };

  const handleSheetChanges = useCallback(index => {
    // console.log('바텀시트 인덱스 변경:', index);
    if (index === -1) {
      // 바텀시트가 닫혔을 때 상태 초기화
      setIsLoadingGifticons(false);
      // 기프티콘이 선택되지 않았고, 주변 사용자가 있다면 목록 버튼 다시 표시
      if (!selectedGifticonRef.current && usersRef.current.length > 0) {
        setButtonVisible(true);
      }
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />

          <View style={{ height: insets.top, backgroundColor: theme.colors.background }} />

          <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
            <TouchableOpacity onPress={handleGoBack} style={styles.backButtonContainer}>
              <Icon name="arrow-back-ios" type="material" size={22} color={theme.colors.black} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.colors.black }]}>기프티콘 뿌리기</Text>
            <TouchableOpacity
              onPress={handleRefresh}
              style={[styles.refreshButton, isScanning && styles.refreshButtonSpinning]}
              disabled={isScanning || loading}
            >
              <Icon
                name="refresh"
                type="material"
                size={24}
                color={isScanning || loading ? theme.colors.gray : theme.colors.black}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.contentContainer}>
            <TouchableOpacity
              style={styles.svgContainer}
              activeOpacity={1}
              onPress={handleOutsidePress}
            >
              <Svg width={width} height={height} style={styles.svgImage}>
                {radiusArray.map((radius, index) => (
                  <Circle
                    key={index}
                    cx={centerX}
                    cy={centerY}
                    r={radius}
                    stroke="#CCCCCC"
                    strokeWidth="1"
                    fill="transparent"
                  />
                ))}
              </Svg>

              {loading ? (
                <View style={styles.loadingOverlay}>
                  <LottieView
                    source={require('../../assets/lottie/giveaway_loading.json')}
                    autoPlay
                    loop
                    style={{
                      width: lottieAnimationSize,
                      height: lottieAnimationSize,
                    }}
                  />
                </View>
              ) : userDataReady && users.length > 0 && userPositions.length === users.length ? (
                users.map((user, index) => {
                  const position = userPositions[index];
                  if (!position) return null;
                  const baseSize = 80;
                  const adjustedSize = baseSize * position.scale;

                  const isSentUser = giftSentUserId === user.uuid;

                  return (
                    <Animated.View
                      key={`user-${user.uuid}`}
                      style={[
                        styles.userContainer,
                        {
                          left: position.x - adjustedSize / 2,
                          top: position.y - adjustedSize / 2,
                          width: adjustedSize,
                          opacity: position.opacity,
                          zIndex: 10 - position.distanceIndex,
                        },
                        isSentUser && receivedUserAnimatedStyle,
                      ]}
                    >
                      {isSentUser && (
                        <Animated.View style={[styles.giftGlow, giftGlowAnimatedStyle]} />
                      )}
                      <View
                        style={[
                          styles.emojiContainer,
                          { width: adjustedSize, height: adjustedSize },
                        ]}
                      >
                        <Image
                          source={availableImages[user.displayImageIndex]}
                          style={{
                            width: adjustedSize,
                            height: adjustedSize,
                            resizeMode: 'contain',
                          }}
                        />
                      </View>
                      <Text style={[styles.userName, { color: theme.colors.text }]}>
                        {availableDescriptions[user.displayDescriptionIndex]}
                      </Text>
                    </Animated.View>
                  );
                })
              ) : (
                <NoUsersScreen onRefresh={handleRefresh} />
              )}

              <Tooltip
                visible={showTooltip}
                message="선물 버튼을 원하는 방향으로 드래그하면 기프티콘 뿌리기가 시작됩니다."
                autoHide={true}
                duration={2000}
                opacityShared={tooltipOpacityShared}
              />

              {centerButtonVisible && (
                <GestureDetector gesture={panGesture}>
                  <Animated.View
                    style={[
                      styles.centerButtonContainer,
                      animatedButtonStyle,
                      isTransferring && styles.buttonHiddenWhileTransferring,
                    ]}
                  >
                    {!isTransferring && (
                      <Image source={giveAwayButtonImg} style={styles.centerButtonImage} />
                    )}
                  </Animated.View>
                </GestureDetector>
              )}
            </TouchableOpacity>

            {buttonVisible && !loading && (
              <TouchableOpacity style={styles.giveawayButton} onPress={handleButtonClick}>
                <Image source={giveAwayButtonImg} style={styles.buttonImage} />
              </TouchableOpacity>
            )}

            <GifticonConfirmModal
              visible={confirmModalVisible}
              selectedGifticon={selectedGifticon}
              onCancel={handleCancel}
              onConfirm={handleConfirm}
            />
          </View>

          <BottomSheetModal
            ref={bottomSheetModalRef}
            index={0}
            snapPoints={snapPoints}
            onChange={handleSheetChanges}
            backdropComponent={renderBackdrop}
            handleIndicatorStyle={styles.bottomSheetHandleIndicator}
            backgroundStyle={styles.bottomSheetBackground}
          >
            <View style={styles.bottomSheetContentContainer}>
              {isLoadingGifticons ? (
                <ActivityIndicator
                  size="large"
                  color={theme.colors.primary || '#007bff'}
                  style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
                />
              ) : (
                <GiveAwayGifticonList
                  gifticons={giveAwayGifticons.gifticons}
                  onSelectGifticon={handleGifticonSelect}
                />
              )}
            </View>
          </BottomSheetModal>
        </View>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF9FF',
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButtonContainer: {
    padding: 0,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Pretendard-Bold',
    textAlign: 'center',
    flex: 1,
  },
  rightPlaceholder: {
    width: 30,
  },
  contentContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  svgContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  svgImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  userContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  emojiContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  userName: {
    fontSize: 15,
    fontFamily: 'Pretendard-SemiBold',
    color: '#333',
    textAlign: 'center',
  },
  giveawayButton: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    width: 65,
    height: 65,
    borderRadius: 50,
    backgroundColor: 'rgba(131, 200, 245, 0.5)',
    borderColor: '#56AEE9',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  buttonImage: {
    width: 45,
    height: 45,
    resizeMode: 'contain',
  },
  gifticonListContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    height: height * 0.35,
    zIndex: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerButtonContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  centerButtonImage: {
    width: 60,
    height: 70,
  },
  loadingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  receivedGift: {
    shadowColor: '#FFDC4F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
  giftGlow: {
    position: 'absolute',
    backgroundColor: '#FFD700',
    borderRadius: 100,
    zIndex: -1,
  },
  tooltipContainer: {
    position: 'absolute',
    top: '1%',
    alignItems: 'center',
    zIndex: 1000,
  },
  refreshButton: {
    padding: 8,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshButtonSpinning: {
    opacity: 0.5,
  },
  buttonHiddenWhileTransferring: {
    opacity: 0,
  },
  bottomSheetContentContainer: {
    flex: 1,
  },
  bottomSheetHandleIndicator: {
    backgroundColor: '#A0A0A0',
    width: 50,
    height: 5,
    borderRadius: 3,
  },
  bottomSheetBackground: {
    backgroundColor: '#E5F4FE',
    borderRadius: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
});

export default GiveAwayScreen;
