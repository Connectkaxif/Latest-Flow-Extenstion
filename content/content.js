/**
 * Google Flow Automation Pro - Content Script
 * Handles DOM interaction, prompt submission, and image detection
 * UPDATED: Fixed generate button detection and clicking
 */

(function() {
  'use strict';
  
  // ============================================
  // CONFIGURATION - SELECTORS
  // Updated based on actual Google Flow interface
  // ============================================
  const SELECTORS = {
    // Input field selectors - the textarea at the bottom of the page
    promptInput: [
      // Google Flow specific selectors
      'textarea[class*="prompt"]',
      'textarea[class*="input"]',
      'div[contenteditable="true"][class*="prompt"]',
      'div[contenteditable="true"][class*="input"]',
      '[role="textbox"]',
      // Generic fallbacks
      'textarea',
      'div[contenteditable="true"]',
      'input[type="text"]'
    ],
    
    // Generate/Send button selectors - the arrow button (→) on the right
    generateButton: [
      // Arrow/Send button specific selectors
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button[aria-label*="Submit"]',
      'button[aria-label*="submit"]',
      'button[aria-label*="Generate"]',
      'button[aria-label*="generate"]',
      'button[aria-label*="Create"]',
      'button[aria-label*="create"]',
      // Material icon buttons
      'button[class*="send"]',
      'button[class*="submit"]',
      'button[class*="arrow"]',
      // Button with arrow icon (SVG or material icon)
      'button svg[class*="arrow"]',
      'button mat-icon',
      'button .material-icons',
      // Generic submit buttons near input
      'form button[type="submit"]',
      'button[type="submit"]',
      // Last resort - look for buttons with arrow symbols
      'button'
    ],
    
    // Image output container selectors
    imageContainer: [
      '[class*="generated"]',
      '[class*="output"]',
      '[class*="result"]',
      '[class*="image-grid"]',
      '[class*="gallery"]',
      '[class*="preview"]',
      'main [class*="image"]'
    ],
    
    // Individual image selectors
    generatedImage: [
      'img[src^="blob:"]',
      'img[src^="data:"]',
      'img[src*="googleusercontent"]',
      'img[src*="generated"]',
      'img[class*="generated"]',
      'img[class*="output"]',
      'img[class*="result"]',
      '[class*="image-container"] img',
      '[class*="output"] img',
      '[class*="result"] img'
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
    detectedImages: new Set(),
    submissionCount: 0
  };
  
  // ============================================
  // INITIALIZATION
  // ============================================
  function initialize() {
    console.log('🎨 Google Flow Automation Pro - Content Script Loaded v2.0');
    console.log('📍 Current URL:', window.location.href);
    setupImageObserver();
    setupMessageListener();
    
    // Debug: Log found elements on page load
    setTimeout(() => {
      debugPageElements();
    }, 2000);
  }
  
  function debugPageElements() {
    console.log('🔍 Debug: Scanning page elements...');
    
    // Find all textareas
    const textareas = document.querySelectorAll('textarea');
    console.log(`Found ${textareas.length} textarea(s):`, textareas);
    
    // Find all contenteditable
    const editables = document.querySelectorAll('[contenteditable="true"]');
    console.log(`Found ${editables.length} contenteditable element(s):`, editables);
    
    // Find all buttons
    const buttons = document.querySelectorAll('button');
    console.log(`Found ${buttons.length} button(s)`);
    
    // Log buttons with their aria-labels
    buttons.forEach((btn, i) => {
      const ariaLabel = btn.getAttribute('aria-label');
      const text = btn.textContent?.trim().substring(0, 30);
      if (ariaLabel || text) {
        console.log(`  Button ${i}: aria-label="${ariaLabel}", text="${text}"`);
      }
    });
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
    console.log('📩 Content script received:', message.type);
    
    switch (message.type) {
      case 'PING':
        sendResponse({ pong: true });
        break;
        
      case 'SUBMIT_PROMPT':
        const result = await submitPrompt(message.prompt, message.index, message.settings);
        sendResponse({ success: result });
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
        
      case 'DEBUG':
        debugPageElements();
        sendResponse({ success: true });
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  }
  
  // ============================================
  // SMART ELEMENT FINDING
  // ============================================
  function findInputElement() {
    console.log('🔎 Looking for input element...');
    
    // Strategy 1: Try direct selectors
    for (const selector of SELECTORS.promptInput) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (isElementVisible(el) && isValidInputElement(el)) {
            console.log('✅ Found input via selector:', selector);
            return el;
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    // Strategy 2: Find by position (bottom of page)
    const textareas = document.querySelectorAll('textarea');
    if (textareas.length > 0) {
      // Get the textarea closest to the bottom of the viewport
      let bottomMost = null;
      let maxY = 0;
      textareas.forEach(ta => {
        const rect = ta.getBoundingClientRect();
        if (rect.y > maxY && isElementVisible(ta)) {
          maxY = rect.y;
          bottomMost = ta;
        }
      });
      if (bottomMost) {
        console.log('✅ Found input at bottom of page');
        return bottomMost;
      }
    }
    
    // Strategy 3: Find contenteditable at bottom
    const editables = document.querySelectorAll('[contenteditable="true"], [role="textbox"]');
    if (editables.length > 0) {
      let bottomMost = null;
      let maxY = 0;
      editables.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.y > maxY && isElementVisible(el)) {
          maxY = rect.y;
          bottomMost = el;
        }
      });
      if (bottomMost) {
        console.log('✅ Found contenteditable input at bottom');
        return bottomMost;
      }
    }
    
    console.log('❌ Could not find input element');
    return null;
  }
  
  function isValidInputElement(el) {
    // Check if it's not too small (like a hidden input)
    const rect = el.getBoundingClientRect();
    return rect.width > 100 && rect.height > 20;
  }
  
  function findGenerateButton() {
    console.log('🔎 Looking for generate/send button...');
    
    // Strategy 1: Find button with send/arrow icon near the input
    const input = findInputElement();
    if (input) {
      const inputRect = input.getBoundingClientRect();
      const buttons = document.querySelectorAll('button');
      
      // Look for button to the right of input or below it
      for (const btn of buttons) {
        const btnRect = btn.getBoundingClientRect();
        const isNearInput = (
          // To the right of input
          (btnRect.left >= inputRect.right - 100 && 
           Math.abs(btnRect.top - inputRect.top) < 100) ||
          // Below input (within 200px)
          (btnRect.top >= inputRect.bottom - 50 && 
           btnRect.top <= inputRect.bottom + 200)
        );
        
        if (isNearInput && isElementVisible(btn)) {
          // Check if it looks like a send button
          const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
          const className = (btn.className || '').toLowerCase();
          const innerHTML = btn.innerHTML.toLowerCase();
          
          // Check for arrow/send indicators
          const isSendButton = (
            ariaLabel.includes('send') ||
            ariaLabel.includes('submit') ||
            ariaLabel.includes('generate') ||
            ariaLabel.includes('create') ||
            className.includes('send') ||
            className.includes('submit') ||
            className.includes('arrow') ||
            innerHTML.includes('arrow') ||
            innerHTML.includes('send') ||
            // SVG arrow check
            btn.querySelector('svg path[d*="M"]') !== null
          );
          
          if (isSendButton) {
            console.log('✅ Found send button near input');
            return btn;
          }
        }
      }
      
      // Fallback: Find the rightmost button near the input
      let rightmostBtn = null;
      let maxX = 0;
      
      for (const btn of buttons) {
        const btnRect = btn.getBoundingClientRect();
        const isNearInput = Math.abs(btnRect.top - inputRect.top) < 100 || 
                           (btnRect.top >= inputRect.bottom - 20 && btnRect.top <= inputRect.bottom + 100);
        
        if (isNearInput && isElementVisible(btn) && btnRect.left > maxX) {
          // Exclude buttons that are clearly not submit buttons
          const text = btn.textContent?.toLowerCase() || '';
          if (!text.includes('cancel') && !text.includes('clear') && !text.includes('close')) {
            maxX = btnRect.left;
            rightmostBtn = btn;
          }
        }
      }
      
      if (rightmostBtn) {
        console.log('✅ Found rightmost button near input');
        return rightmostBtn;
      }
    }
    
    // Strategy 2: Try aria-label selectors
    for (const selector of SELECTORS.generateButton) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (isElementVisible(el) && el.tagName === 'BUTTON') {
            console.log('✅ Found button via selector:', selector);
            return el;
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    console.log('❌ Could not find generate button');
    return null;
  }
  
  function isElementVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0';
  }
  
  // ============================================
  // PROMPT SUBMISSION (FIXED)
  // ============================================
  async function submitPrompt(prompt, index, settings) {
    state.currentPrompt = prompt;
    state.settings = settings;
    state.detectedImages.clear();
    state.submissionCount++;
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📝 SUBMITTING PROMPT ${index + 1}`);
    console.log(`Text: "${prompt.text.substring(0, 80)}..."`);
    console.log(`${'='.repeat(50)}`);
    
    try {
      // Step 1: Find the input field
      const inputElement = findInputElement();
      
      if (!inputElement) {
        throw new Error('Could not find prompt input field');
      }
      
      console.log('Step 1: ✅ Found input element');
      
      // Step 2: Clear and set the text
      await setInputValue(inputElement, prompt.text);
      console.log('Step 2: ✅ Text entered into input');
      
      // Step 3: Wait a moment for any React state updates
      await sleep(300);
      
      // Step 4: Find the generate/send button
      const generateButton = findGenerateButton();
      
      if (!generateButton) {
        console.log('⚠️ Generate button not found, trying keyboard submit...');
        // Try pressing Enter as fallback
        inputElement.dispatchEvent(new KeyboardEvent('keydown', { 
          key: 'Enter', 
          code: 'Enter', 
          keyCode: 13,
          bubbles: true 
        }));
        console.log('Step 3: ⚠️ Sent Enter key as fallback');
      } else {
        console.log('Step 3: ✅ Found generate button');
        
        // Step 5: Click the button with multiple methods
        await clickButtonRobust(generateButton);
        console.log('Step 4: ✅ Clicked generate button');
      }
      
      console.log(`🎉 Prompt ${index + 1} submitted successfully!\n`);
      
      // Start monitoring for new images
      startImageMonitoring(prompt);
      
      return true;
      
    } catch (error) {
      console.error(`❌ Failed to submit prompt ${index + 1}:`, error);
      notifyGenerationFailed(prompt.id, error.message);
      return false;
    }
  }
  
  async function setInputValue(element, text) {
    // Focus the element first
    element.focus();
    await sleep(100);
    
    // Clear existing content
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      // Select all and delete
      element.select();
      document.execCommand('delete');
      
      // Set new value
      element.value = text;
      
      // Dispatch events that React listens to
      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      
      // Also try setting via native input event
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement?.prototype || window.HTMLInputElement.prototype, 
        'value'
      )?.set;
      
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, text);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
    } else if (element.contentEditable === 'true' || element.getAttribute('role') === 'textbox') {
      // For contenteditable
      element.innerHTML = '';
      element.textContent = text;
      
      // Dispatch input event
      element.dispatchEvent(new InputEvent('input', { 
        bubbles: true, 
        cancelable: true,
        inputType: 'insertText',
        data: text
      }));
    }
    
    // Trigger additional events
    element.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  }
  
  async function clickButtonRobust(button) {
    console.log('🖱️ Attempting to click button...');
    
    // Method 1: Direct click
    button.click();
    await sleep(50);
    
    // Method 2: Focus and click
    button.focus();
    button.click();
    await sleep(50);
    
    // Method 3: Mouse events
    const rect = button.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const mouseDownEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY
    });
    
    const mouseUpEvent = new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY
    });
    
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY
    });
    
    button.dispatchEvent(mouseDownEvent);
    await sleep(50);
    button.dispatchEvent(mouseUpEvent);
    await sleep(50);
    button.dispatchEvent(clickEvent);
    
    // Method 4: Pointer events (for modern browsers)
    const pointerDown = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY
    });
    
    const pointerUp = new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY
    });
    
    button.dispatchEvent(pointerDown);
    await sleep(50);
    button.dispatchEvent(pointerUp);
    
    console.log('🖱️ Click events dispatched');
  }
  
  // ============================================
  // IMAGE MONITORING
  // ============================================
  function setupImageObserver() {
    state.observer = new MutationObserver((mutations) => {
      if (!state.currentPrompt) return;
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList' || 
            (mutation.type === 'attributes' && mutation.attributeName === 'src')) {
          checkForNewImages();
        }
      }
    });
  }
  
  function startImageMonitoring(prompt) {
    const currentImages = getAllImages();
    state.lastImageCount = currentImages.length;
    
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });
    
    // Poll for images every second
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
      
      const expectedCount = state.settings.outputCount || 2;
      if (state.detectedImages.size >= expectedCount) {
        notifyImagesGenerated(state.currentPrompt.id, imageUrls);
      }
    }
  }
  
  function getAllImages() {
    const images = [];
    const seen = new Set();
    
    // Find all images on the page
    document.querySelectorAll('img').forEach(img => {
      if (isValidGeneratedImage(img) && !seen.has(img.src)) {
        seen.add(img.src);
        images.push(img);
      }
    });
    
    return images;
  }
  
  function isValidGeneratedImage(img) {
    const src = img.src || img.dataset?.src || '';
    if (!src) return false;
    
    // Check if it's a generated image
    if (src.startsWith('blob:') || 
        src.startsWith('data:image') ||
        src.includes('googleusercontent') ||
        src.includes('generated') ||
        src.includes('output')) {
      
      // Verify it's not too small (icons, etc.)
      if (img.naturalWidth >= 200 || img.width >= 200) {
        return true;
      }
    }
    
    return false;
  }
  
  // ============================================
  // BLOB DOWNLOAD
  // ============================================
  async function downloadBlobImage(blobUrl, filename, promptId) {
    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      
      const reader = new FileReader();
      reader.onloadend = () => {
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_DATA_URL',
          dataUrl: reader.result,
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
  // OUTPUT COUNT
  // ============================================
  async function setOutputCount(count) {
    // Try to find and set output count selector
    const selectors = ['select', 'input[type="number"]', '[class*="count"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        el.value = count.toString();
        el.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  }
  
  // ============================================
  // PAGE STATE
  // ============================================
  function getPageState() {
    return {
      hasInputField: !!findInputElement(),
      hasGenerateButton: !!findGenerateButton(),
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
  // INITIALIZE
  // ============================================
  initialize();
  
})();
