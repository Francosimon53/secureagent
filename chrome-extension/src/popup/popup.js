/**
 * SecureAgent Chrome Extension - Popup Script
 */

// DOM Elements
const setupView = document.getElementById('setupView');
const mainView = document.getElementById('mainView');
const setupApiKey = document.getElementById('setupApiKey');
const setupApiUrl = document.getElementById('setupApiUrl');
const saveSetupBtn = document.getElementById('saveSetupBtn');
const settingsBtn = document.getElementById('settingsBtn');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const actionBtns = document.querySelectorAll('.action-btn');

// State
let conversationHistory = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkApiKey();
  setupEventListeners();
  loadConversationHistory();
});

// Check if API key is configured
async function checkApiKey() {
  const { apiKey } = await chrome.storage.sync.get(['apiKey']);

  if (apiKey) {
    setupView.style.display = 'none';
    mainView.style.display = 'flex';
  } else {
    setupView.style.display = 'flex';
    mainView.style.display = 'none';
  }
}

// Setup event listeners
function setupEventListeners() {
  // Save setup
  saveSetupBtn.addEventListener('click', saveSetup);

  // Settings button
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Send message
  sendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
  });

  // Quick actions
  actionBtns.forEach(btn => {
    btn.addEventListener('click', () => handleQuickAction(btn.dataset.action));
  });
}

// Save setup
async function saveSetup() {
  const apiKey = setupApiKey.value.trim();
  const apiUrl = setupApiUrl.value.trim();

  if (!apiKey) {
    alert('Please enter your API key');
    return;
  }

  await chrome.storage.sync.set({
    apiKey,
    apiUrl: apiUrl || undefined,
  });

  setupView.style.display = 'none';
  mainView.style.display = 'flex';
}

// Handle quick action
async function handleQuickAction(action) {
  // Get selected text from active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (action === 'summarize') {
    // Summarize page
    addMessage('Summarize this page', 'user');
    addLoadingMessage();

    chrome.runtime.sendMessage(
      { type: 'GET_PAGE_CONTENT' },
      async (response) => {
        if (response.success) {
          const result = await makeApiRequest('summarize', response.content, {
            title: response.title,
            url: response.url,
          });
          removeLoadingMessage();
          if (result.success) {
            addMessage(result.result, 'assistant');
          } else {
            addMessage(result.error, 'error');
          }
        } else {
          removeLoadingMessage();
          addMessage('Could not access page content', 'error');
        }
      }
    );
    return;
  }

  // For other actions, get selected text
  try {
    const [{ result: selectedText }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString(),
    });

    if (!selectedText || !selectedText.trim()) {
      addMessage(`Please select some text on the page to ${action}`, 'error');
      return;
    }

    const actionLabels = {
      translate: 'Translate',
      explain: 'Explain',
      rewrite: 'Rewrite',
    };

    addMessage(`${actionLabels[action]}: "${selectedText.slice(0, 100)}${selectedText.length > 100 ? '...' : ''}"`, 'user');
    addLoadingMessage();

    const result = await makeApiRequest(action, selectedText);
    removeLoadingMessage();

    if (result.success) {
      addMessage(result.result, 'assistant');
    } else {
      addMessage(result.error, 'error');
    }
  } catch (error) {
    addMessage('Could not access page content. Make sure you\'re on a valid webpage.', 'error');
  }
}

// Send chat message
async function sendMessage() {
  const message = chatInput.value.trim();
  if (!message) return;

  // Clear input
  chatInput.value = '';
  chatInput.style.height = 'auto';

  // Remove welcome message if present
  const welcome = chatMessages.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  // Add user message
  addMessage(message, 'user');
  addLoadingMessage();

  // Make API request
  const result = await makeApiRequest('chat', message);
  removeLoadingMessage();

  if (result.success) {
    addMessage(result.result, 'assistant');
  } else {
    addMessage(result.error, 'error');
  }

  // Save to history
  saveConversationHistory();
}

// Make API request via background script
function makeApiRequest(action, text, context = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'API_REQUEST', action, text, context },
      resolve
    );
  });
}

// Add message to chat
function addMessage(content, type) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;

  // Format content (basic markdown-like formatting)
  const formattedContent = formatContent(content);
  messageDiv.innerHTML = formattedContent;

  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Store in history
  if (type !== 'error') {
    conversationHistory.push({ content, type, timestamp: Date.now() });
  }
}

// Format content with basic markdown
function formatContent(content) {
  // Escape HTML
  let formatted = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks
  formatted = formatted.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Inline code
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Line breaks
  formatted = formatted.replace(/\n/g, '<br>');

  return formatted;
}

// Add loading message
function addLoadingMessage() {
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'message assistant loading';
  loadingDiv.id = 'loadingMessage';
  loadingDiv.innerHTML = `
    <div class="loading-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  chatMessages.appendChild(loadingDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Remove loading message
function removeLoadingMessage() {
  const loading = document.getElementById('loadingMessage');
  if (loading) loading.remove();
}

// Save conversation history
function saveConversationHistory() {
  // Keep last 50 messages
  const toSave = conversationHistory.slice(-50);
  chrome.storage.local.set({ conversationHistory: toSave });
}

// Load conversation history
async function loadConversationHistory() {
  const { conversationHistory: history } = await chrome.storage.local.get(['conversationHistory']);

  if (history && history.length > 0) {
    // Remove welcome message
    const welcome = chatMessages.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // Restore messages
    conversationHistory = history;
    history.slice(-10).forEach(msg => {
      const messageDiv = document.createElement('div');
      messageDiv.className = `message ${msg.type}`;
      messageDiv.innerHTML = formatContent(msg.content);
      chatMessages.appendChild(messageDiv);
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}
