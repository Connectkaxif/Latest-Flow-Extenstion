# Google Flow Automation Pro

A powerful Chrome extension for automating bulk image generation on Google Flow (labs.google/fx/tools/flow).

## 🚀 Features

- **Bulk Prompt Upload**: Upload hundreds of prompts via copy-paste, drag-drop, or file upload
- **Supported File Formats**: .txt, .text, .doc, .docx, .pdf
- **Real-time Progress Tracking**: Live progress bar with accurate percentage
- **Dual Timer System**: Shows elapsed time and estimated remaining time
- **WhatsApp-style Status**: Single ✓ for submitted, double ✓✓ for completed, ✓✕ for failed
- **Auto Download**: Automatically downloads generated images
- **Smart Rename**: Renames images as "Scene X Image Y"
- **Pause/Resume**: Pause and resume workflow at any time
- **Persistence**: Progress is saved even if browser closes
- **Project Selection**: Choose to run in same project or create new

## 📦 Installation

### Method 1: Load Unpacked (Developer Mode)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `google-flow-automation` folder
5. The extension icon should appear in your toolbar

### Method 2: Generate Icons (Optional)

If the icons don't display correctly:
1. Open `icons/create_icons.html` in Chrome
2. Open Developer Console (F12)
3. The icons will be generated and downloaded automatically
4. Replace the existing icon files with the downloaded ones

## 🎯 Usage

### 1. Navigate to Google Flow
Go to https://labs.google/fx/tools/flow and open or create a project.

### 2. Add Prompts
- **Copy/Paste**: Paste prompts directly (one per line)
- **File Upload**: Drag & drop or click to upload .txt, .docx, or .pdf files

### 3. Configure Settings
- **Images per Prompt**: Select 1-4 images per prompt
- **Download Folder**: Set the folder name for downloaded images

### 4. Start Workflow
1. Click **Run**
2. Choose **Same Project** or **New Project**
3. Watch the automation work!

### 5. Controls
- **Run/Resume**: Start or continue the workflow
- **Pause**: Temporarily stop (progress saved)
- **Stop**: Completely stop the workflow

## 📊 Status Indicators

| Status | Icon | Meaning |
|--------|------|---------|
| Pending | ○ | Not yet processed |
| Submitted | ✓ | Prompt sent to generator |
| Completed | ✓✓ | Images downloaded successfully |
| Failed | ✓✕ | Generation failed |

## ⚙️ Technical Details

### File Structure
```
google-flow-automation/
├── manifest.json          # Extension configuration
├── popup/
│   ├── popup.html         # Extension UI
│   ├── popup.css          # Styles
│   └── popup.js           # UI logic
├── background/
│   └── background.js      # Service worker
├── content/
│   ├── content.js         # Page interaction
│   └── content.css        # Page styles
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

### Permissions Used
- `activeTab`: Access current tab
- `storage`: Save progress and settings
- `downloads`: Auto-download images
- `tabs`: Monitor tab changes
- `scripting`: Inject content script
- `alarms`: Keep service worker alive

## 🔧 Customization

### Adjust Selectors
If the extension doesn't work correctly, you may need to adjust the DOM selectors in `content/content.js`:

```javascript
const SELECTORS = {
  promptInput: [...],     // Input field selectors
  generateButton: [...],  // Generate button selectors
  imageContainer: [...],  // Image output container
  generatedImage: [...]   // Individual image selectors
};
```

### Change Timing
Modify the interval in `popup/popup.js`:
```javascript
settings: {
  intervalSeconds: 2  // Time between prompts (seconds)
}
```

## 🐛 Troubleshooting

### Extension not working
1. Make sure you're on https://labs.google/fx/tools/flow
2. Refresh the page
3. Check if you're logged in to Google

### Images not downloading
1. Check browser download settings
2. Ensure downloads are not blocked
3. Try a different download folder name

### Prompts not submitting
1. The page structure may have changed
2. Check the console for errors (F12 > Console)
3. Update selectors in content.js if needed

## 📝 Notes

- The extension submits one prompt every 2 seconds
- Image generation continues in background
- Progress is automatically saved
- Works best with .txt files (one prompt per line)

## 📄 License

MIT License - Free to use and modify.

## 🤝 Support

For issues or feature requests, please open an issue on GitHub.

