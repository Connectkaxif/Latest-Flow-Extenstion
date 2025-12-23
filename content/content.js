/**
 * Google Flow Automation Pro - Content Script
 * Handles DOM interaction, prompt submission, and image detection
 */

(function() {
  'use strict';
  
  // ============================================
  // CONFIGURATION - SELECTORS
  // These may need adjustment based on actual website structure
  // ============================================
  const SELECTORS = {
    // Input field selectors (try multiple options)
    promptInput: [
      'textarea[placeholder*="prompt"]',
      'textarea[placeholder*="Prompt"]',
      'textarea[placeholder*="describe"]',
      'textarea[placeholder*="Describe"]',
      'input[type="text"][placeholder*="prompt"]',
      'div[contenteditable="true"]',
      'textarea',
      '[data-testid="prompt-input"]',
      '.prompt-input',
      '#prompt-input'
    ],
    
    // Generate button selectors
    generateButton: [
      'button[aria-label*="Generate"]',
      'button[aria-label*="generate"]',
      'button:contains("Generate")',
      'button[type="submit"]',
      '[data-testid="generate-button"]',
      '.generate-button',
      '#generate-button',
      'button.primary',
      'button[class*="generate"]'
    ],
    
    // Image output container selectors
    imageContainer: [
      '[data-testid="generated-images"]',
      '.generated-images',
      '.image-output',
      '.output-images',
      '[class*="image-grid"]',
      '[class*="output"]'
    ],
    
    // Individual image selectors
    generatedImage: [
      'img[src^="blob:"]',
      'img[src^="data:"]',
      'img[class*="generated"]',
      'img[class*="output"]',
      '.image-container img',
      '[data-testid="generated-image"] img'
    ],
    
    // Output count selector
    outputCountSelector: [
      '[data-testid="output-count"]',
      'select[name="count"]',
      '.output-count select',
      'input[type="number"][name*="count"]'
    ]
  };
  
  // ============================================
  // STATE
  // ============================================
  let state = {
    isActive: false,
    currentPrompt: null,
    settings: {},
    observer: null,
    lastImageCount: 0,
    detectedImages: new Set()
  };
  
  // ============================================
  // INITIALIZATION
  // ============================================
  function initialize() {
    console.log('🎨 Google Flow Automation Pro - Content Script Loaded');
    setupImageObserver();
    setupMessageListener();
  }
  
  // ============================================
  // MESSAGE HANDLING
  // ============================================
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      handleMessage(message, sender, sendResponse);
      return true;
    });
  }
  
  async function handleMessage(message, sender, sendResponse) {
    console.log('Content script received:', message.type);
    
    switch (message.type) {
      case 'PING':
        sendResponse({ pong: true });
        break;
        
      case 'SUBMIT_PROMPT':
        await submitPrompt(message.prompt, message.index, message.settings);
        sendResponse({ success: true });
        break;
        
      case 'DOWNLOAD_BLOB':
        await downloadBlobImage(message.blobUrl, message.filename, message.promptId);
        sendResponse({ success: true });
        break;
        
      case 'GET_PAGE_STATE':
        const pageState = getPageState();
        sendResponse({ success: true, state: pageState });
        break;
        
      case 'SET_OUTPUT_COUNT':
        await setOutputCount(message.count);
        sendResponse({ success: true });
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  }
  
  // ============================================
  // DOM UTILITIES
  // ============================================
  function findElement(selectorList) {
    for (const selector of selectorList) {
      try {
        // Handle :contains pseudo-selector
        if (selector.includes(':contains(')) {
          const match = selector.match(/(.+):contains\("(.+)"\)/);
          if (match) {
            const [, baseSelector, text] = match;
            const elements = document.querySelectorAll(baseSelector);
            for (const el of elements) {
              if (el.textContent.includes(text)) {
                return el;
              }
            }
          }
        } else {
          const element = document.querySelector(selector);
          if (element && isElementVisible(element)) {
            return element;
          }
        }
      } catch (error) {
        // Invalid selector, try next
        continue;
      }
    }
    return null;
  }
  
  function findAllElements(selectorList) {
    const elements = [];
    for (const selector of selectorList) {
      try {
        const found = document.querySelectorAll(selector);
        found.forEach(el => {
          if (isElementVisible(el) && !elements.includes(el)) {
            elements.push(el);
          }
        });
      } catch (error) {
        continue;
      }
    }
    return elements;
  }
  
  function isElementVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetParent !== null;
  }
  
  function waitForElement(selectorList, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const element = findElement(selectorList);
      if (element) {
        resolve(element);
        return;
      }
      
      const observer = new MutationObserver((mutations, obs) => {
        const element = findElement(selectorList);
        if (element) {
          obs.disconnect();
          resolve(element);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      setTimeout(() => {
        observer.disconnect();
        reject(new Error('Element not found within timeout'));
      }, timeout);
    });
  }
  
  // ============================================
  // PROMPT SUBMISSION
  // ============================================
  async function submitPrompt(prompt, index, settings) {
    state.currentPrompt = prompt;
    state.settings = settings;
    state.detectedImages.clear();
    
    console.log(`📝 Submitting prompt ${index + 1}: "${prompt.text.substring(0, 50)}..."`);
    
    try {
      // Find and focus the input field
      const inputElement = await waitForElement(SELECTORS.promptInput, 5000);
      
      if (!inputElement) {
        throw new Error('Could not find prompt input field');
      }
      
      // Clear existing text
      clearInput(inputElement);
      
      // Type the prompt
      await typeText(inputElement, prompt.text);
      
      // Small delay before clicking generate
      await sleep(500);
      
      // Find and click generate button
      const generateButton = findElement(SELECTORS.generateButton);
      
      if (!generateButton) {
        throw new Error('Could not find generate button');
      }
      
      // Click the generate button
      clickElement(generateButton);
      
      console.log(`✅ Prompt ${index + 1} submitted successfully`);
      
      // Start monitoring for new images
      startImageMonitoring(prompt);
      
    } catch (error) {
      console.error(`❌ Failed to submit prompt ${index + 1}:`, error);
      notifyGenerationFailed(prompt.id, error.message);
    }
  }
  
  function clearInput(element) {
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (element.contentEditable === 'true') {
      element.innerHTML = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  
  async function typeText(element, text) {
    element.focus();
    
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (element.contentEditable === 'true') {
      element.innerHTML = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    // Trigger keyup event for any listeners
    element.dispatchEvent(new KeyboardEvent('keyup', { key: 'a' }));
  }
  
  function clickElement(element) {
    element.focus();
    element.click();
    
    // Also dispatch mouse events
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
  
  // ============================================
  // IMAGE MONITORING
  // ============================================
  function setupImageObserver() {
    // Create mutation observer for detecting new images
    state.observer = new MutationObserver((mutations) => {
      if (!state.currentPrompt) return;
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          checkForNewImages();
        } else if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
          checkForNewImages();
        }
      }
    });
  }
  
  function startImageMonitoring(prompt) {
    // Record current images to detect new ones
    const currentImages = getAllImages();
    state.lastImageCount = currentImages.length;
    
    // Start observing
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });
    
    // Also poll for images (backup method)
    const pollInterval = setInterval(() => {
      if (!state.currentPrompt || state.currentPrompt.id !== prompt.id) {
        clearInterval(pollInterval);
        return;
      }
      checkForNewImages();
    }, 1000);
    
    // Timeout after 2 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (state.currentPrompt && state.currentPrompt.id === prompt.id) {
        // Check if we got any images
        if (state.detectedImages.size === 0) {
          notifyGenerationFailed(prompt.id, 'Image generation timeout');
        }
      }
    }, 120000);
  }
  
  function checkForNewImages() {
    if (!state.currentPrompt) return;
    
    const images = getAllImages();
    const newImages = images.filter(img => {
      const src = img.src || img.dataset.src;
      return src && !state.detectedImages.has(src);
    });
    
    if (newImages.length > 0) {
      console.log(`🖼️ Detected ${newImages.length} new image(s)`);
      
      const imageUrls = [];
      newImages.forEach(img => {
        const src = img.src || img.dataset.src;
        state.detectedImages.add(src);
        imageUrls.push(src);
      });
      
      // Check if we have expected number of images
      const expectedCount = state.settings.outputCount || 2;
      if (state.detectedImages.size >= expectedCount) {
        notifyImagesGenerated(state.currentPrompt.id, imageUrls);
      }
    }
  }
  
  function getAllImages() {
    const images = [];
    
    // Try to find images in output container first
    const containers = findAllElements(SELECTORS.imageContainer);
    
    if (containers.length > 0) {
      containers.forEach(container => {
        const imgs = container.querySelectorAll('img');
        imgs.forEach(img => {
          if (isValidGeneratedImage(img)) {
            images.push(img);
          }
        });
      });
    }
    
    // Also check for images with generated selectors
    const generatedImages = findAllElements(SELECTORS.generatedImage);
    generatedImages.forEach(img => {
      if (isValidGeneratedImage(img) && !images.includes(img)) {
        images.push(img);
      }
    });
    
    return images;
  }
  
  function isValidGeneratedImage(img) {
    if (!img.src && !img.dataset.src) return false;
    
    const src = img.src || img.dataset.src;
    
    // Check if it's a generated image (blob or data URL, or from Google's CDN)
    if (src.startsWith('blob:') || 
        src.startsWith('data:image') ||
        src.includes('generated') ||
        src.includes('output')) {
      return true;
    }
    
    // Check image dimensions (generated images are usually larger)
    if (img.naturalWidth >= 256 && img.naturalHeight >= 256) {
      return true;
    }
    
    return false;
  }
  
  // ============================================
  // IMAGE DOWNLOADING
  // ============================================
  async function downloadBlobImage(blobUrl, filename, promptId) {
    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      
      // Convert blob to data URL
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUrl = reader.result;
        
        // Send back to background for download
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_DATA_URL',
          dataUrl: dataUrl,
          filename: filename,
          promptId: promptId
        });
      };
      reader.readAsDataURL(blob);
      
    } catch (error) {
      console.error('Failed to download blob:', error);
    }
  }
  
  // ============================================
  // OUTPUT COUNT CONTROL
  // ============================================
  async function setOutputCount(count) {
    try {
      const selector = findElement(SELECTORS.outputCountSelector);
      if (selector) {
        if (selector.tagName === 'SELECT') {
          selector.value = count.toString();
          selector.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (selector.tagName === 'INPUT') {
          selector.value = count.toString();
          selector.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    } catch (error) {
      console.error('Failed to set output count:', error);
    }
  }
  
  // ============================================
  // PAGE STATE
  // ============================================
  function getPageState() {
    return {
      hasInputField: !!findElement(SELECTORS.promptInput),
      hasGenerateButton: !!findElement(SELECTORS.generateButton),
      hasImageContainer: !!findElement(SELECTORS.imageContainer),
      imageCount: getAllImages().length,
      url: window.location.href,
      isProjectPage: window.location.href.includes('/project/')
    };
  }
  
  // ============================================
  // NOTIFICATIONS
  // ============================================
  function notifyImagesGenerated(promptId, imageUrls) {
    chrome.runtime.sendMessage({
      type: 'IMAGE_GENERATED',
      promptId: promptId,
      imageUrls: imageUrls
    });
    
    // Clear current prompt
    state.currentPrompt = null;
  }
  
  function notifyGenerationFailed(promptId, error) {
    chrome.runtime.sendMessage({
      type: 'GENERATION_FAILED',
      promptId: promptId,
      error: error
    });
    
    state.currentPrompt = null;
  }
  
  // ============================================
  // UTILITIES
  // ============================================
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // ============================================
  // VISUAL INDICATORS
  // ============================================
  function showIndicator(message, type = 'info') {
    // Remove existing indicator
    const existing = document.querySelector('.gfa-indicator');
    if (existing) existing.remove();
    
    const indicator = document.createElement('div');
    indicator.className = `gfa-indicator gfa-${type}`;
    indicator.innerHTML = `
      <div class="gfa-indicator-content">
        <span class="gfa-indicator-icon"></span>
        <span class="gfa-indicator-text">${message}</span>
      </div>
    `;
    
    document.body.appendChild(indicator);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
      indicator.classList.add('gfa-fade-out');
      setTimeout(() => indicator.remove(), 300);
    }, 3000);
  }
  
  // ============================================
  // INITIALIZE
  // ============================================
  initialize();
  
})();

