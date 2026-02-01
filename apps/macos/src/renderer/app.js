/**
 * SecureAgent Menu Bar App - Renderer Process
 */

const messagesContainer = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');

let isLoading = false;

/**
 * Initialize the app
 */
function init() {
  // Auto-resize textarea
  input.addEventListener('input', autoResize);

  // Handle Enter key
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    // Escape to close
    if (e.key === 'Escape') {
      window.secureAgent.hideWindow();
    }
  });

  // Focus input when window opens
  input.focus();
}

/**
 * Auto-resize textarea based on content
 */
function autoResize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 100) + 'px';
}

/**
 * Send message to SecureAgent
 */
async function sendMessage() {
  const message = input.value.trim();
  if (!message || isLoading) return;

  // Clear welcome message on first message
  const welcome = messagesContainer.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  // Add user message
  addMessage(message, 'user');

  // Clear input
  input.value = '';
  input.style.height = 'auto';

  // Show loading
  isLoading = true;
  sendBtn.disabled = true;
  const loadingEl = addLoadingMessage();

  try {
    const result = await window.secureAgent.sendMessage(message);

    // Remove loading
    loadingEl.remove();

    if (result.success) {
      addMessage(result.response, 'assistant');
    } else {
      addMessage(result.error || 'Failed to get response', 'error');
    }
  } catch (error) {
    loadingEl.remove();
    addMessage(error.message || 'An error occurred', 'error');
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

/**
 * Add message to chat
 */
function addMessage(text, type) {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${type}`;
  messageEl.textContent = text;
  messagesContainer.appendChild(messageEl);
  scrollToBottom();
  return messageEl;
}

/**
 * Add loading indicator
 */
function addLoadingMessage() {
  const messageEl = document.createElement('div');
  messageEl.className = 'message loading';
  messageEl.innerHTML = `
    <div class="loading-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  messagesContainer.appendChild(messageEl);
  scrollToBottom();
  return messageEl;
}

/**
 * Scroll messages to bottom
 */
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Run quick action
 */
async function runQuickAction(action) {
  // Clear welcome message
  const welcome = messagesContainer.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  const actionNames = {
    summarize: 'Summarizing clipboard...',
    translate: 'Translating clipboard...',
    explain: 'Explaining clipboard...',
    grammar: 'Fixing grammar...',
  };

  addMessage(actionNames[action] || `Running ${action}...`, 'user');

  isLoading = true;
  sendBtn.disabled = true;
  const loadingEl = addLoadingMessage();

  try {
    // Get clipboard content
    const clipboardText = await window.secureAgent.readClipboard();

    if (!clipboardText) {
      loadingEl.remove();
      addMessage('Clipboard is empty', 'error');
      return;
    }

    const prompts = {
      summarize: `Summarize the following text concisely:\n\n${clipboardText}`,
      translate: `Translate the following text to English (or to the user's language if already in English):\n\n${clipboardText}`,
      explain: `Explain the following in simple terms:\n\n${clipboardText}`,
      grammar: `Fix any grammar and spelling errors in the following text, return only the corrected text:\n\n${clipboardText}`,
    };

    const result = await window.secureAgent.sendMessage(prompts[action]);

    loadingEl.remove();

    if (result.success) {
      addMessage(result.response, 'assistant');

      // Copy result to clipboard for grammar fix
      if (action === 'grammar') {
        await window.secureAgent.writeClipboard(result.response);
        addMessage('✓ Corrected text copied to clipboard', 'assistant');
      }
    } else {
      addMessage(result.error || 'Failed to process', 'error');
    }
  } catch (error) {
    loadingEl.remove();
    addMessage(error.message || 'An error occurred', 'error');
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
