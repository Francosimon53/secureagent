# SecureAgent Companion Apps

Native companion apps for SecureAgent across multiple platforms.

## Apps Overview

| App | Platform | Description |
|-----|----------|-------------|
| **macOS** | macOS 10.15+ | Menu bar app with global shortcut |
| **iOS** | iOS 15+ | Mobile app with share extension |
| **Android** | Android 8+ | Mobile app with home screen widget |

## Directory Structure

```
apps/
├── README.md           # This file
├── macos/              # Electron menu bar app
│   ├── package.json
│   ├── README.md
│   └── src/
├── mobile/             # Shared React Native code
│   ├── package.json
│   ├── README.md
│   └── src/
├── ios/                # iOS-specific configuration
│   ├── package.json
│   ├── README.md
│   └── ios/
└── android/            # Android-specific configuration
    ├── package.json
    ├── README.md
    └── android/
```

## Quick Start

### macOS Menu Bar App

```bash
cd apps/macos
npm install
npm start
```

Features:
- Lives in menu bar with shield icon
- Global shortcut: `Cmd+Shift+A`
- Quick actions: Summarize, Translate, Explain, Fix Grammar
- Native notifications
- Settings: API URL, shortcut, launch at login

### iOS App

```bash
cd apps/mobile && npm install
cd ../ios && npm install
cd ios && pod install && cd ..
npm run ios
```

Features:
- Full chat interface
- Voice input
- Push notifications
- Share extension
- Quick actions

### Android App

```bash
cd apps/mobile && npm install
cd ../android && npm install
npm run android
```

Features:
- Full chat interface
- Voice input
- Push notifications
- Share intent
- Home screen widget
- Quick actions

## Shared Code

The `apps/mobile/` directory contains shared React Native code used by both iOS and Android apps:

- **Components**: ChatMessage, ChatInput, QuickActions
- **Hooks**: useChat, useVoice
- **Services**: API, Voice, Notifications
- **Screens**: ChatScreen, SettingsScreen
- **Types**: Shared TypeScript definitions

## Configuration

All apps connect to a SecureAgent backend. Configure the API URL in settings:

| Platform | Settings Location |
|----------|-------------------|
| macOS | Settings window |
| iOS | Settings tab |
| Android | Settings tab |

Default API URL: `http://localhost:3000`

## Building for Production

### macOS

```bash
cd apps/macos
npm run build           # Current architecture
npm run build:mac-x64   # Intel
npm run build:mac-arm64 # Apple Silicon
```

### iOS

```bash
cd apps/ios
npm run build:release
```

Open Xcode for archiving and distribution.

### Android

```bash
cd apps/android
npm run android:release  # APK
npm run android:bundle   # AAB for Play Store
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SecureAgent Backend                       │
│                    (API at /api/chat)                        │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTP/HTTPS
           ┌──────────────────┼──────────────────┐
           │                  │                  │
    ┌──────┴──────┐    ┌──────┴──────┐    ┌──────┴──────┐
    │   macOS     │    │    iOS      │    │   Android   │
    │  (Electron) │    │(React Native)│   │(React Native)│
    └─────────────┘    └─────────────┘    └─────────────┘
                              │
                       ┌──────┴──────┐
                       │   Shared    │
                       │   Mobile    │
                       │    Code     │
                       └─────────────┘
```

## Requirements

### Development

- Node.js 18+
- npm or yarn

### macOS App

- macOS 10.15+
- Xcode Command Line Tools

### iOS App

- macOS with Xcode 15+
- CocoaPods
- iOS device or simulator

### Android App

- Android Studio
- Android SDK 34
- NDK 25.1.8937393
- Android device or emulator

## License

MIT
