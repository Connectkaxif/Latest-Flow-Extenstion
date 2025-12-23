/**
 * Google Flow Automation Pro - Background Service Worker
 * Handles workflow orchestration, timers, storage, and messaging
 */

// ============================================
// STATE
// ============================================
let workflowState = {
  isRunning: false,
  isPaused: false,
  currentIndex: 0,
  prompts: [],
  settings: {
    outputCount: 2,
    downloadFolder: 'FlowGenerations',
    intervalSeconds: 2
  },
  pendingDownloads: new Map(),
  processedPrompts: new Set()
};

let workflowInterval = null;
let activeTabId = null;

// ============================================
// INITIALIZATION
// ============================================
chrome.runtime.onInstalled.addListener(() => {
  console.log('Google Flow Automation Pro installed');
  loadState();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Google Flow Automation Pro started');
  loadState();
});

async function loadState() {
  try {
    const result = await chrome.storage.local.get(['workflowState']);
    if (result.workflowState) {
      workflowState = { ...workflowState, ...result.workflowState };
      workflowState.isRunning = false; // Don't auto-resume
      workflowState.isPaused = false;
    }
  } catch (error) {
    console.error('Failed to load state:', error);
  }
}

async function saveState() {
  try {
    await chrome.storage.local.set({ workflowState });
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

// ============================================
// MESSAGE HANDLING
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender, sendResponse) {
  console.log('Background received:', message.type);
  
  switch (message.type) {
    case 'START_WORKFLOW':
      await startWorkflow(message.prompts, message.settings, message.startIndex || 0);
      sendResponse({ success: true });
      break;
      
    case 'RESUME_WORKFLOW':
      await resumeWorkflow(message.currentIndex);
      sendResponse({ success: true });
      break;
      
    case 'PAUSE_WORKFLOW':
      pauseWorkflow();
      sendResponse({ success: true });
      break;
      
    case 'STOP_WORKFLOW':
      stopWorkflow();
      sendResponse({ success: true });
      break;
      
    case 'CLEAR_ALL':
      clearAll();
      sendResponse({ success: true });
      break;
      
    case 'UPDATE_SETTINGS':
      workflowState.settings = { ...workflowState.settings, ...message.settings };
      saveState();
      sendResponse({ success: true });
      break;
      
    case 'UPDATE_PROMPTS':
      workflowState.prompts = message.prompts;
      saveState();
      sendResponse({ success: true });
      break;
      
    case 'CREATE_NEW_PROJECT':
      await createNewProject();
      sendResponse({ success: true });
      break;
      
    case 'IMAGE_GENERATED':
      await handleImageGenerated(message.promptId, message.imageUrls);
      sendResponse({ success: true });
      break;
      
    case 'IMAGE_DOWNLOAD_COMPLETE':
      handleDownloadComplete(message.promptId);
      sendResponse({ success: true });
      break;
      
    case 'GENERATION_FAILED':
      handleGenerationFailed(message.promptId, message.error);
      sendResponse({ success: true });
      break;
      
    case 'GET_STATE':
      sendResponse({ 
        success: true, 
        state: workflowState 
      });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
}

// ============================================
// WORKFLOW CONTROL
// ============================================
async function startWorkflow(prompts, settings, startIndex = 0) {
  workflowState.prompts = prompts;
  workflowState.settings = settings;
  workflowState.currentIndex = startIndex;
  workflowState.isRunning = true;
  workflowState.isPaused = false;
  workflowState.processedPrompts = new Set();
  
  // Mark already processed prompts
  prompts.forEach((p, i) => {
    if (i < startIndex || p.status === 'completed' || p.status === 'failed') {
      workflowState.processedPrompts.add(p.id);
    }
  });
  
  await saveState();
  
  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url.includes('labs.google/fx/tools/flow')) {
    activeTabId = tab.id;
    
    // Inject content script if needed
    await ensureContentScriptInjected(tab.id);
    
    // Start the workflow loop
    startWorkflowLoop();
  } else {
    notifyError('Please navigate to Google Flow first');
  }
}

async function resumeWorkflow(currentIndex) {
  workflowState.currentIndex = currentIndex;
  workflowState.isRunning = true;
  workflowState.isPaused = false;
  
  await saveState();
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url.includes('labs.google/fx/tools/flow')) {
    activeTabId = tab.id;
    await ensureContentScriptInjected(tab.id);
    startWorkflowLoop();
  }
}

