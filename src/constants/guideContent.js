import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export const guideSteps = [
  // Step 1: 초기 화면
  {
    title: '아차차!',
    subText1: '또 기프티콘 유효기간을',
    subText2: '놓치셨다구요?',
    image: require('../../assets/giftbox1.png'),
    // 첫 화면 이미지는 컴포넌트에서 조건부 렌더링, 이 경로는 현재 사용 안 함
  },
  // Step 2: 이미지 업로드
  {
    title: '이미지 업로드만으로 똑똑하게',
    subText1: '브랜드, 상품, 유효기간까지',
    subText2: '자동 인식',
    image: require('../../assets/giftscan.png'),
  },
  // Step 3: 유효기간 알림
  {
    title: '유효기간 임박?',
    subText1: '원하는 시간에 똑똑하게',
    subText2: '알려드릴게요.',
    image: require('../../assets/bell.png'),
    imageStyle: { width: width * 0.5, height: width * 0.5 }, // 개별 스타일 예시
  },
  // Step 4: 기프티콘 전달
  {
    title: '쓱- 하고 넘기면,',
    subText1: '기프티콘이 누군가에게 🎁',
    subText2: '',
    image: require('../../assets/gesture.png'),
  },
  // Step 5: 쉐어박스
  {
    title: '연인도, 가족도, 친구도.',
    subText1: '모두 함께 쓰는 쉐어박스',
    subText2: '',
    image: require('../../assets/share.png'),
  },
];
