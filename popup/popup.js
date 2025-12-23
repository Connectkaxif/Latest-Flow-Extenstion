/**
 * Google Flow Automation Pro - Popup Script
 * Handles UI interactions, prompt management, and communication with background script
 */

// ============================================
// STATE MANAGEMENT
// ============================================
const state = {
  prompts: [],
  settings: {
    outputCount: 2,
    downloadFolder: '',
    intervalSeconds: 2
  },
  workflow: {
    status: 'idle', // idle, running, paused, stopped, completed
    currentIndex: 0,
    startTime: null,
    elapsedSeconds: 0
  }
};

// ============================================
// DOM ELEMENTS
// ============================================
const elements = {
  // Header
  statusIndicator: document.getElementById('statusIndicator'),
  projectStatus: document.getElementById('projectStatus'),
  
  // Settings
  outputBtns: document.querySelectorAll('.output-btn'),
  downloadFolder: document.getElementById('downloadFolder'),
  selectFolderBtn: document.getElementById('selectFolderBtn'),
  
  // Prompts
  uploadArea: document.getElementById('uploadArea'),
  fileInput: document.getElementById('fileInput'),
  pasteInput: document.getElementById('pasteInput'),
  addPromptsBtn: document.getElementById('addPromptsBtn'),
  promptsList: document.getElementById('promptsList'),
  emptyState: document.getElementById('emptyState'),
  totalCount: document.getElementById('totalCount'),
  completedCount: document.getElementById('completedCount'),
  failedCount: document.getElementById('failedCount'),
  
  // Progress
  progressSection: document.getElementById('progressSection'),
  progressBar: document.getElementById('progressBar'),
  progressPercentage: document.getElementById('progressPercentage'),
  elapsedTime: document.getElementById('elapsedTime'),
  remainingTime: document.getElementById('remainingTime'),
  
  // Controls
  runBtn: document.getElementById('runBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  stopBtn: document.getElementById('stopBtn'),
  clearBtn: document.getElementById('clearBtn'),
  
  // Modal
  projectModal: document.getElementById('projectModal'),
  modalClose: document.getElementById('modalClose'),
  sameProjectBtn: document.getElementById('sameProjectBtn'),
  newProjectBtn: document.getElementById('newProjectBtn'),
  
  // Toast
  toast: document.getElementById('toast')
};

// ============================================
// INITIALIZATION
// ============================================
async function initialize() {
  await loadSavedState();
  setupEventListeners();
  setupFileParser();
  checkConnection();
  updateUI();
}

async function loadSavedState() {
  try {
    const result = await chrome.storage.local.get(['prompts', 'settings', 'workflow']);
    
    if (result.prompts) {
      state.prompts = result.prompts;
    }
    if (result.settings) {
      state.settings = { ...state.settings, ...result.settings };
    }
    if (result.workflow) {
      state.workflow = { ...state.workflow, ...result.workflow };
    }
    
    // Update UI with loaded settings
    updateOutputSelection(state.settings.outputCount);
    if (state.settings.downloadFolder) {
      elements.downloadFolder.value = state.settings.downloadFolder;
    }
  } catch (error) {
    console.error('Failed to load saved state:', error);
  }
}

async function saveState() {
  try {
    await chrome.storage.local.set({
      prompts: state.prompts,
      settings: state.settings,
      workflow: state.workflow
    });
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
  // Output selection
  elements.outputBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const count = parseInt(btn.dataset.count);
      updateOutputSelection(count);
      state.settings.outputCount = count;
      saveState();
      sendMessage({ type: 'UPDATE_SETTINGS', settings: state.settings });
    });
  });
  
  // Folder selection
  elements.selectFolderBtn.addEventListener('click', selectDownloadFolder);
  elements.downloadFolder.addEventListener('click', selectDownloadFolder);
  
  // Upload area
  elements.uploadArea.addEventListener('click', () => elements.fileInput.click());
  elements.uploadArea.addEventListener('dragover', handleDragOver);
  elements.uploadArea.addEventListener('dragleave', handleDragLeave);
  elements.uploadArea.addEventListener('drop', handleDrop);
  elements.fileInput.addEventListener('change', handleFileSelect);
  
  // Paste area
  elements.addPromptsBtn.addEventListener('click', addPastedPrompts);
  elements.pasteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      addPastedPrompts();
    }
  });
  
  // Control buttons
  elements.runBtn.addEventListener('click', handleRun);
  elements.pauseBtn.addEventListener('click', handlePause);
  elements.stopBtn.addEventListener('click', handleStop);
  elements.clearBtn.addEventListener('click', handleClear);
  
  // Modal
  elements.modalClose.addEventListener('click', closeModal);
  elements.sameProjectBtn.addEventListener('click', () => startWorkflow(false));
  elements.newProjectBtn.addEventListener('click', () => startWorkflow(true));
  
  // Listen for messages from background
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
}