function pauseWorkflow() {
  workflowState.isPaused = true;
  workflowState.isRunning = false;
  
  if (workflowInterval) {
    clearInterval(workflowInterval);
    workflowInterval = null;
  }
  
  saveState();
}

function stopWorkflow() {
  workflowState.isRunning = false;
  workflowState.isPaused = false;
  
  if (workflowInterval) {
    clearInterval(workflowInterval);
    workflowInterval = null;
  }
  
  saveState();
}

function clearAll() {
  workflowState.prompts = [];
  workflowState.currentIndex = 0;
  workflowState.isRunning = false;
  workflowState.isPaused = false;
  workflowState.processedPrompts.clear();
  workflowState.pendingDownloads.clear();
  
  if (workflowInterval) {
    clearInterval(workflowInterval);
    workflowInterval = null;
  }
  
  saveState();
}

// ============================================
// WORKFLOW LOOP
// ============================================
function startWorkflowLoop() {
  if (workflowInterval) {
    clearInterval(workflowInterval);
  }
  
  // Process immediately, then every 2 seconds
  processNextPrompt();
  
  workflowInterval = setInterval(() => {
    if (workflowState.isRunning && !workflowState.isPaused) {
      processNextPrompt();
    }
  }, workflowState.settings.intervalSeconds * 1000);
}

async function processNextPrompt() {
  if (!workflowState.isRunning || workflowState.isPaused) {
    return;
  }
  
  // Find next pending prompt
  const pendingIndex = workflowState.prompts.findIndex((p, i) => 
    i >= workflowState.currentIndex && 
    p.status === 'pending' && 
    !workflowState.processedPrompts.has(p.id)
  );
  
  if (pendingIndex === -1) {
    // Check if all prompts are processed
    const allDone = workflowState.prompts.every(p => 
      p.status === 'completed' || p.status === 'failed'
    );
    
    if (allDone) {
      workflowCompleted();
    }
    return;
  }
  
  const prompt = workflowState.prompts[pendingIndex];
  workflowState.currentIndex = pendingIndex;
  
  // Send prompt to content script
  try {
    await chrome.tabs.sendMessage(activeTabId, {
      type: 'SUBMIT_PROMPT',
      prompt: prompt,
      index: pendingIndex,
      settings: workflowState.settings
    });
    
    // Mark as processing
    workflowState.processedPrompts.add(prompt.id);
    
    // Notify popup
    notifyPopup({
      type: 'PROMPT_SUBMITTED',
      promptId: prompt.id,
      currentIndex: pendingIndex + 1
    });
    
    // Update prompt status
    prompt.status = 'submitted';
    saveState();
    
  } catch (error) {
    console.error('Failed to send prompt:', error);
    notifyError(`Failed to submit prompt ${pendingIndex + 1}`);
  }
}

function workflowCompleted() {
  workflowState.isRunning = false;
  workflowState.isPaused = false;
  
  if (workflowInterval) {
    clearInterval(workflowInterval);
    workflowInterval = null;
  }
  
  notifyPopup({ type: 'WORKFLOW_COMPLETED' });
  saveState();
}

// ============================================
// IMAGE HANDLING
// ============================================
async function handleImageGenerated(promptId, imageUrls) {
  if (!imageUrls || imageUrls.length === 0) {
    handleGenerationFailed(promptId, 'No images generated');
    return;
  }
  
  const prompt = workflowState.prompts.find(p => p.id === promptId);
  if (!prompt) return;
  
  const sceneNumber = prompt.id;
  const folderName = workflowState.settings.downloadFolder || 'FlowGenerations';
  
  workflowState.pendingDownloads.set(promptId, {
    total: imageUrls.length,
    completed: 0
  });
  
  // Download each image
  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    const filename = `${folderName}/Scene ${sceneNumber} Image ${i + 1}.png`;
    
    try {
      await downloadImage(imageUrl, filename, promptId);
    } catch (error) {
      console.error(`Failed to download image ${i + 1}:`, error);
    }
  }
}

