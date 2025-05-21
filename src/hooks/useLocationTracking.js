import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

const ALLOWED_STATUSES = ['granted', 'granted_always', 'always', 'authorized_always', 'authorized'];

/**
 * 사용자 위치 정보를 관리하는 커스텀 훅
 */
const useLocationTracking = () => {
  const [location, setLocation] = useState(null); // 현재 위치 정보
  const [errorMsg, setErrorMsg] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState(null); // 위치 권한 상태
  const [locationSubscription, setLocationSubscription] = useState(null);

  // 위치 권한 요청 함수
  const requestLocationPermission = async () => {
    try {
      // 포그라운드 위치 권한 요청
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(foregroundStatus);

      if (foregroundStatus !== 'granted') {
        setErrorMsg('위치 권한이 거부되었습니다.');
        return false;
      }

      // 백그라운드 위치 권한 요청
      if (Platform.OS === 'android') {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        // if (backgroundStatus !== 'granted') {
        //   // 백그라운드 권한은 필수는 아니지만 경고 표시
        //   // console.log('백그라운드 위치 권한이 거부됨');
        // }
      }

      return true;
    } catch (error) {
      console.error('위치 권한 요청 실패:', error);
      setErrorMsg('위치 권한 요청 중 오류가 발생했습니다.');
      return false;
    }
  };

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);
      // console.log('위치 권한 상태:', status);

      if (!ALLOWED_STATUSES.includes(status)) {
        setErrorMsg('위치 권한이 거부되었습니다.');
        return;
      }

      try {
        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
        });

        setLocation(currentLocation);
        // console.log('현재 위치:', currentLocation);
      } catch (error) {
        setErrorMsg('위치 정보를 가져오는데 실패했습니다: ' + error.message);
        console.error('위치 정보 오류:', error);
      }
    })();
  }, []);

  // 위치 변경 감지
  const startLocationTracking = async () => {
    if (!ALLOWED_STATUSES.includes(permissionStatus)) {
      setErrorMsg('위치 권한이 필요합니다.');
      return false;
    }

    try {
      const locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10000,
          distanceInterval: 100,
        },
        newLocation => {
          setLocation(newLocation);
          // console.log('위치 업데이트:', newLocation);
        }
      );

      setLocationSubscription(locationSubscription);
      return locationSubscription;
    } catch (error) {
      setErrorMsg('위치 추적 시작 중 오류: ' + error.message);
      console.error('위치 추적 오류:', error);
      return false;
    }
  };

  return {
    location,
    errorMsg,
    permissionStatus,
    startLocationTracking,
  };
};

export default useLocationTracking;
