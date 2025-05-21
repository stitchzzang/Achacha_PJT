import React, { useCallback, useMemo, useRef, useEffect, forwardRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import MapGifticonList from './map/MapGifticonList';
import Icon from 'react-native-vector-icons/MaterialIcons';

const GifticonBottomSheet = forwardRef(
  ({ gifticons, onUseGifticon, onSelectBrand, selectedBrand, onSheetIndexChange }, ref) => {
    const snapPoints = useMemo(() => ['5%', '30%', '50%'], []);

    useEffect(() => {
      if (selectedBrand && ref && ref.current) {
        ref.current.snapToIndex(1); // '30%'에 해당하는 인덱스
      }
    }, [selectedBrand, ref]);

    const handleSheetChanges = useCallback(
      index => {
        console.log('handleSheetChanges', index);
        if (onSheetIndexChange) {
          onSheetIndexChange(index);
        }
      },
      [onSheetIndexChange]
    );

    const handleBackPress = () => {
      onSelectBrand(null); // 선택된 브랜드 초기화
    };

    return (
      <BottomSheet
        ref={ref}
        index={1}
        snapPoints={snapPoints}
        onChange={handleSheetChanges}
        handleStyle={styles.handle}
        handleIndicatorStyle={styles.indicator}
        backgroundStyle={styles.background}
      >
        {selectedBrand && (
          <View style={styles.headerContainer}>
            <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
              <Icon name="arrow-back-ios" type="material" size={22} color="#56AEE9" />
              <Text style={styles.backText}>전체 목록</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.contentContainer}>
          <MapGifticonList
            gifticons={gifticons}
            onUseGifticon={onUseGifticon}
            onSelectBrand={onSelectBrand}
            selectedBrand={selectedBrand}
          />
        </View>
      </BottomSheet>
    );
  }
);

const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#56AEE9',
    fontFamily: 'Pretendard-Medium',
  },
  handle: {
    backgroundColor: 'white',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingVertical: 10,
  },
  indicator: {
    backgroundColor: '#CCCCCC',
    width: 40,
    height: 4,
  },
  background: {
    backgroundColor: 'white',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 12,
  },
});

export default GifticonBottomSheet;
