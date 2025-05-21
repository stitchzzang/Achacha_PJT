import apiClient from './apiClient';
import { API_CONFIG } from './config';
import gifticonService from './gifticonService';
import { checkShareBoxAccessibility } from './shareBoxService';

/**
 * 알림 설정 관련 기능을 제공하는 서비스
 *
 * API 엔드포인트:
 * - GET /api/notification-settings - 알림 설정 목록 조회
 * - PATCH /api/notifications-settings/types/{type} - 알림 타입별 활성화/비활성화
 * - PATCH /api/notifications-settings/expiration-cycle - 알림 주기 설정
 * - GET /api/notifications - 알림 내역 목록 조회
 * - GET /api/notifications/count - 미확인 알림 개수 조회
 * - PATCH /api/notifications/read - 알림 읽음 일괄 처리
 */
const notificationService = {
  /**
   * 알림 설정 목록 조회
   * @returns {Promise<Array>} 알림 설정 목록
   */
  async getNotificationSettings() {
    try {
      console.log('[API] 알림 설정 목록 조회 요청');
      const response = await apiClient.get(API_CONFIG.ENDPOINTS.NOTIFICATION_SETTINGS);
      console.log('[API] 알림 설정 목록 조회 성공:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] 알림 설정 목록 조회 실패:', error);

      // 에러 상세 정보 로그
      if (error.response) {
        console.error('서버 응답 오류:', error.response.status, error.response.data);
      } else if (error.request) {
        console.error('서버 응답 없음:', error.request);
      } else {
        console.error('요청 설정 오류:', error.message);
      }

      throw error;
    }
  },

  /**
   * 알림 타입별 활성화/비활성화 설정
   * @param {string} type - 알림 타입 (LOCATION_BASED, EXPIRY_DATE, RECEIVE_GIFTICON, USAGE_COMPLETE, SHAREBOX_GIFTICON, SHAREBOX_USAGE_COMPLETE, SHAREBOX_MEMBER_JOIN, SHAREBOX_DELETED)
   * @param {boolean} enabled - 활성화 여부
   * @returns {Promise<Object>} 업데이트 결과
   */
  async updateNotificationTypeStatus(type, enabled) {
    try {
      console.log(`[API] 알림 타입(${type}) 상태 업데이트 요청:`, enabled ? '활성화' : '비활성화');

      // API 엔드포인트 생성
      const endpoint = API_CONFIG.ENDPOINTS.NOTIFICATION_SETTINGS_TYPE(type);
      console.log('[API] 요청 URL:', endpoint);

      // API 요청 데이터
      const requestData = { isEnabled: enabled };

      const response = await apiClient.patch(endpoint, requestData);
      console.log(`[API] 알림 타입(${type}) 상태 업데이트 성공:`, response.data);

      return response.data;
    } catch (error) {
      console.error(`[API] 알림 타입(${type}) 상태 업데이트 실패:`, error);

      // 에러 상세 정보 로그
      if (error.response) {
        const { status, data } = error.response;
        console.error('서버 응답 오류:', status, data);

        // 특정 에러 코드에 대한 처리
        if (data.errorCode === 'NOTIFICATION_001') {
          console.error('존재하지 않는 알림 타입입니다.');
        } else if (data.errorCode === 'NOTIFICATION_002') {
          console.error('알림 설정을 찾을 수 없습니다.');
        }
      }

      throw error;
    }
  },

  /**
   * 유효기간 만료 알림 주기 설정
   * @param {string} expirationCycle - 알림 주기 (ONE_DAY, TWO_DAYS, THREE_DAYS, ONE_WEEK, ONE_MONTH, TWO_MONTHS, THREE_MONTHS)
   * @returns {Promise<string>} 업데이트 결과 메시지
   */
  async updateExpirationCycle(expirationCycle) {
    try {
      console.log('[API] 알림 주기 설정 요청:', expirationCycle);

      // 유효한 알림 주기 값 검증
      const validCycles = [
        'ONE_DAY',
        'TWO_DAYS',
        'THREE_DAYS',
        'ONE_WEEK',
        'ONE_MONTH',
        'TWO_MONTHS',
        'THREE_MONTHS',
      ];

      if (!validCycles.includes(expirationCycle)) {
        console.error('[API] 유효하지 않은 알림 주기 값:', expirationCycle);
        throw new Error('유효하지 않은 알림 주기 값입니다.');
      }

      const endpoint = API_CONFIG.ENDPOINTS.NOTIFICATION_SETTINGS_EXPIRATION_CYCLE;
      console.log('[API] 요청 URL:', endpoint);

      // API 요청 데이터
      const requestData = { expirationCycle };
      console.log('[API] 요청 데이터:', JSON.stringify(requestData));

      // 명시적 헤더 설정
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      // 토큰이 가장 최신 상태인지 확인
      const token = await apiClient.defaults.headers.common.Authorization;
      console.log('[API] 현재 인증 토큰:', token ? '존재함' : '없음');

      const response = await apiClient.patch(endpoint, requestData, { headers });

      console.log('[API] 알림 주기 설정 응답:', response.status);
      console.log('[API] 알림 주기 설정 응답 데이터:', JSON.stringify(response.data));

      return response.data;
    } catch (error) {
      console.error('[API] 알림 주기 설정 실패:', error);

      // 에러 상세 정보 로그
      if (error.response) {
        const { status, data } = error.response;
        console.error('[API] 서버 응답 오류:', status, JSON.stringify(data));

        // 특정 에러 코드에 대한 처리
        if (data.errorCode === 'NOTIFICATION_002') {
          console.error('[API] 알림 설정을 찾을 수 없습니다.');
        } else if (data.errorCode === 'NOTIFICATION_003') {
          console.error('[API] 비활성화된 알림입니다. 먼저 알림을 활성화해주세요.');
        }
      } else if (error.request) {
        // 요청은 전송되었지만 응답이 수신되지 않음
        console.error('[API] 서버 응답 없음:', JSON.stringify(error.request));
      } else {
        // 요청 설정 중 오류 발생
        console.error('[API] 요청 설정 오류:', error.message);
      }

      throw error;
    }
  },

  /**
   * 알림 내역 목록 조회
   * @param {Object} params - 조회 파라미터
   * @param {string} [params.sort='CREATED_DESC'] - 정렬 방식 (CREATED_DESC: 최신순)
   * @param {string} [params.page] - 페이지 번호
   * @param {number} [params.size=6] - 페이지당 항목 수
   * @returns {Promise<Object>} 알림 내역 목록 및 페이지 정보
   */
  async getNotifications(params = {}) {
    try {
      // console.log('[API] 알림 내역 목록 조회 요청', params);

      // 기본값 설정
      const defaultParams = {
        sort: 'CREATED_DESC',
        size: 6,
      };

      // 기본값과 사용자 지정 파라미터 병합
      const queryParams = { ...defaultParams, ...params };

      const response = await apiClient.get(API_CONFIG.ENDPOINTS.NOTIFICATIONS, {
        params: queryParams,
      });

      // console.log('[API] 알림 내역 목록 조회 성공:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] 알림 내역 목록 조회 실패:', error);

      // 에러 상세 정보 로그
      if (error.response) {
        console.error('서버 응답 오류:', error.response.status, error.response.data);
      } else if (error.request) {
        console.error('서버 응답 없음:', error.request);
      } else {
        console.error('요청 설정 오류:', error.message);
      }

      throw error;
    }
  },

  /**
   * 읽지 않은 알림 개수 조회
   * @returns {Promise<Object>} - 읽지 않은 알림 개수
   */
  async getUnreadNotificationsCount() {
    try {
      const response = await apiClient.get(API_CONFIG.ENDPOINTS.NOTIFICATIONS_COUNT);
      return response.data;
    } catch (error) {
      console.error('[API] 읽지 않은 알림 개수 조회 실패:', error);
      throw error;
    }
  },

  /**
   * 모든 알림 읽음 처리
   * @returns {Promise<Object>} - 읽음 처리 결과
   */
  async markAllNotificationsAsRead() {
    try {
      const response = await apiClient.patch(API_CONFIG.ENDPOINTS.NOTIFICATIONS_READ);
      return response.data;
    } catch (error) {
      console.error('[API] 모든 알림 읽음 처리 실패:', error);
      throw error;
    }
  },

  /**
   * 기프티콘 상세 정보 조회
   * @param {number} gifticonId - 기프티콘 ID
   * @returns {Promise<Object>} - 기프티콘 상세 정보
   */
  async getGifticonDetail(gifticonId) {
    // gifticonService를 사용하여 기프티콘 상세 정보 조회
    // 알림에서는 MY_BOX 기준으로 확인
    return gifticonService.getGifticonDetail(gifticonId, 'MY_BOX');
  },

  /**
   * FCM 토큰 업데이트
   * @param {string} token - FCM 토큰
   * @returns {Promise<Object>} 업데이트 결과
   */
  async updateFcmToken(token) {
    try {
      console.log('[API] FCM 토큰 업데이트 요청:', token);
      const response = await apiClient.post(API_CONFIG.ENDPOINTS.FCM_TOKEN_UPDATE, {
        fcmToken: token,
      });
      console.log('[API] FCM 토큰 업데이트 성공:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] FCM 토큰 업데이트 실패:', error);
      throw error;
    }
  },

  /**
   * 쉐어박스 접근 가능 여부 확인
   * @param {number} shareBoxId - 쉐어박스 ID
   * @returns {Promise<boolean>} - 접근 가능 여부
   */
  async checkShareBoxAccessibility(shareBoxId) {
    try {
      console.log('[API] 쉐어박스 접근 가능 여부 확인 요청:', shareBoxId);
      const response = await checkShareBoxAccessibility(shareBoxId);
      console.log('[API] 쉐어박스 접근 가능 여부 확인 성공:', response);
      return response;
    } catch (error) {
      console.error('[API] 쉐어박스 접근 가능 여부 확인 실패:', error);
      throw error;
    }
  },
};

export default notificationService;
