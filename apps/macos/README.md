# SecureAgent macOS Menu Bar App

A lightweight Electron-based menu bar app for quick access to SecureAgent.

## Features

- **Menu Bar Integration**: Lives in your menu bar with a shield icon
- **Global Shortcut**: Press `Cmd+Shift+A` to quickly open/close
- **Quick Actions**:
  - Summarize clipboard content
  - Translate text
  - Explain concepts
  - Fix grammar
- **Native Notifications**: Get notified of important events
- **Settings**: Configure API endpoint, keyboard shortcuts, and more
- **Launch at Login**: Optional auto-start on login

## Requirements

- macOS 10.15 or later
- Node.js 18 or later
- npm or yarn

## Development

### Install Dependencies

```bash
cd apps/macos
npm install
```

### Run in Development

```bash
npm start
```

### Build for Production

```bash
# Build for current architecture
npm run build

# Build for Intel Macs
npm run build:mac-x64

# Build for Apple Silicon
npm run build:mac-arm64
```

## Project Structure

```
apps/macos/
├── package.json
├── entitlements.mac.plist    # macOS app entitlements
├── assets/
│   ├── icon.icns             # App icon
│   └── trayIconTemplate.png  # Menu bar icon (template image)
└── src/
    ├── main/
    │   ├── main.js           # Main process (tray, shortcuts, IPC)
    │   └── preload.js        # Context bridge for renderer
    └── renderer/
        ├── index.html        # Main chat window
        ├── styles.css        # Styling
        ├── app.js            # Chat functionality
        └── settings.html     # Settings page
```

## Configuration

Settings are stored in `~/Library/Application Support/secureagent-menubar/config.json`:

```json
{
  "apiUrl": "http://localhost:3000",
  "apiKey": "",
  "shortcut": "CommandOrControl+Shift+A",
  "launchAtLogin": false
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+A` | Toggle app window (global) |
| `Escape` | Hide window |
| `Enter` | Send message |
| `Shift+Enter` | New line in message |

## Icons

To create the required icons:

1. **App Icon (icon.icns)**:
   - Create a 1024x1024 PNG of your icon
   - Use `iconutil` to convert to .icns format

2. **Tray Icon (trayIconTemplate.png)**:
   - Create a 22x22 or 44x44 (for Retina) PNG
   - Use black/transparent only (macOS templates)
   - Name must end with "Template" for automatic dark mode support

## Troubleshooting

### App doesn't appear in menu bar
- Check if another instance is running
- Try restarting the app
- Check Console.app for error logs

### Global shortcut doesn't work
- Check if another app is using the same shortcut
- Grant accessibility permissions in System Preferences

### Can't connect to SecureAgent
- Verify the API URL in settings
- Ensure SecureAgent server is running
- Check your network connection

## License

MIT
