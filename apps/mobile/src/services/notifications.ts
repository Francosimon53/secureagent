/**
 * SecureAgent Mobile - Push Notifications Service
 */

import { Platform } from 'react-native';
import PushNotification from 'react-native-push-notification';
import PushNotificationIOS from '@react-native-community/push-notification-ios';
import type { NotificationData } from '../types';

class NotificationService {
  private isConfigured = false;

  configure(): void {
    if (this.isConfigured) return;

    PushNotification.configure({
      onRegister: (token) => {
        console.log('Push notification token:', token);
        // Send token to server for push notifications
      },

      onNotification: (notification) => {
        console.log('Notification received:', notification);

        // Process notification
        this.handleNotification(notification);

        // Required on iOS
        if (Platform.OS === 'ios') {
          notification.finish(PushNotificationIOS.FetchResult.NoData);
        }
      },

      onAction: (notification) => {
        console.log('Notification action:', notification.action);
      },

      onRegistrationError: (error) => {
        console.error('Push notification registration error:', error);
      },

      // iOS permissions
      permissions: {
        alert: true,
        badge: true,
        sound: true,
      },

      popInitialNotification: true,
      requestPermissions: Platform.OS === 'ios',
    });

    // Create notification channels for Android
    if (Platform.OS === 'android') {
      this.createChannels();
    }

    this.isConfigured = true;
  }

  private createChannels(): void {
    PushNotification.createChannel(
      {
        channelId: 'secureagent-messages',
        channelName: 'Messages',
        channelDescription: 'Notifications for new messages',
        playSound: true,
        soundName: 'default',
        importance: 4,
        vibrate: true,
      },
      (created) => console.log(`Message channel created: ${created}`)
    );

    PushNotification.createChannel(
      {
        channelId: 'secureagent-reminders',
        channelName: 'Reminders',
        channelDescription: 'Scheduled reminders',
        playSound: true,
        soundName: 'default',
        importance: 4,
        vibrate: true,
      },
      (created) => console.log(`Reminders channel created: ${created}`)
    );

    PushNotification.createChannel(
      {
        channelId: 'secureagent-alerts',
        channelName: 'Alerts',
        channelDescription: 'Important alerts',
        playSound: true,
        soundName: 'default',
        importance: 5,
        vibrate: true,
      },
      (created) => console.log(`Alerts channel created: ${created}`)
    );
  }

  private handleNotification(notification: unknown): void {
    // Handle notification based on type
    console.log('Processing notification:', notification);
  }

  async requestPermission(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      const authStatus = await PushNotificationIOS.requestPermissions({
        alert: true,
        badge: true,
        sound: true,
      });
      return authStatus.alert || authStatus.badge || authStatus.sound;
    }
    return true; // Android permissions handled at install time
  }

  showLocalNotification(data: NotificationData): void {
    const channelId = `secureagent-${data.type}s`;

    PushNotification.localNotification({
      channelId,
      title: data.title,
      message: data.body,
      userInfo: data.data,
      playSound: true,
      soundName: 'default',
      vibrate: true,
      vibration: 300,
    });
  }

  scheduleNotification(
    data: NotificationData,
    date: Date
  ): void {
    const channelId = `secureagent-${data.type}s`;

    PushNotification.localNotificationSchedule({
      channelId,
      title: data.title,
      message: data.body,
      date,
      userInfo: data.data,
      playSound: true,
      soundName: 'default',
      vibrate: true,
      allowWhileIdle: true,
    });
  }

  cancelAllNotifications(): void {
    PushNotification.cancelAllLocalNotifications();
  }

  setBadgeCount(count: number): void {
    if (Platform.OS === 'ios') {
      PushNotificationIOS.setApplicationIconBadgeNumber(count);
    } else {
      PushNotification.setApplicationIconBadgeNumber(count);
    }
  }

  clearBadge(): void {
    this.setBadgeCount(0);
  }
}

export const notifications = new NotificationService();