// ============================================
// CONNECTION CHECK
// ============================================
async function checkConnection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url && tab.url.includes('labs.google/fx/tools/flow')) {
      const projectMatch = tab.url.match(/project\/([a-f0-9-]+)/);
      
      if (projectMatch) {
        elements.projectStatus.textContent = `Project: ${projectMatch[1].slice(0, 8)}...`;
        elements.projectStatus.classList.add('connected');
      } else {
        elements.projectStatus.textContent = 'Google Flow (No Project)';
        elements.projectStatus.classList.add('connected');
      }
    } else {
      elements.projectStatus.textContent = 'Not on Google Flow';
      elements.projectStatus.classList.remove('connected');
    }
  } catch (error) {
    elements.projectStatus.textContent = 'Connection Error';
  }
}

// ============================================
// OUTPUT SELECTION
// ============================================
function updateOutputSelection(count) {
  elements.outputBtns.forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.count) === count);
  });
}

// ============================================
// FOLDER SELECTION
// ============================================
async function selectDownloadFolder() {
  // Chrome extensions can't directly access file system picker
  // We'll use the default downloads folder with subfolder naming
  const folderName = prompt('Enter folder name for downloads (will be created in Downloads):', 'FlowGenerations');
  
  if (folderName) {
    state.settings.downloadFolder = folderName;
    elements.downloadFolder.value = `Downloads/${folderName}`;
    saveState();
    sendMessage({ type: 'UPDATE_SETTINGS', settings: state.settings });
    showToast('Download folder set successfully', 'success');
  }
}

// ============================================
// FILE PARSING
// ============================================
function setupFileParser() {
  // Load PDF.js library dynamically if needed
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  elements.uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  elements.uploadArea.classList.remove('dragover');
}

async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  elements.uploadArea.classList.remove('dragover');
  
  const files = e.dataTransfer.files;
  await processFiles(files);
}

async function handleFileSelect(e) {
  const files = e.target.files;
  await processFiles(files);
  e.target.value = ''; // Reset input
}

async function processFiles(files) {
  let totalPrompts = 0;
  
  for (const file of files) {
    try {
      const prompts = await parseFile(file);
      if (prompts.length > 0) {
        addPrompts(prompts);
        totalPrompts += prompts.length;
      }
    } catch (error) {
      console.error(`Failed to parse ${file.name}:`, error);
      showToast(`Failed to parse ${file.name}`, 'error');
    }
  }
  
  if (totalPrompts > 0) {
    showToast(`Added ${totalPrompts} prompts from ${files.length} file(s)`, 'success');
  }
}

async function parseFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  
  switch (extension) {
    case 'txt':
    case 'text':
      return parseTextFile(file);
    case 'doc':
    case 'docx':
      return parseDocFile(file);
    case 'pdf':
      return parsePdfFile(file);
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}

async function parseTextFile(file) {
  const text = await file.text();
  return text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

async function parseDocFile(file) {
  // For .docx files, we'll use a basic XML parsing approach
  // The actual implementation would use mammoth.js library
  const arrayBuffer = await file.arrayBuffer();
  
  try {
    // Try to extract text from docx (which is a zip file with XML)
    const text = await extractTextFromDocx(arrayBuffer);
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  } catch (error) {
    // Fallback: try reading as plain text
    const decoder = new TextDecoder();
    const text = decoder.decode(arrayBuffer);
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.includes('<?xml') && line.length < 500);
  }
}

