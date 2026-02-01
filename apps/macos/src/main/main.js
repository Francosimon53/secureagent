const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  clipboard,
  nativeImage,
  Notification,
  shell,
} = require('electron');
const path = require('path');
const Store = require('electron-store');

// Initialize store for settings
const store = new Store({
  defaults: {
    apiUrl: 'http://localhost:3000',
    apiKey: '',
    shortcut: 'CommandOrControl+Shift+A',
    launchAtLogin: false,
    showInDock: false,
  },
});

let tray = null;
let mainWindow = null;
let settingsWindow = null;

const WINDOW_WIDTH = 400;
const WINDOW_HEIGHT = 500;

/**
 * Create the main chat popup window
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Create settings window
 */
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 400,
    show: true,
    frame: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

/**
 * Position window near tray icon
 */
function positionWindow() {
  if (!tray || !mainWindow) return;

  const trayBounds = tray.getBounds();
  const windowBounds = mainWindow.getBounds();

  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 4);

  mainWindow.setPosition(x, y, false);
}

/**
 * Toggle main window visibility
 */
function toggleWindow() {
  if (!mainWindow) {
    mainWindow = createMainWindow();
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    positionWindow();
    mainWindow.show();
    mainWindow.focus();
  }
}

/**
 * Create tray icon and menu
 */
function createTray() {
  // Create tray icon (use template image for macOS)
  const iconPath = path.join(__dirname, '../../assets/trayIconTemplate.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon.isEmpty() ? createDefaultIcon() : icon);
  tray.setToolTip('SecureAgent');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Chat',
      accelerator: store.get('shortcut'),
      click: toggleWindow,
    },
    { type: 'separator' },
    {
      label: 'Quick Actions',
      submenu: [
        {
          label: 'Summarize Clipboard',
          click: () => handleQuickAction('summarize'),
        },
        {
          label: 'Translate Clipboard',
          click: () => handleQuickAction('translate'),
        },
        {
          label: 'Explain Clipboard',
          click: () => handleQuickAction('explain'),
        },
        {
          label: 'Fix Grammar',
          click: () => handleQuickAction('grammar'),
        },
      ],
    },
    { type: 'separator' },
    {
      label: 'Settings...',
      click: createSettingsWindow,
    },
    {
      label: 'Open Dashboard',
      click: () => shell.openExternal(store.get('apiUrl') + '/dashboard'),
    },
    { type: 'separator' },
    {
      label: 'Quit SecureAgent',
      accelerator: 'CommandOrControl+Q',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', toggleWindow);
}

/**
 * Create a default icon if custom icon is not found
 */
function createDefaultIcon() {
  const size = 22;
  const canvas = nativeImage.createEmpty();
  // Return a simple colored icon as fallback
  return nativeImage.createFromBuffer(
    Buffer.alloc(size * size * 4, 0),
    { width: size, height: size }
  );
}

/**
 * Register global keyboard shortcut
 */
function registerShortcut() {
  const shortcut = store.get('shortcut');

  // Unregister existing shortcuts
  globalShortcut.unregisterAll();

  // Register new shortcut
  const registered = globalShortcut.register(shortcut, toggleWindow);

  if (!registered) {
    console.error('Failed to register shortcut:', shortcut);
  }
}

/**
 * Handle quick actions
 */
async function handleQuickAction(action) {
  const clipboardText = clipboard.readText();

  if (!clipboardText) {
    showNotification('No Content', 'Clipboard is empty');
    return;
  }

  const prompts = {
    summarize: `Summarize the following text concisely:\n\n${clipboardText}`,
    translate: `Translate the following text to English (or to the user's language if already in English):\n\n${clipboardText}`,
    explain: `Explain the following in simple terms:\n\n${clipboardText}`,
    grammar: `Fix any grammar and spelling errors in the following text, return only the corrected text:\n\n${clipboardText}`,
  };

  const prompt = prompts[action];
  if (!prompt) return;

  try {
    showNotification('Processing...', `Running ${action} on clipboard content`);

    const response = await sendToAgent(prompt);

    if (response) {
      clipboard.writeText(response);
      showNotification('Done!', 'Result copied to clipboard');
    }
  } catch (error) {
    showNotification('Error', error.message);
  }
}

/**
 * Send message to SecureAgent API
 */
async function sendToAgent(message) {
  const apiUrl = store.get('apiUrl');
  const apiKey = store.get('apiKey');

  const response = await fetch(`${apiUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return data.response || data.message || data.content;
}

/**
 * Show native notification
 */
function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

/**
 * IPC Handlers
 */
function setupIPC() {
  // Chat message handler
  ipcMain.handle('send-message', async (event, message) => {
    try {
      const response = await sendToAgent(message);
      return { success: true, response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Get settings
  ipcMain.handle('get-settings', () => {
    return {
      apiUrl: store.get('apiUrl'),
      apiKey: store.get('apiKey'),
      shortcut: store.get('shortcut'),
      launchAtLogin: store.get('launchAtLogin'),
    };
  });

  // Save settings
  ipcMain.handle('save-settings', (event, settings) => {
    if (settings.apiUrl) store.set('apiUrl', settings.apiUrl);
    if (settings.apiKey !== undefined) store.set('apiKey', settings.apiKey);
    if (settings.shortcut) {
      store.set('shortcut', settings.shortcut);
      registerShortcut();
    }
    if (settings.launchAtLogin !== undefined) {
      store.set('launchAtLogin', settings.launchAtLogin);
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
    }
    return { success: true };
  });

  // Hide window
  ipcMain.on('hide-window', () => {
    if (mainWindow) mainWindow.hide();
  });

  // Clipboard operations
  ipcMain.handle('read-clipboard', () => clipboard.readText());
  ipcMain.handle('write-clipboard', (event, text) => {
    clipboard.writeText(text);
    return true;
  });

  // Quick action from renderer
  ipcMain.handle('quick-action', async (event, action) => {
    await handleQuickAction(action);
  });
}

/**
 * App initialization
 */
app.whenReady().then(() => {
  // Hide dock icon if configured
  if (!store.get('showInDock')) {
    app.dock?.hide();
  }

  createTray();
  createMainWindow();
  registerShortcut();
  setupIPC();

  // Set login item
  app.setLoginItemSettings({
    openAtLogin: store.get('launchAtLogin'),
  });
});

app.on('window-all-closed', (e) => {
  // Prevent app from quitting when windows close
  e.preventDefault();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});
