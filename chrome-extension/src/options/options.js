/**
 * SecureAgent Chrome Extension - Options Script
 */

// DOM Elements
const apiKeyInput = document.getElementById('apiKey');
const toggleApiKeyBtn = document.getElementById('toggleApiKey');
const apiUrlInput = document.getElementById('apiUrl');
const showTooltipCheckbox = document.getElementById('showTooltip');
const defaultLanguageSelect = document.getElementById('defaultLanguage');
const saveBtn = document.getElementById('saveBtn');
const clearDataBtn = document.getElementById('clearDataBtn');
const statusMessage = document.getElementById('statusMessage');
const shortcutsLink = document.getElementById('shortcutsLink');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

// Load saved settings
async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'apiKey',
    'apiUrl',
    'showTooltip',
    'defaultLanguage',
  ]);

  if (settings.apiKey) {
    apiKeyInput.value = settings.apiKey;
  }

  if (settings.apiUrl) {
    apiUrlInput.value = settings.apiUrl;
  }

  showTooltipCheckbox.checked = settings.showTooltip !== false;

  if (settings.defaultLanguage) {
    defaultLanguageSelect.value = settings.defaultLanguage;
  }
}

// Setup event listeners
function setupEventListeners() {
  // Toggle API key visibility
  toggleApiKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';

    const eyeIcon = document.getElementById('eyeIcon');
    if (isPassword) {
      eyeIcon.innerHTML = `
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      `;
    } else {
      eyeIcon.innerHTML = `
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      `;
    }
  });

  // Save settings
  saveBtn.addEventListener('click', saveSettings);

  // Clear data
  clearDataBtn.addEventListener('click', clearAllData);

  // Handle shortcuts link
  shortcutsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
}

// Save settings
async function saveSettings() {
  const apiKey = apiKeyInput.value.trim();
  const apiUrl = apiUrlInput.value.trim();
  const showTooltip = showTooltipCheckbox.checked;
  const defaultLanguage = defaultLanguageSelect.value;

  if (!apiKey) {
    showStatus('Please enter your API key', 'error');
    return;
  }

  try {
    await chrome.storage.sync.set({
      apiKey,
      apiUrl: apiUrl || undefined,
      showTooltip,
      defaultLanguage,
    });

    showStatus('Settings saved successfully!', 'success');
  } catch (error) {
    showStatus('Failed to save settings: ' + error.message, 'error');
  }
}

// Clear all data
async function clearAllData() {
  if (!confirm('Are you sure you want to clear all extension data? This will remove your API key and conversation history.')) {
    return;
  }

  try {
    await chrome.storage.sync.clear();
    await chrome.storage.local.clear();

    // Reset form
    apiKeyInput.value = '';
    apiUrlInput.value = '';
    showTooltipCheckbox.checked = true;
    defaultLanguageSelect.value = 'en';

    showStatus('All data cleared successfully', 'success');
  } catch (error) {
    showStatus('Failed to clear data: ' + error.message, 'error');
  }
}

// Show status message
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;

  // Auto-hide after 5 seconds
  setTimeout(() => {
    statusMessage.className = 'status-message';
  }, 5000);
}