async function downloadImage(url, filename, promptId) {
  try {
    // Handle different URL types
    let downloadUrl = url;
    
    // If it's a blob URL, fetch and convert
    if (url.startsWith('blob:')) {
      // Blob URLs need special handling through content script
      await chrome.tabs.sendMessage(activeTabId, {
        type: 'DOWNLOAD_BLOB',
        blobUrl: url,
        filename: filename,
        promptId: promptId
      });
      return;
    }
    
    // For regular URLs or data URLs
    const downloadId = await chrome.downloads.download({
      url: downloadUrl,
      filename: filename,
      saveAs: false
    });
    
    // Track download completion
    chrome.downloads.onChanged.addListener(function downloadListener(delta) {
      if (delta.id === downloadId && delta.state) {
        if (delta.state.current === 'complete') {
          chrome.downloads.onChanged.removeListener(downloadListener);
          checkDownloadComplete(promptId);
        } else if (delta.state.current === 'interrupted') {
          chrome.downloads.onChanged.removeListener(downloadListener);
          console.error('Download interrupted');
        }
      }
    });
    
  } catch (error) {
    console.error('Download error:', error);
  }
}

function checkDownloadComplete(promptId) {
  const pending = workflowState.pendingDownloads.get(promptId);
  if (!pending) return;
  
  pending.completed++;
  
  if (pending.completed >= pending.total) {
    workflowState.pendingDownloads.delete(promptId);
    handleDownloadComplete(promptId);
  }
}

function handleDownloadComplete(promptId) {
  const prompt = workflowState.prompts.find(p => p.id === promptId);
  if (prompt) {
    prompt.status = 'completed';
    saveState();
    
    notifyPopup({
      type: 'PROMPT_COMPLETED',
      promptId: promptId
    });
  }
}

function handleGenerationFailed(promptId, error) {
  const prompt = workflowState.prompts.find(p => p.id === promptId);
  if (prompt) {
    prompt.status = 'failed';
    prompt.error = error;
    saveState();
    
    notifyPopup({
      type: 'PROMPT_FAILED',
      promptId: promptId,
      error: error
    });
  }
}

// ============================================
// PROJECT MANAGEMENT
// ============================================
async function createNewProject() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab) {
      await chrome.tabs.update(tab.id, {
        url: 'https://labs.google/fx/tools/flow'
      });
      activeTabId = tab.id;
      
      // Wait for page load and inject content script
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(() => {
            ensureContentScriptInjected(tabId);
          }, 2000);
        }
      });
    }
  } catch (error) {
    console.error('Failed to create new project:', error);
    notifyError('Failed to create new project');
  }
}

// ============================================
// CONTENT SCRIPT INJECTION
// ============================================
async function ensureContentScriptInjected(tabId) {
  try {
    // Try to ping the content script
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (response && response.pong) {
      console.log('Content script already active');
      return true;
    }
  } catch (error) {
    // Content script not loaded, inject it
    console.log('Injecting content script...');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/content.js']
      });
      
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['content/content.css']
      });
      
      console.log('Content script injected successfully');
      return true;
    } catch (injectError) {
      console.error('Failed to inject content script:', injectError);
      return false;
    }
  }
}

// ============================================
// NOTIFICATIONS
// ============================================
async function notifyPopup(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (error) {
    // Popup might be closed, that's OK
    console.log('Popup not available');
  }
}

function notifyError(error) {
  notifyPopup({ type: 'ERROR', error: error });
}

// ============================================
// TAB MONITORING
// ============================================
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  
  if (tab.url && tab.url.includes('labs.google/fx/tools/flow')) {
    activeTabId = activeInfo.tabId;
    
    // Check for project ID
    const projectMatch = tab.url.match(/project\/([a-f0-9-]+)/);
    notifyPopup({
      type: 'CONNECTION_STATUS',
      connected: true,
      projectId: projectMatch ? projectMatch[1] : null
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('labs.google/fx/tools/flow')) {
    activeTabId = tabId;
    ensureContentScriptInjected(tabId);
  }
});

// ============================================
// ALARM FOR PERSISTENCE
// ============================================
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // Keep service worker alive during workflow
    if (workflowState.isRunning) {
      console.log('Workflow keepalive check');
    }
  }
});

