/**
 * SecureAgent Chrome Extension - Content Script
 * Runs on every webpage to provide text selection features and display results
 */

// Create floating UI container
let floatingUI = null;
let selectionTooltip = null;

// Initialize
function init() {
  createFloatingUI();
  createSelectionTooltip();
  setupSelectionListener();
  setupMessageListener();
}

// Create floating UI for results
function createFloatingUI() {
  floatingUI = document.createElement('div');
  floatingUI.id = 'secureagent-floating-ui';
  floatingUI.innerHTML = `
    <div class="sa-header">
      <div class="sa-logo">
        <span class="sa-icon">AI</span>
        <span class="sa-title">SecureAgent</span>
      </div>
      <button class="sa-close" title="Close">&times;</button>
    </div>
    <div class="sa-content">
      <div class="sa-loading" style="display: none;">
        <div class="sa-spinner"></div>
        <span>Processing...</span>
      </div>
      <div class="sa-result"></div>
    </div>
    <div class="sa-footer">
      <button class="sa-copy" title="Copy to clipboard">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Copy
      </button>
    </div>
  `;
  document.body.appendChild(floatingUI);

  // Close button
  floatingUI.querySelector('.sa-close').addEventListener('click', hideFloatingUI);

  // Copy button
  floatingUI.querySelector('.sa-copy').addEventListener('click', copyResult);

  // Make draggable
  makeDraggable(floatingUI);
}

// Create selection tooltip
function createSelectionTooltip() {
  selectionTooltip = document.createElement('div');
  selectionTooltip.id = 'secureagent-tooltip';
  selectionTooltip.innerHTML = `
    <button class="sa-tooltip-btn" data-action="ask" title="Ask AI">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
    </button>
    <button class="sa-tooltip-btn" data-action="explain" title="Explain">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
      </svg>
    </button>
    <button class="sa-tooltip-btn" data-action="translate" title="Translate">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      </svg>
    </button>
    <button class="sa-tooltip-btn" data-action="rewrite" title="Rewrite">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
    </button>
  `;
  document.body.appendChild(selectionTooltip);

  // Button click handlers
  selectionTooltip.querySelectorAll('.sa-tooltip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const selectedText = window.getSelection().toString().trim();
      if (selectedText) {
        handleAction(action, selectedText);
      }
      hideTooltip();
    });
  });
}

// Setup selection listener
function setupSelectionListener() {
  let selectionTimeout;

  document.addEventListener('mouseup', (e) => {
    // Ignore if clicking on our UI
    if (e.target.closest('#secureagent-floating-ui') || e.target.closest('#secureagent-tooltip')) {
      return;
    }

    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      if (selectedText && selectedText.length > 2 && selectedText.length < 5000) {
        showTooltip(e.clientX, e.clientY);
      } else {
        hideTooltip();
      }
    }, 200);
  });

  // Hide tooltip on scroll or click elsewhere
  document.addEventListener('scroll', hideTooltip);
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#secureagent-tooltip')) {
      hideTooltip();
    }
  });
}

// Show selection tooltip
function showTooltip(x, y) {
  const padding = 10;
  const tooltipRect = selectionTooltip.getBoundingClientRect();

  // Position above the selection
  let left = x - tooltipRect.width / 2;
  let top = y - tooltipRect.height - padding;

  // Keep within viewport
  left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));
  if (top < padding) {
    top = y + padding; // Show below if no room above
  }

  selectionTooltip.style.left = `${left}px`;
  selectionTooltip.style.top = `${top}px`;
  selectionTooltip.classList.add('visible');
}

// Hide tooltip
function hideTooltip() {
  selectionTooltip.classList.remove('visible');
}

// Handle action from tooltip
function handleAction(action, text) {
  // Send to background script
  chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    action,
    text,
  }, (response) => {
    if (response.success) {
      showResult(action, text, response.result);
    } else {
      showError(response.error);
    }
  });

  // Show loading immediately
  showLoading(action, text);
}

// Setup message listener for background script
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'SHOW_LOADING':
        showLoading(message.action, message.text);
        break;
      case 'SHOW_RESULT':
        showResult(message.action, message.text, message.result);
        break;
      case 'SHOW_ERROR':
        showError(message.error);
        break;
    }
  });
}

// Show loading state
function showLoading(action, text) {
  const loading = floatingUI.querySelector('.sa-loading');
  const result = floatingUI.querySelector('.sa-result');
  const footer = floatingUI.querySelector('.sa-footer');

  loading.style.display = 'flex';
  result.innerHTML = '';
  result.style.display = 'none';
  footer.style.display = 'none';

  showFloatingUI();
}

// Show result
function showResult(action, text, resultText) {
  const loading = floatingUI.querySelector('.sa-loading');
  const result = floatingUI.querySelector('.sa-result');
  const footer = floatingUI.querySelector('.sa-footer');

  loading.style.display = 'none';
  result.style.display = 'block';
  footer.style.display = 'flex';

  // Format action label
  const actionLabels = {
    ask: 'Answer',
    explain: 'Explanation',
    translate: 'Translation',
    rewrite: 'Rewritten',
    summarize: 'Summary',
  };

  result.innerHTML = `
    <div class="sa-action-label">${actionLabels[action] || 'Result'}</div>
    <div class="sa-result-text">${formatResult(resultText)}</div>
  `;

  showFloatingUI();
}

// Show error
function showError(error) {
  const loading = floatingUI.querySelector('.sa-loading');
  const result = floatingUI.querySelector('.sa-result');
  const footer = floatingUI.querySelector('.sa-footer');

  loading.style.display = 'none';
  result.style.display = 'block';
  footer.style.display = 'none';

  result.innerHTML = `
    <div class="sa-error">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
      <span>${escapeHtml(error)}</span>
    </div>
  `;

  showFloatingUI();
}

// Format result text
function formatResult(text) {
  // Escape HTML
  let formatted = escapeHtml(text);

  // Code blocks
  formatted = formatted.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Inline code
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Line breaks
  formatted = formatted.replace(/\n/g, '<br>');

  return formatted;
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show floating UI
function showFloatingUI() {
  floatingUI.classList.add('visible');

  // Position in viewport if not already positioned
  if (!floatingUI.style.right) {
    floatingUI.style.right = '20px';
    floatingUI.style.top = '20px';
  }
}

// Hide floating UI
function hideFloatingUI() {
  floatingUI.classList.remove('visible');
}

// Copy result to clipboard
async function copyResult() {
  const resultText = floatingUI.querySelector('.sa-result-text');
  if (resultText) {
    try {
      await navigator.clipboard.writeText(resultText.textContent);
      const copyBtn = floatingUI.querySelector('.sa-copy');
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Copied!
      `;
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
}

// Make element draggable
function makeDraggable(element) {
  const header = element.querySelector('.sa-header');
  let isDragging = false;
  let offsetX, offsetY;

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.sa-close')) return;
    isDragging = true;
    offsetX = e.clientX - element.getBoundingClientRect().left;
    offsetY = e.clientY - element.getBoundingClientRect().top;
    element.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;

    // Keep within viewport
    const maxX = window.innerWidth - element.offsetWidth;
    const maxY = window.innerHeight - element.offsetHeight;

    element.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
    element.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
    element.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    element.style.cursor = '';
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
