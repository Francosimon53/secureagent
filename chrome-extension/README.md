# SecureAgent Chrome Extension

AI-powered assistant for any webpage. Summarize, translate, explain, and chat with AI about any content.

## Features

- **Popup Chat Interface**: Full chat interface accessible from the toolbar
- **Text Selection Actions**: Select text on any page and get quick AI actions
- **Right-Click Context Menu**: Access all features from the context menu
- **Quick Actions**:
  - Summarize current page
  - Translate selected text
  - Explain complex content
  - Rewrite for clarity
- **Keyboard Shortcuts**: Quick access to common actions

## Installation

### From Chrome Web Store
*(Coming soon)*

### Manual Installation (Developer Mode)

1. Download or clone this repository
2. Generate icons (see below)
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked"
6. Select the `chrome-extension` folder

### Generate Icons

Run the icon generation script:

```bash
node scripts/generate-icons.js
```

Or create icons manually:
- `icons/icon16.png` - 16x16 pixels
- `icons/icon32.png` - 32x32 pixels
- `icons/icon48.png` - 48x48 pixels
- `icons/icon128.png` - 128x128 pixels

## Configuration

1. Click the SecureAgent icon in your browser toolbar
2. Enter your API key (get it from the SecureAgent dashboard)
3. Optionally configure the API URL for self-hosted instances

## Usage

### Popup Chat
Click the extension icon to open the chat popup. Type your questions or use quick action buttons.

### Text Selection
1. Select any text on a webpage
2. A tooltip will appear with action buttons
3. Click an action to process the selected text

### Context Menu
1. Right-click on any page or selected text
2. Choose "SecureAgent AI" from the menu
3. Select an action

### Keyboard Shortcuts
Configure in Chrome's extension settings (`chrome://extensions/shortcuts`):
- `Ctrl+Shift+S` - Summarize current page

## API Endpoints Used

The extension communicates with the SecureAgent API:

- `POST /api/chat` - Send messages and receive AI responses

## Privacy

- Your API key is stored locally in Chrome's sync storage
- Conversation history is stored locally
- Page content is only sent when you explicitly request an action
- No data is collected or stored on external servers beyond the API

## Development

### Project Structure

```
chrome-extension/
├── manifest.json          # Extension manifest (V3)
├── icons/                 # Extension icons
├── src/
│   ├── background/        # Service worker
│   │   └── background.js
│   ├── content/           # Content scripts
│   │   ├── content.js
│   │   └── content.css
│   ├── popup/             # Popup UI
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   └── options/           # Settings page
│       ├── options.html
│       ├── options.css
│       └── options.js
└── README.md
```

### Building for Production

1. Update version in `manifest.json`
2. Generate icons if not present
3. Zip the `chrome-extension` folder
4. Upload to Chrome Web Store

## License

Part of the SecureAgent project.