async function extractTextFromDocx(arrayBuffer) {
  // Basic docx text extraction
  // For production, use mammoth.js library
  const uint8Array = new Uint8Array(arrayBuffer);
  const decoder = new TextDecoder();
  const content = decoder.decode(uint8Array);
  
  // Try to find text content in the docx XML
  const textMatches = content.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
  
  if (textMatches) {
    return textMatches
      .map(match => match.replace(/<\/?w:t[^>]*>/g, ''))
      .join(' ')
      .split(/[\n\r]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');
  }
  
  throw new Error('Could not extract text from docx');
}

async function parsePdfFile(file) {
  // For PDF files, we'll provide a warning and try basic extraction
  showToast('PDF parsing is limited. For best results, use .txt files.', 'warning');
  
  const arrayBuffer = await file.arrayBuffer();
  const decoder = new TextDecoder();
  const content = decoder.decode(arrayBuffer);
  
  // Try to extract visible text from PDF
  const textMatches = content.match(/\(([^)]+)\)/g);
  
  if (textMatches) {
    const lines = textMatches
      .map(match => match.slice(1, -1))
      .filter(text => text.length > 10 && !text.includes('\\') && /^[\x20-\x7E\s]+$/.test(text))
      .join(' ')
      .split(/[\n\r.!?]+/)
      .map(line => line.trim())
      .filter(line => line.length > 20);
    
    if (lines.length > 0) {
      return lines;
    }
  }
  
  throw new Error('Could not extract text from PDF. Please use a .txt file instead.');
}

// ============================================
// PROMPT MANAGEMENT
// ============================================
function addPastedPrompts() {
  const text = elements.pasteInput.value.trim();
  
  if (!text) {
    showToast('Please enter some prompts', 'warning');
    return;
  }
  
  const prompts = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  if (prompts.length > 0) {
    addPrompts(prompts);
    elements.pasteInput.value = '';
    showToast(`Added ${prompts.length} prompt(s)`, 'success');
  }
}

function addPrompts(newPrompts) {
  const startIndex = state.prompts.length;
  
  const promptObjects = newPrompts.map((text, index) => ({
    id: startIndex + index + 1,
    text: text,
    status: 'pending', // pending, submitted, completed, failed
    createdAt: Date.now()
  }));
  
  state.prompts.push(...promptObjects);
  saveState();
  renderPromptsList();
  updateStats();
  sendMessage({ type: 'UPDATE_PROMPTS', prompts: state.prompts });
}

