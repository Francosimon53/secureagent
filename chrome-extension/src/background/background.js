/**
 * SecureAgent Chrome Extension - Background Service Worker
 * Handles context menus, API communication, and message passing
 */

// API Configuration
const API_BASE_URL = 'http://localhost:3000/api';

// Context menu IDs
const MENU_IDS = {
  PARENT: 'secureagent-parent',
  ASK_AI: 'secureagent-ask',
  SUMMARIZE: 'secureagent-summarize',
  TRANSLATE: 'secureagent-translate',
  EXPLAIN: 'secureagent-explain',
  REWRITE: 'secureagent-rewrite',
  SUMMARIZE_PAGE: 'secureagent-summarize-page',
};

// Initialize context menus on install
chrome.runtime.onInstalled.addListener(() => {
  // Create parent menu
  chrome.contextMenus.create({
    id: MENU_IDS.PARENT,
    title: 'SecureAgent AI',
    contexts: ['selection', 'page'],
  });

  // Selection-based actions
  chrome.contextMenus.create({
    id: MENU_IDS.ASK_AI,
    parentId: MENU_IDS.PARENT,
    title: 'Ask AI about this',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: MENU_IDS.EXPLAIN,
    parentId: MENU_IDS.PARENT,
    title: 'Explain this',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: MENU_IDS.TRANSLATE,
    parentId: MENU_IDS.PARENT,
    title: 'Translate this',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: MENU_IDS.REWRITE,
    parentId: MENU_IDS.PARENT,
    title: 'Rewrite this',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'separator',
    parentId: MENU_IDS.PARENT,
    type: 'separator',
    contexts: ['selection', 'page'],
  });

  // Page-level actions
  chrome.contextMenus.create({
    id: MENU_IDS.SUMMARIZE_PAGE,
    parentId: MENU_IDS.PARENT,
    title: 'Summarize this page',
    contexts: ['page', 'selection'],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const selectedText = info.selectionText || '';

  switch (info.menuItemId) {
    case MENU_IDS.ASK_AI:
      await handleAction('ask', selectedText, tab);
      break;
    case MENU_IDS.EXPLAIN:
      await handleAction('explain', selectedText, tab);
      break;
    case MENU_IDS.TRANSLATE:
      await handleAction('translate', selectedText, tab);
      break;
    case MENU_IDS.REWRITE:
      await handleAction('rewrite', selectedText, tab);
      break;
    case MENU_IDS.SUMMARIZE_PAGE:
      await handleSummarizePage(tab);
      break;
  }
});

// Handle action from context menu
async function handleAction(action, text, tab) {
  // Send message to content script to show result
  chrome.tabs.sendMessage(tab.id, {
    type: 'SHOW_LOADING',
    action,
    text,
  });

  try {
    const result = await callSecureAgentAPI(action, text);
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_RESULT',
      action,
      text,
      result,
    });
  } catch (error) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_ERROR',
      error: error.message,
    });
  }
}

// Handle summarize page action
async function handleSummarizePage(tab) {
  // Inject script to get page content
  const [{ result: pageContent }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      // Get main content, excluding scripts, styles, and navigation
      const clone = document.body.cloneNode(true);
      const removeSelectors = ['script', 'style', 'nav', 'header', 'footer', 'aside', '.ad', '.advertisement'];
      removeSelectors.forEach(sel => {
        clone.querySelectorAll(sel).forEach(el => el.remove());
      });
      return clone.innerText.slice(0, 10000); // Limit to 10k chars
    },
  });

  chrome.tabs.sendMessage(tab.id, {
    type: 'SHOW_LOADING',
    action: 'summarize',
    text: 'page content',
  });

  try {
    const result = await callSecureAgentAPI('summarize', pageContent, {
      title: tab.title,
      url: tab.url,
    });
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_RESULT',
      action: 'summarize',
      text: 'Page Summary',
      result,
    });
  } catch (error) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_ERROR',
      error: error.message,
    });
  }
}

// Call SecureAgent API
async function callSecureAgentAPI(action, text, context = {}) {
  const { apiKey, apiUrl } = await chrome.storage.sync.get(['apiKey', 'apiUrl']);

  if (!apiKey) {
    throw new Error('API key not configured. Please set your API key in extension options.');
  }

  const baseUrl = apiUrl || API_BASE_URL;

  // Build prompt based on action
  const prompts = {
    ask: `Please answer this question or provide information about: "${text}"`,
    explain: `Please explain the following in simple terms: "${text}"`,
    translate: `Please translate the following to English (or if already in English, translate to Spanish): "${text}"`,
    rewrite: `Please rewrite the following to be clearer and more professional: "${text}"`,
    summarize: `Please summarize the following content${context.title ? ` from "${context.title}"` : ''}: "${text}"`,
    chat: text,
  };

  const prompt = prompts[action] || text;

  const response = await fetch(`${baseUrl}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      message: prompt,
      conversationId: `extension-${Date.now()}`,
      context: {
        source: 'chrome-extension',
        action,
        url: context.url,
        title: context.title,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.response || data.message || data.content || 'No response received';
}

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'API_REQUEST') {
    callSecureAgentAPI(message.action, message.text, message.context)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'GET_PAGE_CONTENT') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        try {
          const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              const clone = document.body.cloneNode(true);
              ['script', 'style', 'nav', 'header', 'footer'].forEach(sel => {
                clone.querySelectorAll(sel).forEach(el => el.remove());
              });
              return {
                content: clone.innerText.slice(0, 10000),
                title: document.title,
                url: window.location.href,
              };
            },
          });
          sendResponse({ success: true, ...result });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      }
    });
    return true;
  }

  if (message.type === 'CHECK_API_KEY') {
    chrome.storage.sync.get(['apiKey'], (result) => {
      sendResponse({ hasApiKey: !!result.apiKey });
    });
    return true;
  }
});

// Handle keyboard shortcuts
chrome.commands?.onCommand?.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (command === 'summarize-page') {
    await handleSummarizePage(tab);
  }
});

console.log('SecureAgent background service worker initialized');
