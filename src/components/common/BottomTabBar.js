import React, { useEffect, useCallback } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Platform, Dimensions, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTabBar } from '../../context/TabBarContext';
import { useHeaderBar } from '../../context/HeaderBarContext';
import HeaderBar from './HeaderBar';
import { Icon, useTheme } from 'react-native-elements';
import NavigationService from '../../navigation/NavigationService';

// 임포트할 스크린들
import HomeScreen from '../../screens/HomeScreen';
import ManageListScreen from '../../screens/gifticon-management/ManageListScreen';
import BoxMainScreen from '../../screens/gifticon-share-box/BoxMainScreen';
import MapScreen from '../../screens/MapScreen';

const Tab = createBottomTabNavigator();

// 각 탭의 아이콘 정의
const TAB_ICONS = {
  home: 'home',
  gifticonManage: 'qr-code',
  gifticonRegister: 'add',
  map: 'location-on',
  sharebox: 'inventory-2',
};

// 화면 크기 계산
const { width } = Dimensions.get('window');
const ICON_SIZE = width > 380 ? 26 : 24;
const LABEL_FONTSIZE = width > 380 ? 11 : 10;
const FAB_SIZE = 55; // 플로팅 액션 버튼 크기

// 특정 화면에서 탭바를 숨길 화면 목록
const HIDDEN_TAB_BAR_SCREENS = [
  'AddGifticon',
  'EditProfile',
  // 추가할 화면들...
];

// 헤더바가 포함된 스크린 컴포넌트
const ScreenWithHeader = ({ children }) => {
  const { theme } = useTheme();
  const { notificationCount } = useHeaderBar();

  return (
    <View style={[styles.headerContainer, { backgroundColor: theme.colors.background }]}>
      <HeaderBar notificationCount={notificationCount} />
      <View style={[styles.contentContainer, { backgroundColor: theme.colors.background }]}>
        {children}
      </View>
    </View>
  );
};

// 헤더 없는 스크린 컴포넌트
const ScreenWithoutHeader = ({ children, screenName }) => {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.contentContainer,
        { backgroundColor: theme.colors.background },
        screenName === 'Map' && styles.mapContentContainer,
      ]}
    >
      {children}
    </View>
  );
};

// 탭 스크린 래퍼 컴포넌트 - 탭바 표시 여부를 조절하는 로직 포함
const createWrappedComponent = (Component, screenName) => {
  // 각 화면에 대한 래퍼 컴포넌트를 미리 생성
  const WrappedScreenComponent = props => {
    const { hideTabBar, showTabBar } = useTabBar();
    const navigation = useNavigation();

    // 현재 화면의 포커스 상태 변경 감지하여 탭바 표시 여부 설정
    useEffect(() => {
      const unsubscribeFocus = navigation.addListener('focus', () => {
        // 특정 화면에서 탭바 숨기기
        if (HIDDEN_TAB_BAR_SCREENS.includes(screenName)) {
          hideTabBar();
        } else {
          showTabBar();
        }
      });

      // 화면에서 나갈 때 리스너 해제
      return unsubscribeFocus;
    }, [navigation, hideTabBar, showTabBar]);

    // MapScreen, GifticonManageScreen, ShareboxScreen은 헤더 없이 렌더링
    if (screenName === 'Map' || screenName === 'GifticonManage' || screenName === 'Sharebox') {
      return (
        <ScreenWithoutHeader screenName={screenName}>
          <Component {...props} />
        </ScreenWithoutHeader>
      );
    }

    return (
      <ScreenWithHeader>
        <Component {...props} />
      </ScreenWithHeader>
    );
  };

  return WrappedScreenComponent;
};

// 각 화면에 대한 래퍼 컴포넌트를 미리 생성
const WrappedHomeScreen = createWrappedComponent(HomeScreen, 'Home');
const WrappedGifticonManageScreen = createWrappedComponent(ManageListScreen, 'GifticonManage');
const WrappedMapScreen = createWrappedComponent(MapScreen, 'Map');
const WrappedShareboxScreen = createWrappedComponent(BoxMainScreen, 'Sharebox');

// 기프티콘 등록 탭용 더미 컴포넌트
const RegisterTabComponent = () => {
  // 실제로는 아무것도 렌더링하지 않음
  return null;
};

// 등록 버튼 커스텀 탭 아이콘
const RegisterTabIcon = ({ color, focused, onPress }) => {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.fabContainer, { backgroundColor: theme.colors.primary }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Icon name={TAB_ICONS.gifticonRegister} size={28} color="#FFFFFF" type="material" />
    </TouchableOpacity>
  );
};