function renderPromptsList() {
  if (state.prompts.length === 0) {
    elements.emptyState.style.display = 'flex';
    elements.promptsList.innerHTML = '';
    elements.promptsList.appendChild(elements.emptyState);
    return;
  }
  
  elements.emptyState.style.display = 'none';
  elements.promptsList.innerHTML = '';
  
  state.prompts.forEach((prompt, index) => {
    const item = createPromptItem(prompt, index + 1);
    elements.promptsList.appendChild(item);
  });
  
  // Scroll to current item if running
  if (state.workflow.status === 'running' && state.workflow.currentIndex > 0) {
    const currentItem = elements.promptsList.children[state.workflow.currentIndex - 1];
    if (currentItem) {
      currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

function createPromptItem(prompt, number) {
  const item = document.createElement('div');
  item.className = `prompt-item ${prompt.status}`;
  item.dataset.id = prompt.id;
  
  // Status icons
  let statusHtml = '';
  switch (prompt.status) {
    case 'submitted':
      statusHtml = '<span class="check-mark">✓</span>';
      break;
    case 'completed':
      statusHtml = '<span class="check-mark">✓</span><span class="check-mark">✓</span>';
      break;
    case 'failed':
      statusHtml = '<span class="check-mark">✓</span><span class="cross-mark">✕</span>';
      break;
    case 'processing':
      statusHtml = '<span class="spinner"></span>';
      break;
    default:
      statusHtml = '<span class="pending-dot">○</span>';
  }
  
  item.innerHTML = `
    <div class="prompt-number">${number}</div>
    <div class="prompt-status">${statusHtml}</div>
    <div class="prompt-text" title="${escapeHtml(prompt.text)}">${escapeHtml(prompt.text)}</div>
  `;
  
  return item;
}

function updatePromptStatus(promptId, status) {
  const prompt = state.prompts.find(p => p.id === promptId);
  if (prompt) {
    prompt.status = status;
    saveState();
    renderPromptsList();
    updateStats();
  }
}

function updateStats() {
  const total = state.prompts.length;
  const completed = state.prompts.filter(p => p.status === 'completed').length;
  const failed = state.prompts.filter(p => p.status === 'failed').length;
  
  elements.totalCount.textContent = `${total} Total`;
  elements.completedCount.textContent = `${completed} Done`;
  elements.failedCount.textContent = `${failed} Failed`;
}

// ============================================
// WORKFLOW CONTROL
// ============================================
function handleRun() {
  if (state.prompts.length === 0) {
    showToast('Please add some prompts first', 'warning');
    return;
  }
  
  // Check if resuming or starting fresh
  const pendingPrompts = state.prompts.filter(p => p.status === 'pending');
  const submittedPrompts = state.prompts.filter(p => p.status === 'submitted' || p.status === 'completed');
  
  if (state.workflow.status === 'paused') {
    // Resume
    resumeWorkflow();
  } else if (submittedPrompts.length > 0 && pendingPrompts.length > 0) {
    // Ask to resume or start fresh
    const resume = confirm('You have progress from a previous session. Continue from where you left off?');
    if (resume) {
      resumeWorkflow();
    } else {
      resetWorkflow();
      showProjectModal();
    }
  } else {
    showProjectModal();
  }
}

function showProjectModal() {
  elements.projectModal.style.display = 'flex';
}

function closeModal() {
  elements.projectModal.style.display = 'none';
}

async function startWorkflow(createNewProject) {
  closeModal();
  
  if (createNewProject) {
    // Send message to open new project
    await sendMessage({ type: 'CREATE_NEW_PROJECT' });
    showToast('Creating new project...', 'info');
    
    // Wait a bit for the page to load
    setTimeout(() => {
      initiateWorkflow();
    }, 3000);
  } else {
    initiateWorkflow();
  }
}

function initiateWorkflow() {
  state.workflow.status = 'running';
  state.workflow.startTime = Date.now() - (state.workflow.elapsedSeconds * 1000);
  
  updateWorkflowUI();
  saveState();
  
  sendMessage({
    type: 'START_WORKFLOW',
    prompts: state.prompts,
    settings: state.settings,
    startIndex: state.workflow.currentIndex
  });
  
  startTimerUpdate();
  showToast('Workflow started!', 'success');
}

function resumeWorkflow() {
  state.workflow.status = 'running';
  state.workflow.startTime = Date.now() - (state.workflow.elapsedSeconds * 1000);
  
  updateWorkflowUI();
  saveState();
  
  sendMessage({
    type: 'RESUME_WORKFLOW',
    currentIndex: state.workflow.currentIndex
  });
  
  startTimerUpdate();
  showToast('Workflow resumed!', 'success');
}

function handlePause() {
  state.workflow.status = 'paused';
  state.workflow.elapsedSeconds = Math.floor((Date.now() - state.workflow.startTime) / 1000);
  
  updateWorkflowUI();
  saveState();
  
  sendMessage({ type: 'PAUSE_WORKFLOW' });
  stopTimerUpdate();
  showToast('Workflow paused', 'warning');
}

function handleStop() {
  if (confirm('Are you sure you want to stop the workflow? Progress will be saved.')) {
    state.workflow.status = 'stopped';
    state.workflow.elapsedSeconds = Math.floor((Date.now() - state.workflow.startTime) / 1000);
    
    updateWorkflowUI();
    saveState();
    
    sendMessage({ type: 'STOP_WORKFLOW' });
    stopTimerUpdate();
    showToast('Workflow stopped', 'error');
  }
}

function handleClear() {
  if (state.workflow.status === 'running') {
    showToast('Cannot clear while workflow is running', 'error');
    return;
  }
  
  if (confirm('Are you sure you want to clear all prompts?')) {
    state.prompts = [];
    state.workflow = {
      status: 'idle',
      currentIndex: 0,
      startTime: null,
      elapsedSeconds: 0
    };
    
    saveState();
    renderPromptsList();
    updateStats();
    updateWorkflowUI();
    
    sendMessage({ type: 'CLEAR_ALL' });
    showToast('All prompts cleared', 'success');
  }
}

function resetWorkflow() {
  state.prompts.forEach(p => {
    p.status = 'pending';
  });
  state.workflow = {
    status: 'idle',
    currentIndex: 0,
    startTime: null,
    elapsedSeconds: 0
  };
  saveState();
  renderPromptsList();
  updateStats();
}

// ============================================
// UI UPDATES
// ============================================
function updateWorkflowUI() {
  const { status } = state.workflow;
  
  // Update status indicator
  elements.statusIndicator.className = `status-indicator ${status}`;
  elements.statusIndicator.querySelector('.status-text').textContent = 
    status.charAt(0).toUpperCase() + status.slice(1);
  
  // Update buttons
  elements.runBtn.disabled = status === 'running';
  elements.pauseBtn.disabled = status !== 'running';
  elements.stopBtn.disabled = status !== 'running' && status !== 'paused';
  
  // Update run button text
  if (status === 'paused') {
    elements.runBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      Resume
    `;
    elements.runBtn.disabled = false;
  } else {
    elements.runBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      Run
    `;
  }
  
  // Show/hide progress section
  elements.progressSection.style.display = 
    (status === 'running' || status === 'paused') ? 'block' : 'none';
  
  updateProgressBar();
}

function updateProgressBar() {
  const total = state.prompts.length;
  
  // Count submitted as partial progress, completed/failed as full progress
  const submitted = state.prompts.filter(p => p.status === 'submitted').length;
  const completed = state.prompts.filter(p => p.status === 'completed').length;
  const failed = state.prompts.filter(p => p.status === 'failed').length;
  
  // Each submitted prompt counts as 0.5 progress, completed/failed as 1
  const progress = completed + failed + (submitted * 0.5);
  const percentage = total > 0 ? Math.round((progress / total) * 100) : 0;
  
  // Cap at 100%
  const cappedPercentage = Math.min(percentage, 100);
  
  elements.progressBar.style.width = `${cappedPercentage}%`;
  elements.progressPercentage.textContent = `${cappedPercentage}%`;
  
  // Also update stats while we're here
  updateStats();
}

// ============================================
// TIMER MANAGEMENT
// ============================================
let timerInterval = null;

function startTimerUpdate() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  
  timerInterval = setInterval(updateTimers, 1000);
  updateTimers();
}

function stopTimerUpdate() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimers() {
  if (!state.workflow.startTime) return;
  
  const elapsed = Math.floor((Date.now() - state.workflow.startTime) / 1000);
  elements.elapsedTime.textContent = formatTime(elapsed);
  
  // Calculate remaining time based on submitted prompts (more accurate)
  const total = state.prompts.length;
  const submitted = state.prompts.filter(p => p.status === 'submitted').length;
  const completed = state.prompts.filter(p => p.status === 'completed').length;
  const failed = state.prompts.filter(p => p.status === 'failed').length;
  const processed = submitted + completed + failed;
  const remaining = total - processed;
  
  if (processed > 0 && remaining > 0) {
    // Use interval setting (2 seconds) for more accurate estimation
    const intervalSeconds = state.settings.intervalSeconds || 2;
    const estimatedRemaining = remaining * intervalSeconds;
    elements.remainingTime.textContent = formatTime(estimatedRemaining);
  } else if (remaining === 0) {
    elements.remainingTime.textContent = '00:00:00';
  } else {
    // Estimate based on total prompts * interval
    const intervalSeconds = state.settings.intervalSeconds || 2;
    const estimatedTotal = total * intervalSeconds;
    elements.remainingTime.textContent = formatTime(estimatedTotal);
  }
  
  // Update progress bar on each tick
  updateProgressBar();
}

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return [
    hrs.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ].join(':');
}

// ============================================
// MESSAGE HANDLING
// ============================================
async function sendMessage(message) {
  try {
    const response = await chrome.runtime.sendMessage(message);
    return response;
  } catch (error) {
    console.error('Failed to send message:', error);
    return null;
  }
}

function handleBackgroundMessage(message, sender, sendResponse) {
  switch (message.type) {
    case 'PROMPT_SUBMITTED':
      updatePromptStatus(message.promptId, 'submitted');
      state.workflow.currentIndex = message.currentIndex;
      saveState();
      break;
      
    case 'PROMPT_COMPLETED':
      updatePromptStatus(message.promptId, 'completed');
      updateProgressBar();
      break;
      
    case 'PROMPT_FAILED':
      updatePromptStatus(message.promptId, 'failed');
      updateProgressBar();
      break;
      
    case 'WORKFLOW_COMPLETED':
      state.workflow.status = 'completed';
      updateWorkflowUI();
      stopTimerUpdate();
      saveState();
      showToast('Workflow completed!', 'success');
      break;
      
    case 'CONNECTION_STATUS':
      if (message.connected) {
        elements.projectStatus.textContent = message.projectId 
          ? `Project: ${message.projectId.slice(0, 8)}...`
          : 'Connected';
        elements.projectStatus.classList.add('connected');
      } else {
        elements.projectStatus.textContent = 'Disconnected';
        elements.projectStatus.classList.remove('connected');
      }
      break;
      
    case 'ERROR':
      showToast(message.error, 'error');
      break;
  }
  
  sendResponse({ received: true });
  return true;
}

// ============================================
// UTILITIES
// ============================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const toast = elements.toast;
  toast.className = `toast ${type}`;
  toast.querySelector('.toast-message').textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function updateUI() {
  renderPromptsList();
  updateStats();
  updateWorkflowUI();
  
  if (state.workflow.status === 'running') {
    startTimerUpdate();
  }
}

// ============================================
// INITIALIZE
// ============================================
document.addEventListener('DOMContentLoaded', initialize);

