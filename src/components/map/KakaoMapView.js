import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, Dimensions, Text, Alert, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { KAKAO_REST_API_KEY } from '@env';
import useLocationTracking from '../../hooks/useLocationTracking';
import { updateMapMarkers, filterMarkersByBrand } from '../../utils/mapMarkerUtils';
import GeofencingService from '../../services/GeofencingService';
import { getKakaoMapHtml } from './KakaoMapHtml';

const { width } = Dimensions.get('window');
// 지오펜싱 서비스 싱글톤 인스턴스
let geofencingServiceInstance = null;

// 초기 지도 중심 좌표
const INITIAL_MAP_CENTER = {
  latitude: 36.1071383,
  longitude: 128.4164758,
};

const KakaoMapView = forwardRef(
  ({ uniqueBrands, selectedBrand, onSelectBrand, onStoresFound }, ref) => {
    const [mapLoaded, setMapLoaded] = useState(false);
    const webViewRef = useRef(null);
    const { location, errorMsg } = useLocationTracking();
    const [debugMessage, setDebugMessage] = useState('');
    const [prevLocation, setPrevLocation] = useState(null); // 이전 위치 저장 - 위치 변화량 계산용
    const searchTimerRef = useRef(null); // 디바운스 처리를 위한 타이머 참조

    // 지오펜싱 서비스 싱글톤 인스턴스 초기화
    useEffect(() => {
      if (!geofencingServiceInstance && uniqueBrands) {
        geofencingServiceInstance = new GeofencingService(uniqueBrands);
        // console.log('GeofencingService 인스턴스 생성 (싱글톤)');
      }
    }, [uniqueBrands]);

    // 부모 컴포넌트에서 현재 위치로 이동 메서드 접근 허용
    useImperativeHandle(ref, () => ({
      moveToCurrentLocation: () => {
        if (location && location.coords) {
          moveToLocation(location.coords);
        } else {
          // 사용자의 현재 위치를 알 수 없을 경우, 지정된 초기 위치로 이동
          console.log('사용자 현재 위치 정보 없음. 초기 설정 위치로 이동합니다.');
          moveToLocation(INITIAL_MAP_CENTER);
        }
      },
    }));

    // 위치 정보가 확인된 후에만 지오펜싱 초기화
    useEffect(() => {
      if (location) {
        geofencingServiceInstance.initGeofencing();
      }
    }, [location]);

    // 컴포넌트 언마운트 시 지오펜싱 정리
    useEffect(() => {
      return () => {
        geofencingServiceInstance.cleanup();
      };
    }, []);

    // 위치 정보 권한 관련
    useEffect(() => {
      if (errorMsg) {
        console.error('[KakaoMapView] 위치 권한 오류:', errorMsg);
        // 오류가 있을 때 사용자에게 알림
        Alert.alert(
          '위치 권한 필요',
          '지도를 사용하고 주변 매장 알림을 받으려면 위치 권한이 필요합니다.',
          [
            { text: '닫기', style: 'cancel' },
            {
              text: '설정으로 이동',
              onPress: () => {
                // 설정으로 이동
                Linking.openSettings();
              },
            },
          ]
        );
      }
    }, [errorMsg]);

    // 웹뷰에서 메시지를 받아 처리하는 함수
    const handleMessage = event => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        setDebugMessage(`마지막 메시지: [${data.type}] ${data.message || 'no message'}`);

        if (data.type === 'mapLoaded' && data.success) {
          setMapLoaded(true);
          // console.log('맵 로드됨, 위치 정보:', location ? '있음' : '없음');

          setTimeout(() => {
            // 맵 로드 시 초기 설정 위치로 이동하고 주변 검색
            moveToLocation(INITIAL_MAP_CENTER);
            debouncedSearchNearbyStores(INITIAL_MAP_CENTER);
            setPrevLocation(INITIAL_MAP_CENTER); // 초기 검색을 위해 prevLocation 설정
            // if (location) { // 기존 현재 위치 이동 로직 제거
            //   moveToCurrentLocation();
            // }
          }, 1000); // 약간의 지연을 두어 map 객체가 완전히 준비되도록 함
        }

        // 마커 클릭 이벤트 처리
        if (data.type === 'markerClick') {
          const currentBrandId = selectedBrand !== null ? Number(selectedBrand) : null;
          const clickedBrandId = Number(data.brandId);

          // 같은 브랜드 재클릭 시 선택 해제, 다른 브랜드 클릭 시 선택
          if (currentBrandId === clickedBrandId) {
            onSelectBrand(null);
          } else {
            onSelectBrand(clickedBrandId);
          }
        }

        // 지도 이동 완료 이벤트 처리
        if (data.type === 'mapMoved') {
          // console.log('[KakaoMapView] 지도 이동 완료. 새 중심:', data.latitude, data.longitude);
          if (uniqueBrands && uniqueBrands.length > 0) {
            const movedCenter = { latitude: data.latitude, longitude: data.longitude };
            debouncedSearchNearbyStores(movedCenter);
          }
        }
      } catch (error) {
        console.error('메시지 파싱 오류:', error);
        setDebugMessage(`메시지 파싱 오류: ${error.message}`);
      }
    };

    // 위치 정보가 변경될 때마다 지도 업데이트
    // useEffect(() => {
    //   if (location && mapLoaded && webViewRef.current) {
    //     // console.log('위치 정보 변경됨, 맵 업데이트 시도');
    //     moveToLocation(location.coords); // 사용자의 현재 위치로 이동하도록 수정 (선택적)
    //   }
    // }, [location, mapLoaded]);

    // 지정된 좌표로 지도 이동 함수 (기존 moveToCurrentLocation에서 변경)
    const moveToLocation = coords => {
      if (!coords || !webViewRef.current) {
        console.log('위치 이동 불가: 좌표 정보 또는 webViewRef 없음');
        return;
      }

      const { latitude, longitude } = coords;

      const script = `
      try {
        if (typeof kakao !== 'undefined' && kakao.maps) {
          var moveLatLng = new kakao.maps.LatLng(${latitude}, ${longitude});
          
          if (typeof map !== 'undefined') {
            map.setCenter(moveLatLng);
          
          if (window.currentLocationMarker) {
            window.currentLocationMarker.setMap(null);
          }
            
          // 사용자 현재 위치 표시  
          window.currentLocationMarker = new kakao.maps.Circle({
            center: new kakao.maps.LatLng(${latitude}, ${longitude}),
            radius: 8, 
            strokeWeight: 10,
            strokeColor: '#4A90E2',
            strokeOpacity: 1,
            fillColor: '#FFFFFF',
            fillOpacity: 1
          });
          window.currentLocationMarker.setMap(map);
            
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'moveSuccess',
              message: '현재 위치로 이동 완료: ' + ${latitude} + ', ' + ${longitude}
            }));
          }
        }
      } catch (error) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error',
          message: '현재 위치 표시 실패: ' + error.message
        }));
      }
      true;
    `;

      webViewRef.current.injectJavaScript(script);
    };

    // 두 지점 간의 거리를 미터 단위로 계산하는 함수
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371e3; // 지구 반지름 (미터)
      const φ1 = (lat1 * Math.PI) / 180;
      const φ2 = (lat2 * Math.PI) / 180;
      const Δφ = ((lat2 - lat1) * Math.PI) / 180;
      const Δλ = ((lon2 - lon1) * Math.PI) / 180;

      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    // 연속적인 API 호출 방지를 위한 디바운스 함수
    const debouncedSearchNearbyStores = centerCoords => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      // console.log('디바운스 타이머 설정: 1초 후 검색 예정, 중심:', centerCoords);
      searchTimerRef.current = setTimeout(() => {
        // console.log('디바운스 타이머 만료: 검색 실행, 중심:', centerCoords);
        searchNearbyStores(centerCoords);
      }, 1000); // 1초 디바운스
    };

    // 주변 매장 검색 및 지오펜스 설정 함수
    const searchNearbyStores = async searchCenter => {
      // console.log(
      //   '[KakaoMapView] 매장 검색 요청, 브랜드:',
      //   uniqueBrands.map(b => b.brandName).join(', '),
      //   '중심:',
      //   searchCenter
      // );
      if (!searchCenter || !uniqueBrands || uniqueBrands.length === 0) {
        // console.log('조건 미충족으로 리턴 (searchCenter 또는 uniqueBrands 없음)');
        return;
      }

      const { latitude, longitude } = searchCenter;
      // console.log(`검색 위치: ${latitude}, ${longitude}`);

      try {
        // 각 브랜드별 매장 검색
        const searchPromises = uniqueBrands.map(async brand => {
          // console.log(`브랜드 검색 중: ${brand.brandName}`);
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
            console.error(`API 응답 오류: ${response.status}`);
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          // console.log(`${brand.brandName} 검색 결과: ${data.documents.length}개 매장 찾음`);

          return {
            brandId: brand.brandId,
            brandName: brand.brandName,
            stores: data.documents,
          };
        });

        const results = await Promise.all(searchPromises);
        // console.log(
        //   '총 매장 수:',
        //   results.reduce((sum, brand) => sum + brand.stores.length, 0)
        // );

        // 전체 매장 데이터 저장 및 지도에 표시 (selectedBrand 함께 전달)
        window.allStoreData = results;
        updateMapMarkers(webViewRef, results, selectedBrand);

        // 중요: 여기에서 부모 컴포넌트에 결과 전달 추가
        if (typeof onStoresFound === 'function') {
          // console.log('[KakaoMapView] 부모 컴포넌트(MapScreen)에 매장 데이터 전달');
          onStoresFound(results);
        } else {
          console.error('[KakaoMapView] onStoresFound 함수가 정의되지 않음');
        }
      } catch (error) {
        console.error('매장 검색 실패:', error);
      }
    };

    // 위치 변경 시 100m 이상 이동 시에만 매장 재검색
    useEffect(() => {
      if (location && mapLoaded && uniqueBrands && uniqueBrands.length > 0) {
        const { latitude, longitude } = location.coords; // 실제 사용자 위치 기준
        const currentCoords = { latitude, longitude };

        // 이전 위치와 비교하여 100m 이상 이동했는지 확인
        // prevLocation이 INITIAL_MAP_CENTER로 시작하므로, 첫 실제 위치 업데이트 시 검색 가능성 있음
        const shouldSearchAgain =
          !prevLocation ||
          calculateDistance(prevLocation.latitude, prevLocation.longitude, latitude, longitude) >
            100;

        if (shouldSearchAgain) {
          console.log('위치 변경 감지 (100m 이상 이동 또는 초기 위치): 주변 매장 검색 실행');
          // 디바운스 적용하여 검색 실행
          debouncedSearchNearbyStores(currentCoords); // 실제 사용자 현재 위치 좌표 전달
          setPrevLocation({ latitude, longitude });
        } else {
          // console.log('작은 위치 변경 무시: 100m 이내 이동');
        }
      }
    }, [location, mapLoaded, uniqueBrands]); // prevLocation을 의존성 배열에서 제거하여, location 변경 시 항상 재평가

    // 선택된 브랜드가 변경될 때 지도 마커 필터링
    useEffect(() => {
      if (mapLoaded && webViewRef.current) {
        console.log('브랜드 선택 변경 감지:', selectedBrand);
        filterMarkersByBrand(webViewRef, selectedBrand);
      }
    }, [selectedBrand, mapLoaded]);

    return (
      <View style={styles.container}>
        {errorMsg ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: getKakaoMapHtml() }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          onMessage={handleMessage}
          onError={syntheticEvent => {
            const { nativeEvent } = syntheticEvent;
            console.error('WebView 오류:', nativeEvent);
          }}
          onHttpError={syntheticEvent => {
            const { nativeEvent } = syntheticEvent;
            console.error('HTTP 오류:', nativeEvent);
          }}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#fff',
  },
  webView: {
    flex: 1,
  },
  errorContainer: {
    padding: 10,
    backgroundColor: '#ffeeee',
    borderRadius: 5,
    margin: 10,
  },
  errorText: {
    color: '#ff0000',
    textAlign: 'center',
  },
});

export default KakaoMapView;
