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
import { PermissionsAndroid } from 'react-native';
import { mapGifticonService } from '../../services/mapGifticonService';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  withSequence,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');
const giveAwayButtonImg = require('../../assets/images/giveaway_button.png');
const emoji1 = require('../../assets/images/emoji1.png');
const emoji2 = require('../../assets/images/emoji2.png');
const emoji3 = require('../../assets/images/emoji3.png');
const emoji4 = require('../../assets/images/emoji4.png');
const emoji5 = require('../../assets/images/emoji5.png');

const GiveAwayScreen = ({ onClose }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState([]);
  const [userPositions, setUserPositions] = useState([]);
  const [userDataReady, setUserDataReady] = useState(false);
  const userPositionsRef = useRef([]);
  const [listVisible, setListVisible] = useState(false);
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

  const buttonTranslateX = useSharedValue(0);
  const buttonTranslateY = useSharedValue(0);
  const buttonScale = useSharedValue(1);
  const buttonOpacity = useSharedValue(1);
  const gestureContext = useSharedValue({ startX: 0, startY: 0 });

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
    const emojiDisplayBaseSize = 80;
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

    if (allUsers && allUsers.length > 0) {
      const mappedUsers = allUsers
        .map((user, index) => {
          let userEmoji;
          if (typeof user.emoji === 'number') {
            userEmoji = getEmojiFromIndex(user.emoji);
          } else {
            const randomEmojiIndex = Math.floor(Math.random() * 5);
            userEmoji = getEmojiFromIndex(randomEmojiIndex);
          }

          return {
            uuid: user.uuid || `user-${index}`,
            name: user.name || `사용자 ${index + 1}`,
            emoji: userEmoji,
            deviceId: user.deviceId || `device-${index}`,
            bleToken: user.bleToken || `token-${index}`,
          };
        })
        .slice(0, 5);

      setUsers(mappedUsers);
      userDataRef.current = {
        ...userDataRef.current,
        users: mappedUsers,
        bleTokens: mappedUsers.map(user => user.bleToken),
        dataReady: true,
      };
      usersRef.current = mappedUsers;

      setButtonVisible(!userDataRef.current.hasSelectedGifticon);
      setCenterButtonVisible(userDataRef.current.hasSelectedGifticon);

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
      setButtonVisible(!userDataRef.current.hasSelectedGifticon);
      setCenterButtonVisible(userDataRef.current.hasSelectedGifticon);
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
        // console.log('BLE 서비스 초기화 중...');

        try {
          await bleServiceRef.current.stopAdvertising();
          console.log('광고 중지됨');
        } catch (err) {
          console.log('광고 중지 시도 중 오류 (무시됨):', err.message);
        }

        const initResult = await bleServiceRef.current.initialize();
        setBluetoothReady(initResult);
        console.log(`BLE 초기화 ${initResult ? '성공' : '실패'}`);

        if (initResult) {
          try {
            await bleServiceRef.current.startAdvertising();
            console.log('광고 시작됨');
          } catch (err) {
            console.error('광고 시작 중 오류:', err);
          }

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
      setListVisible(false);
      setSelectedGifticon(null);

      setButtonVisible(true);
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
      setButtonVisible(true);
      Alert.alert('새로고침 실패', '사용자 검색 중 오류가 발생했습니다.');
    }
  };

  const loadGiveAwayGifticons = async () => {
    setIsLoadingGifticons(true);
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

  const handleButtonClick = async () => {
    setIsLoadingGifticons(true);
    try {
      await loadGiveAwayGifticons();
      setListVisible(true);
      setButtonVisible(false);
    } catch (error) {
      console.error('기프티콘 목록 로드 중 오류:', error);
      Alert.alert('오류', '기프티콘 목록을 불러오는 중 문제가 발생했습니다.');
    } finally {
      setIsLoadingGifticons(false);
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
    setListVisible(false);
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
    setListVisible(false);
    setButtonVisible(false);
    setCenterButtonVisible(true);

    setShowTooltip(true);
  };

  const handleCancel = () => {
    setSelectedGifticon(null);
    setConfirmModalVisible(false);
    setButtonVisible(true);

    selectedGifticonRef.current = null;
    userDataRef.current = {
      ...userDataRef.current,
      hasSelectedGifticon: false,
      selectedGifticon: null,
    };
  };

  const handleOutsidePress = () => {
    if (listVisible) {
      setListVisible(false);
      setButtonVisible(true);
    }
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

  const getEmojiFromIndex = index => {
    const emojiOptions = [emoji1, emoji2, emoji3, emoji4, emoji5];
    if (typeof index === 'number' && index >= 0) {
      return emojiOptions[index % emojiOptions.length];
    }
    return emojiOptions[Math.floor(Math.random() * emojiOptions.length)];
  };

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
    navigation.navigate('MapScreen');
  };

  // API 에러 시 알림창 확인 버튼 핸들러 (이전과 동일, 현재 화면 유지)
  const handleApiErrorAlertConfirm = () => {
    resetAfterSendReanimated();
  };

  const sendGifticonToUser = async user => {
    const gifticonToSend = userDataRef.current.selectedGifticon;

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
      // console.log('[API] 실제 API 호출 시작:', {
      //   gifticonId: gifticonIdToUse,
      //   bleTokens: [user.bleToken],
      // });
      const response = await giveAwayService.giveAwayGifticon(gifticonIdToUse, [user.bleToken]);
      // console.log('[API] 호출 성공:', response);

      // 커스텀 모달 관련 호출 제거하고 Alert 사용
      // runOnJS(setLastSentUserInfo)({
      //   userName: user.name,
      //   gifticonName: gifticonToSend.gifticonName || '기프티콘',
      // });
      // runOnJS(setIsSuccessModalVisible)(true); // 이 부분이 에러의 원인이었을 가능성이 높음

      Alert.alert(
        '성공',
        `${user.name}님에게 ${gifticonToSend.gifticonName || '기프티콘'}을(를) 성공적으로 뿌렸습니다!`,
        [{ text: '확인', onPress: () => runOnJS(handleApiSuccessAlertConfirm)() }]
      );
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

  return (
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
                source={require('../../assets/lottie/search_users.json')}
                autoPlay
                loop
                style={{
                  width: secondCircleDiameter,
                  height: secondCircleDiameter,
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
                  {isSentUser && <Animated.View style={[styles.giftGlow, giftGlowAnimatedStyle]} />}
                  <View
                    style={[styles.emojiContainer, { width: adjustedSize, height: adjustedSize }]}
                  >
                    <Image
                      source={user.emoji}
                      style={{
                        width: adjustedSize,
                        height: adjustedSize,
                        resizeMode: 'contain',
                      }}
                    />
                  </View>
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

        {listVisible && (
          <TouchableOpacity
            style={styles.gifticonListContainer}
            activeOpacity={1}
            onPress={e => e.stopPropagation()}
          >
            {isLoadingGifticons ? (
              <ActivityIndicator
                size="large"
                color={theme.colors.primary || '#007bff'}
                style={{ flex: 1, justifyContent: 'center' }}
              />
            ) : (
              <GiveAwayGifticonList
                gifticons={giveAwayGifticons.gifticons}
                onSelectGifticon={handleGifticonSelect}
              />
            )}
          </TouchableOpacity>
        )}

        <GifticonConfirmModal
          visible={confirmModalVisible}
          selectedGifticon={selectedGifticon}
          onCancel={handleCancel}
          onConfirm={handleConfirm}
        />
      </View>
    </View>
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
});

export default GiveAwayScreen;
