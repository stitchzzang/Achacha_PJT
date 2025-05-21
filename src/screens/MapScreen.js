import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, SafeAreaView, TouchableOpacity, StatusBar } from 'react-native';
import KakaoMapView from '../components/map/KakaoMapView';
import GifticonBottomSheet from '../components/GifticonBottomSheet';
import Icon from 'react-native-vector-icons/MaterialIcons';
import GeofencingService from '../services/GeofencingService';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geofencing from '@rn-bridge/react-native-geofencing';
import useGifticonListStore from '../store/gifticonListStore';

const MapScreen = () => {
  const navigation = useNavigation();
  const [selectedBrand, setSelectedBrand] = useState(null);
  const mapRef = useRef(null);
  const geofencingServiceRef = useRef(null);
  const gifticonSheetRef = useRef(null);
  const currentSheetIndexRef = useRef(1); // BottomSheet 현재 인덱스 추적, 초기값 1

  const {
    gifticons,
    isLoading,
    fetchGifticons,
    getUniqueBrands,
    justRemovedGifticonId,
    clearJustRemovedFlag,
  } = useGifticonListStore();

  // 컴포넌트 마운트 시 초기화
  useEffect(() => {
    // GeofencingService 인스턴스 가져오기 (싱글톤)
    geofencingServiceRef.current = new GeofencingService();

    // 기프티콘 목록 로드
    fetchGifticons();

    // 30분마다 기프티콘 목록 새로고침
    const refreshInterval = setInterval(fetchGifticons, 30 * 60 * 1000);

    // 컴포넌트 언마운트 시 정리
    return () => {
      clearInterval(refreshInterval);
    };
  }, []);

  // 화면이 포커스될 때마다 기프티콘 목록 새로고침
  useFocusEffect(
    useCallback(() => {
      if (justRemovedGifticonId) {
        // 방금 기프티콘이 로컬에서 제거된 경우, 서버 fetch를 건너뛰고 플래그를 해제합니다.
        // 이렇게 하면 로컬 변경사항이 즉시 반영된 것처럼 보입니다.
        console.log(
          '[MapScreen] Gifticon (ID:',
          justRemovedGifticonId,
          ') was recently removed locally. Skipping fetchGifticons and clearing flag.'
        );
        clearJustRemovedFlag();
      } else {
        // 그 외의 경우 (예: 다른 탭에서 돌아오거나, 앱 초기 로딩 후 포커스 등)에는 서버에서 데이터를 가져옴
        console.log('[MapScreen] Screen focused. Fetching gifticons.');
        fetchGifticons();
      }
      moveToCurrentLocation();

      // 화면이 포커스될 때 BottomSheet를 기본 스냅 포인트로 설정 (현재 인덱스가 1이 아닌 경우에만)
      if (gifticonSheetRef.current && currentSheetIndexRef.current !== 1) {
        gifticonSheetRef.current.snapToIndex(1); // snapPoints[1] ('30%')
      }

      return () => {
        // 화면이 포커스를 잃을 때 특별히 정리할 작업이 있다면 여기에 추가
      };
    }, [fetchGifticons, moveToCurrentLocation, justRemovedGifticonId, clearJustRemovedFlag])
  );

  // 브랜드 정보 가져오기
  const uniqueBrands = getUniqueBrands();

  // uniqueBrands 변경 시 서비스에 전달
  useEffect(() => {
    if (geofencingServiceRef.current) {
      geofencingServiceRef.current.uniqueBrands = uniqueBrands;
    }
  }, [uniqueBrands]);

  // 선택된 브랜드에 따라 필터링
  const filteredGifticons = selectedBrand
    ? gifticons.filter(item => item.brandId === selectedBrand)
    : gifticons;

  // 매장 검색 결과 처리 콜백
  const handleStoresFound = async storeResults => {
    // console.log('[MapScreen] 매장 검색 결과 수신:', storeResults.length);
    // console.log('[MapScreen] 매장 데이터 구조:', JSON.stringify(storeResults.slice(0, 1)));

    if (!geofencingServiceRef.current) {
      console.error('[MapScreen] 지오펜싱 서비스 참조가 없음');
      return;
    }

    // 기프티콘이 없는 경우 먼저 로드
    if (
      !geofencingServiceRef.current.userGifticons ||
      geofencingServiceRef.current.userGifticons.length === 0
    ) {
      console.log('[MapScreen] 기프티콘 목록이 비어있음, 로드 시도');
      await fetchGifticons();

      // 로드 후에도 여전히 비어있는지 확인
      if (
        !geofencingServiceRef.current.userGifticons ||
        geofencingServiceRef.current.userGifticons.length === 0
      ) {
        console.warn('[MapScreen] 기프티콘 로드 후에도 목록이 비어있음');
      } else {
        console.log(
          '[MapScreen] 기프티콘 로드 성공:',
          geofencingServiceRef.current.userGifticons.length
        );
      }
    }

    // 지오펜스 설정 진행
    try {
      // storeResults 데이터 구조 확인
      console.log(
        '[MapScreen] 매장 데이터 구조 확인:',
        storeResults.map(br => ({
          brandId: br.brandId,
          storeCount: br.stores ? br.stores.length : 0,
        }))
      );

      // 지오펜스 설정 결과 저장
      const setupResult = await geofencingServiceRef.current.setupGeofences(
        storeResults,
        selectedBrand
      );

      // 설정 후 등록된 지오펜스 확인
      const registeredGeofences = await Geofencing.getRegisteredGeofences();
      console.log('[MapScreen] 지오펜스 설정 완료, 등록된 지오펜스:', registeredGeofences);

      // 지오펜스 정보를 저장소에 저장 (백그라운드에서 활용하기 위함)
      await AsyncStorage.setItem('GEOFENCE_STORE_DATA', JSON.stringify(storeResults));

      return setupResult;
    } catch (error) {
      console.error('[MapScreen] 지오펜스 설정 중 오류:', error);
    }
  };

  // 기프티콘 사용 처리 함수
  const handleUseGifticon = id => {
    // 기프티콘 사용 로직 (필요시 구현)
  };

  // 브랜드 선택 처리 함수
  const handleSelectBrand = brandId => {
    // 숫자형으로 변환하여 비교
    const currentBrandId = selectedBrand !== null ? Number(selectedBrand) : null;
    const newBrandId = brandId !== null ? Number(brandId) : null;

    // 같은 브랜드를 다시 선택하면 선택 해제
    if (currentBrandId === newBrandId) {
      setSelectedBrand(null);
    } else {
      setSelectedBrand(newBrandId);
    }
  };

  // 현재 위치로 이동하는 함수
  const moveToCurrentLocation = useCallback(() => {
    if (mapRef.current && mapRef.current.moveToCurrentLocation) {
      mapRef.current.moveToCurrentLocation();
    }
  }, []);

  // BottomSheet 인덱스 변경 시 호출될 콜백
  const handleSheetIndexChange = useCallback(index => {
    currentSheetIndexRef.current = index;
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#fafafa" />

      <View style={styles.mapContainer}>
        <KakaoMapView
          ref={mapRef}
          uniqueBrands={uniqueBrands}
          selectedBrand={selectedBrand}
          onSelectBrand={handleSelectBrand}
          onStoresFound={handleStoresFound}
        />
      </View>

      {/* 현재 위치 버튼 */}
      <TouchableOpacity style={styles.locationButton} onPress={moveToCurrentLocation}>
        <Icon name="my-location" size={24} color="#278CCC" />
      </TouchableOpacity>

      {/* 기프티콘 뿌리기 화면 이동 버튼 */}
      <TouchableOpacity
        style={styles.giftButton}
        onPress={() => navigation.navigate('GiveAwayScreen')}
      >
        <Icon name="card-giftcard" size={24} color="#278CCC" />
      </TouchableOpacity>

      {/* 기프티콘 목록 하단 시트 */}
      <GifticonBottomSheet
        ref={gifticonSheetRef}
        gifticons={filteredGifticons}
        onUseGifticon={handleUseGifticon}
        onSelectBrand={handleSelectBrand}
        selectedBrand={selectedBrand}
        isLoading={isLoading}
        onSheetIndexChange={handleSheetIndexChange}
      />
    </SafeAreaView>
  );
};

// 스타일
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  mapContainer: {
    flex: 1,
    margin: 0,
    padding: 0,
  },
  locationButton: {
    position: 'absolute',
    top: 55,
    right: 6,
    width: 45,
    height: 45,
    borderRadius: 24,
    backgroundColor: 'rgba(229, 244, 254, 0.8)',
    borderColor: '#56AEE9',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  giftButton: {
    position: 'absolute',
    top: 115,
    right: 6,
    width: 45,
    height: 45,
    borderRadius: 24,
    backgroundColor: 'rgba(229, 244, 254, 0.8)',
    borderColor: '#56AEE9',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default MapScreen;
