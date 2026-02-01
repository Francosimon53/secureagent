const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose secure APIs to renderer process
 */
contextBridge.exposeInMainWorld('secureAgent', {
  // Send chat message
  sendMessage: (message) => ipcRenderer.invoke('send-message', message),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Window control
  hideWindow: () => ipcRenderer.send('hide-window'),

  // Clipboard
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  writeClipboard: (text) => ipcRenderer.invoke('write-clipboard', text),

  // Quick actions
  quickAction: (action) => ipcRenderer.invoke('quick-action', action),

  // Platform info
  platform: process.platform,
});