const BottomTabBar = () => {
  const { isTabBarVisible } = useTabBar();
  const { theme } = useTheme();

  // 기프티콘 등록 탭 클릭 핸들러
  const handleRegisterPress = useCallback(() => {
    // RegisterScreen 화면으로 이동
    NavigationService.navigate('Register', {}, true);
  }, []);

  const renderTabBarIcon = (route, focused, color) => {
    // 등록 탭은 특별 처리
    if (route.name === 'TabRegister') {
      return <RegisterTabIcon color={color} focused={focused} onPress={handleRegisterPress} />;
    }

    let iconName;

    switch (route.name) {
      case 'TabHome':
        iconName = TAB_ICONS.home;
        break;
      case 'TabGifticonManage':
        iconName = TAB_ICONS.gifticonManage;
        break;
      case 'TabMap':
        iconName = TAB_ICONS.map;
        break;
      case 'TabSharebox':
        iconName = TAB_ICONS.sharebox;
        break;
      default:
        iconName = 'help-outline';
    }

    return (
      <View style={styles.iconContainer}>
        <Icon name={iconName} size={ICON_SIZE} color={color} type="material" />
      </View>
    );
  };

  // 커스텀 탭바 버튼 렌더링 함수 - TabNavigator와의 호환성을 위해 TouchableOpacity 유지
  const renderTabBarButton = props => {
    // 기프티콘 등록 탭은 특별한 스타일 적용
    if (props.route?.name === 'TabRegister') {
      return <View {...props} style={[props.style, styles.registerTabButton]} />;
    }
    return <TouchableOpacity {...props} activeOpacity={1} style={props.style} />;
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => renderTabBarIcon(route, focused, color),
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.grey3,
        tabBarLabelStyle: {
          ...styles.tabBarLabel,
          fontSize: LABEL_FONTSIZE,
        },
        tabBarStyle: {
          ...styles.tabBar,
          borderTopWidth: 1,
          borderTopColor: theme.colors.primary,
          backgroundColor: theme.colors.background,
          display: isTabBarVisible ? 'flex' : 'none',
          height: 65,
          paddingBottom: Platform.OS === 'ios' ? 20 : 10,
          paddingHorizontal: 10, // 전체 탭바 패딩 증가
        },
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: {
          ...styles.tabBarItem,
          justifyContent: 'center',
          width: (width - 120) / 4, // 각 탭 아이템의 너비 조정 (더 좁게)
          paddingHorizontal: 0, // 패딩 줄이기
        },
        tabBarButton: renderTabBarButton,
        tabBarPressColor: 'transparent',
        tabBarPressOpacity: 1,
        tabBarActiveBackgroundColor: 'transparent',
        tabBarInactiveBackgroundColor: 'transparent',
      })}
      safeAreaInsets={{ bottom: 0 }}
    >
      <Tab.Screen
        name="TabHome"
        component={WrappedHomeScreen}
        options={{
          tabBarLabel: '홈',
          tabBarLabelStyle: {
            fontFamily: 'Pretendard-SemiBold',
            fontSize: LABEL_FONTSIZE,
          },
        }}
      />
      <Tab.Screen
        name="TabGifticonManage"
        component={WrappedGifticonManageScreen}
        options={{
          tabBarLabel: '기프티콘',
          tabBarLabelStyle: {
            fontFamily: 'Pretendard-SemiBold',
            fontSize: LABEL_FONTSIZE,
          },
        }}
      />
      <Tab.Screen
        name="TabRegister"
        component={RegisterTabComponent}
        options={{
          tabBarLabel: '',
          tabBarLabelStyle: {
            display: 'none',
          },
        }}
        listeners={{
          tabPress: e => {
            // 기본 탭 네비게이션 동작 방지
            e.preventDefault();
            // 대신 등록 화면으로 직접 이동
            handleRegisterPress();
          },
        }}
      />
      <Tab.Screen
        name="TabMap"
        component={WrappedMapScreen}
        options={{
          tabBarLabel: '내 주변',
          tabBarLabelStyle: {
            fontFamily: 'Pretendard-SemiBold',
            fontSize: LABEL_FONTSIZE,
          },
        }}
      />
      <Tab.Screen
        name="TabSharebox"
        component={WrappedShareboxScreen}
        options={{
          tabBarLabel: '쉐어박스',
          tabBarLabelStyle: {
            fontFamily: 'Pretendard-SemiBold',
            fontSize: LABEL_FONTSIZE,
          },
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenText: {
    fontSize: 16,
    letterSpacing: -0.3,
  },
  headerContainer: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  mapContentContainer: {
    paddingTop: 0,
    paddingHorizontal: 0,
  },
  fabContainer: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2, // 완전한 원형으로 변경
    justifyContent: 'center',
    alignItems: 'center',
    bottom: -8, // 버튼 위치 더 아래로 조정
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  registerTabButton: {
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -10, // 탭바 위로 버튼 올리기 (값을 줄여서 아래로 내림)
  },
  tabBar: {
    height: 65,
    backgroundColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  tabBarItem: {
    paddingTop: 2,
    paddingBottom: 0,
    height: 65,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBarLabel: {
    marginTop: 0,
    marginBottom: 6,
    fontWeight: '500',
    textAlign: 'center',
    fontFamily: 'Pretendard-Medium',
  },
  iconContainer: {
    marginBottom: -2,
    padding: 0,
  },
});

export default BottomTabBar;
