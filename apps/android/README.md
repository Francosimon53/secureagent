# SecureAgent Android App

Native Android app for SecureAgent with chat, push notifications, voice input, and home screen widget.

## Features

- **Chat Interface**: Full conversation with SecureAgent
- **Quick Actions**: Summarize, translate, explain, fix grammar
- **Voice Input**: Speak to send messages
- **Push Notifications**: Receive alerts and updates
- **Share Intent**: Share text from any app to SecureAgent
- **Home Screen Widget**: Quick access from your home screen
- **Material Design**: Native Android look and feel

## Requirements

- Android Studio Hedgehog (2023.1.1) or later
- Android SDK 34
- NDK 25.1.8937393
- Node.js 18+
- Java 17

## Setup

### 1. Install Dependencies

```bash
cd apps/android
npm install

# Install shared mobile code
cd ../mobile
npm install
cd ../android
```

### 2. Start Metro Bundler

```bash
npm start
```

### 3. Run on Device/Emulator

```bash
npm run android
```

## Building

### Debug APK

```bash
cd android
./gradlew assembleDebug
```

APK located at: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release APK

1. Generate a signing key:

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore secureagent.keystore -alias secureagent -keyalg RSA -keysize 2048 -validity 10000
```

2. Add to `~/.gradle/gradle.properties`:

```properties
SECUREAGENT_UPLOAD_STORE_FILE=secureagent.keystore
SECUREAGENT_UPLOAD_KEY_ALIAS=secureagent
SECUREAGENT_UPLOAD_STORE_PASSWORD=*****
SECUREAGENT_UPLOAD_KEY_PASSWORD=*****
```

3. Build release:

```bash
npm run android:release
```

### App Bundle (for Play Store)

```bash
npm run android:bundle
```

Bundle located at: `android/app/build/outputs/bundle/release/app-release.aab`

## Project Structure

```
apps/android/
├── package.json
├── index.js                  # Entry point
├── app.json                  # App configuration
├── metro.config.js           # Metro bundler config
└── android/
    ├── settings.gradle
    ├── build.gradle
    ├── gradle.properties
    └── app/
        ├── build.gradle
        └── src/main/
            ├── AndroidManifest.xml
            ├── java/com/secureagent/
            │   ├── MainActivity.kt
            │   ├── MainApplication.kt
            │   └── widget/
            │       └── SecureAgentWidgetProvider.kt
            └── res/
                ├── layout/
                │   └── widget_secureagent.xml
                ├── drawable/
                │   ├── widget_background.xml
                │   └── widget_button_background.xml
                ├── values/
                │   ├── strings.xml
                │   ├── styles.xml
                │   └── colors.xml
                └── xml/
                    ├── widget_info.xml
                    └── network_security_config.xml
```

## Home Screen Widget

The widget provides quick access to SecureAgent:

1. Long press on home screen
2. Select "Widgets"
3. Find "SecureAgent"
4. Drag to home screen

Widget features:
- Tap to open the app
- Quick action buttons for common tasks
- Resizable (2x2 to 4x2)

## Share Intent

To share text with SecureAgent:

1. Select text in any app
2. Tap Share
3. Choose SecureAgent
4. The text will be processed with your chosen action

## Permissions

The app requires:

- **Internet**: For API communication
- **Microphone**: For voice input
- **Vibrate**: For haptic feedback
- **Boot completed**: For scheduled notifications
- **Notifications**: For push notifications (Android 13+)

## Troubleshooting

### Build fails with Gradle errors

```bash
cd android
./gradlew clean
./gradlew --stop
cd ..
npm run android
```

### Metro bundler issues

```bash
npm start -- --reset-cache
```

### Device not detected

```bash
adb devices
adb kill-server
adb start-server
```

### Widget not updating

1. Remove widget from home screen
2. Clear app data
3. Re-add widget

## License

MIT
