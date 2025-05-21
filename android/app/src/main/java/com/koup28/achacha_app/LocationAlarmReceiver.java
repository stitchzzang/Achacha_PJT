package com.koup28.achacha_app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.os.Bundle;
import android.util.Log;

public class LocationAlarmReceiver extends BroadcastReceiver {
  private static final String TAG = "LocationAlarmReceiver";
  
  @Override
  public void onReceive(Context context, Intent intent) {
    Log.d(TAG, "알람 수신: 위치 서비스 시작");
    
    // 위치 업데이트 서비스 시작 (알림 없이)
    Intent serviceIntent = new Intent(context, BackgroundLocationService.class);
    serviceIntent.putExtra("skipNotification", true); // 알림 스킵 플래그 추가
    
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Log.d(TAG, "startForegroundService 호출");
      context.startForegroundService(serviceIntent);
    } else {
      Log.d(TAG, "startService 호출");
      context.startService(serviceIntent);
    }
    
    // 다음 알람 설정
    scheduleNextAlarm(context);
  }
  
  private void scheduleNextAlarm(Context context) {
    Log.d(TAG, "다음 알람 예약");
    
    AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    Intent intent = new Intent(context, LocationAlarmReceiver.class);
    
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags |= PendingIntent.FLAG_IMMUTABLE;
    }
    
    PendingIntent pendingIntent = PendingIntent.getBroadcast(
      context, 
      0, 
      intent, 
      flags
    );
    
    // 30분마다 반복 알람
    long intervalMillis = 30 * 60 * 1000; // 30분
    long triggerAtMillis = System.currentTimeMillis() + intervalMillis;
    
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      alarmManager.setExactAndAllowWhileIdle(
        AlarmManager.RTC_WAKEUP,
        triggerAtMillis,
        pendingIntent
      );
      Log.d(TAG, "알람 예약됨 (setExactAndAllowWhileIdle): " + triggerAtMillis);
    } else {
      alarmManager.set(
        AlarmManager.RTC_WAKEUP,
        triggerAtMillis,
        pendingIntent
      );
      Log.d(TAG, "알람 예약됨 (set): " + triggerAtMillis);
    }
  }
}