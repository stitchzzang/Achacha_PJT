package com.eurachacha.achacha.application.port.input.notification;

import com.eurachacha.achacha.application.port.input.notification.dto.response.NotificationsResponseDto;
import com.eurachacha.achacha.domain.model.notification.enums.NotificationSortType;

public interface NotificationAppService {

	NotificationsResponseDto getNotifications(NotificationSortType sort, Integer page, Integer size);
}
