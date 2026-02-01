# SecureAgent Mobile - Shared Code

Shared React Native code for SecureAgent iOS and Android apps.

## Overview

This package contains the shared components, hooks, services, and screens used by both the iOS and Android apps. It follows a monorepo structure where platform-specific apps import from this shared package.

## Structure

```
apps/mobile/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # Entry point / App component
    ├── App.tsx               # Main application
    ├── types/
    │   └── index.ts          # Shared TypeScript types
    ├── services/
    │   ├── api.ts            # API service for SecureAgent backend
    │   ├── voice.ts          # Voice input service
    │   └── notifications.ts  # Push notifications service
    ├── hooks/
    │   ├── useChat.ts        # Chat state management
    │   └── useVoice.ts       # Voice input hook
    ├── components/
    │   ├── index.ts          # Component exports
    │   ├── ChatMessage.tsx   # Message bubble component
    │   ├── ChatInput.tsx     # Input with voice button
    │   └── QuickActions.tsx  # Quick action buttons
    └── screens/
        ├── index.ts          # Screen exports
        ├── ChatScreen.tsx    # Main chat screen
        └── SettingsScreen.tsx # Settings screen
```

## Features

### Chat System
- Message history with timestamps
- Automatic scrolling to latest message
- Long press to copy messages
- Conversation persistence

### Quick Actions
- Summarize clipboard content
- Translate text
- Explain concepts
- Fix grammar

### Voice Input
- Speech-to-text using device microphone
- Visual feedback while listening
- Automatic send on speech end

### Push Notifications
- Message notifications
- Reminder notifications
- Alert notifications
- Badge count management

### Settings
- API URL configuration
- API key management
- Push notification toggle
- Voice input toggle
- Haptic feedback toggle
- Theme selection (light/dark/system)

## Usage

This package is meant to be used as a dependency in the platform-specific apps:

```json
{
  "dependencies": {
    "@secureagent/mobile": "file:../mobile"
  }
}
```

Import the app in your platform entry point:

```javascript
import App from '@secureagent/mobile';
import { AppRegistry } from 'react-native';

AppRegistry.registerComponent('SecureAgent', () => App);
```

## Dependencies

- **react-native**: Core framework
- **@react-native-async-storage/async-storage**: Settings persistence
- **@react-native-clipboard/clipboard**: Clipboard operations
- **@react-native-community/push-notification-ios**: iOS push notifications
- **@react-native-voice/voice**: Voice input
- **react-native-push-notification**: Android push notifications
- **react-native-safe-area-context**: Safe area handling
- **react-native-vector-icons**: Icon library

## Development

### Install Dependencies

```bash
npm install
```

### Type Check

```bash
npm run typecheck
```

### Lint

```bash
npm run lint
```

### Test

```bash
npm run test
```

## API Integration

The API service expects a SecureAgent backend at the configured URL:

```typescript
// Endpoints used
POST /api/chat    // Send message
GET  /api/health  // Health check
```

Request format:
```json
{
  "message": "User message",
  "conversationId": "optional-id"
}
```

Response format:
```json
{
  "response": "Assistant response",
  "conversationId": "conversation-id"
}
```

## License

MIT
