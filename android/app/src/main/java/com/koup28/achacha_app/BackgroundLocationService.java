package com.koup28.achacha_app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import androidx.core.app.NotificationCompat;

import com.facebook.react.HeadlessJsTaskService;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.jstasks.HeadlessJsTaskConfig;

public class BackgroundLocationService extends HeadlessJsTaskService {
  private static final String TAG = "BackgroundLocationSvc";
  private static final int NOTIFICATION_ID = 1234;
  private static final String CHANNEL_ID = "location_notification_channel";

  @Override
  public void onCreate() {
    super.onCreate();
    
    // Android 8.0 이상에서는 포그라운드 서비스 필수
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Log.d(TAG, "포그라운드 서비스 시작");
      createNotificationChannel();
      
      NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle("아차차")
        .setContentText("주변 매장의 기프티콘을 찾고 있어요")
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setCategory(NotificationCompat.CATEGORY_SERVICE);
      
      // 아이콘 설정
      try {
        // adaptive_icon.png를 찾도록 수정
        int iconResourceId = getResources().getIdentifier("adaptive_icon", "drawable", getPackageName());
        if (iconResourceId != 0) {
          builder.setSmallIcon(iconResourceId);
        } else {
          // 기본 아이콘 사용
          builder.setSmallIcon(android.R.drawable.ic_dialog_info);
        }
      } catch (Exception e) {
        Log.e(TAG, "알림 아이콘 설정 오류", e);
        builder.setSmallIcon(android.R.drawable.ic_dialog_info);
      }
      
      Notification notification = builder.build();
      
      // Android 14(API 34) 이상에서는 foregroundServiceType 필요
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
      } else {
        startForeground(NOTIFICATION_ID, notification);
      }
    }
  }

  private void createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel = new NotificationChannel(
        CHANNEL_ID,
        "위치 추적",
        NotificationManager.IMPORTANCE_LOW
      );
      channel.setDescription("백그라운드에서 위치를 추적하고 주변 매장을 찾습니다");
      
      NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      manager.createNotificationChannel(channel);
      Log.d(TAG, "알림 채널 생성 완료");
    }
  }

  @Override
  protected HeadlessJsTaskConfig getTaskConfig(Intent intent) {
    Log.d(TAG, "HeadlessJS 태스크 구성 생성");
    
    Bundle extras = intent.getExtras();
    if (extras == null) {
      extras = new Bundle();
    }
    
    // 태스크 이름은 App.js의 LOCATION_TRACKING 상수와 일치시켜야 함
    return new HeadlessJsTaskConfig(
      "background-location-tracking", // TaskManager와 일치하는 태스크 이름
      Arguments.fromBundle(extras),
      30000, // 30초 타임아웃
      true // 앱이 포그라운드에 있어도 실행
    );
  }
}