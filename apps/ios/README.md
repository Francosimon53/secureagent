# SecureAgent iOS App

Native iOS app for SecureAgent with chat, push notifications, voice input, and share extension.

## Features

- **Chat Interface**: Full conversation with SecureAgent
- **Quick Actions**: Summarize, translate, explain, fix grammar
- **Voice Input**: Speak to send messages
- **Push Notifications**: Receive alerts and updates
- **Share Extension**: Share text from any app to SecureAgent
- **Dark Mode**: Native iOS dark mode support

## Requirements

- macOS with Xcode 15+
- iOS 15.0+ device or simulator
- Node.js 18+
- CocoaPods

## Setup

### 1. Install Dependencies

```bash
cd apps/ios
npm install

# Install shared mobile code
cd ../mobile
npm install
cd ../ios

# Install iOS pods
cd ios
pod install
cd ..
```

### 2. Configure Signing

1. Open `ios/SecureAgent.xcworkspace` in Xcode
2. Select the SecureAgent target
3. Go to Signing & Capabilities
4. Select your team and bundle identifier
5. Repeat for SecureAgentShare target

### 3. Configure Push Notifications

1. Create an Apple Push Notification key in App Store Connect
2. Add Push Notifications capability in Xcode
3. Configure your server with the APNs key

## Development

### Run in Simulator

```bash
npm run ios
```

### Run on Device

```bash
npm run ios:device
```

### Build Release

```bash
npm run build:release
```

## Project Structure

```
apps/ios/
├── package.json
├── index.js              # Entry point
├── app.json              # App configuration
├── metro.config.js       # Metro bundler config
├── babel.config.js       # Babel config
└── ios/
    ├── Podfile           # CocoaPods dependencies
    ├── SecureAgent/      # Main app target
    │   ├── AppDelegate.h
    │   ├── AppDelegate.mm
    │   ├── Info.plist
    │   └── Images.xcassets/
    └── SecureAgentShare/ # Share extension
        ├── ShareViewController.swift
        └── Info.plist
```

## Share Extension

The share extension allows users to share text from any app to SecureAgent:

1. Select text in any app
2. Tap Share
3. Choose SecureAgent
4. Select an action (Summarize, Translate, etc.)
5. View result in the extension or open the main app

### Share Extension Setup

1. Open Xcode workspace
2. SecureAgentShare target should already exist
3. Configure signing for the extension
4. Ensure App Groups are enabled for data sharing

## Permissions

The app requires the following permissions:

- **Microphone**: For voice input
- **Notifications**: For push notifications
- **Network**: For API communication

Add these to `Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>SecureAgent needs microphone access for voice input</string>
```

## Troubleshooting

### Build fails with Pod errors

```bash
cd ios
pod deintegrate
pod install
```

### Signing issues

1. Clean build folder (Cmd+Shift+K)
2. Delete derived data
3. Re-select your team in signing settings

### Metro bundler issues

```bash
npm start -- --reset-cache
```

## License

MIT
