import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
const { width } = Dimensions.get('window');
import { calculateDday } from '../utils/dateUtils';

const GiveAwayGifticonList = ({ gifticons, onSelectGifticon }) => {
  const renderGifticonItem = ({ item }) => {
    const dday = calculateDday(item.gifticonExpiryDate);

    let numericDday = Infinity;
    if (dday && typeof dday === 'string') {
      if (dday.toUpperCase() === 'D-DAY') {
        numericDday = 0;
      } else if (dday.startsWith('D-')) {
        const parts = dday.split('-');
        if (parts.length === 2) {
          const dayValue = parseInt(parts[1], 10);
          if (!isNaN(dayValue)) {
            numericDday = dayValue;
          }
        }
      }
    }

    const isExpired = dday === '만료됨';

    return (
      <TouchableOpacity style={styles.gifticonItem} onPress={() => onSelectGifticon(item)}>
        <View style={styles.contentContainer}>
          <View style={styles.gifticonDetails}>
            <Image source={{ uri: item.thumbnailPath }} style={styles.productImg} />
            <View style={styles.textContainer}>
              <Text style={styles.brandName}>{item.brandName}</Text>
              <Text style={styles.productName}>
                {item.gifticonName.length > 10
                  ? `${item.gifticonName.substring(0, 10)}...`
                  : item.gifticonName}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.ddayContainer,
              isExpired
                ? styles.expiredDDayBackground
                : numericDday <= 7
                  ? styles.urgentDDayBackground
                  : styles.normalDDayBackground,
            ]}
          >
            <Text
              style={[
                styles.ddayText,
                isExpired
                  ? styles.expiredDDayText
                  : numericDday <= 7
                    ? styles.urgentDDayText
                    : styles.normalDDayText,
              ]}
            >
              {dday}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.listContainer}>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>나의 기프티콘</Text>
        <Text style={styles.listSubtitle}>*임박순으로 표시 / 상품형만 가능</Text>
      </View>
      {gifticons && gifticons.length > 0 ? (
        <BottomSheetFlatList
          data={gifticons}
          renderItem={renderGifticonItem}
          keyExtractor={item => item.gifticonId.toString()}
          style={{ flex: 1 }}
          contentContainerStyle={{ ...styles.flatListContent, paddingBottom: 20 }}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>보유한 기프티콘이 없습니다.</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  listContainer: {
    flex: 1,
    backgroundColor: '#E5F4FE',
    width: '90%',
    paddingTop: 4,
    borderRadius: 10,
    alignSelf: 'center',
  },
  flatListContent: {
    paddingTop: 4,
  },
  gifticonItem: {
    backgroundColor: '#F5FBFF',
    borderRadius: 10,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gifticonDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productImg: {
    width: 55,
    height: 55,
    marginRight: 12,
    borderRadius: 5,
  },
  textContainer: {
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 16,
    fontFamily: 'Pretendard-Bold',
    color: 'black',
    marginBottom: 4,
  },
  productName: {
    fontSize: 14,
    fontFamily: 'Pretendard-Medium',
    color: 'black',
  },
  ddayContainer: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  ddayText: {
    fontSize: 17,
    fontFamily: 'Pretendard-Bold',
  },
  urgentDDayBackground: {
    backgroundColor: 'rgba(234, 84, 85, 0.15)',
  },
  normalDDayBackground: {
    backgroundColor: 'rgba(114, 191, 255, 0.15)',
  },
  urgentDDayText: {
    color: '#EA5455',
  },
  normalDDayText: {
    color: '#72BFFF',
  },
  expiredDDayBackground: {
    backgroundColor: 'rgba(153, 153, 153, 0.15)',
  },
  expiredDDayText: {
    color: '#737373',
    fontFamily: 'Pretendard-Bold',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    marginBottom: 4,
  },
  listTitle: {
    fontSize: 18,
    fontFamily: 'Pretendard-Bold',
    color: 'white',
    backgroundColor: '#278CCC',
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 10,
  },
  listSubtitle: {
    fontSize: 12,
    fontFamily: 'Pretendard-Bold',
    color: '#278CCC',
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5FBFF',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#555',
    textAlign: 'center',
  },
});

export default GiveAwayGifticonList;
