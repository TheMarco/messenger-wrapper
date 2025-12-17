const { app, BrowserWindow, session, Notification, ipcMain, globalShortcut, systemPreferences } = require('electron');
const path = require('path');

let mainWindow;

// Listen for notification requests from renderer process
ipcMain.on('show-notification', (event, { title, options }) => {
  console.log('Showing native notification:', title, options);

  // Check if notifications are supported
  if (!Notification.isSupported()) {
    console.error('Notifications are not supported on this system');
    return;
  }

  try {
    const notification = new Notification({
      title: title,
      body: options?.body || '',
      icon: options?.icon || path.join(__dirname, 'icon.png'),
      silent: options?.silent || false,
      urgency: 'critical',  // Try to force banner display
      timeoutType: 'never'  // Don't auto-dismiss
    });

    notification.on('click', () => {
      // Focus the window when notification is clicked
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });

    notification.show();
    console.log('Notification shown successfully');
  } catch (error) {
    console.error('Error showing notification:', error);
  }
});

function createWindow() {
  // Get session and inject script to disable service workers
  const ses = session.fromPartition('persist:messenger');

  ses.webRequest.onBeforeRequest((details, callback) => {
    // Block service worker requests
    if (details.url.includes('/sw?') || details.url.includes('service-worker')) {
      callback({ cancel: true });
    } else {
      callback({});
    }
  });

  // Handle permission requests for camera and microphone
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false, // Need to disable for ipcRenderer in preload
      partition: 'persist:messenger', // Use persistent session to maintain login
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Messenger'
  });

  // Track which chats we've already notified about
  let notifiedChats = new Set();
  let zeroCountStreak = 0;
  const RESET_THRESHOLD = 5; // Must see 0 count 5 times (10 seconds) before resetting

  // Monitor page title for unread messages
  setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const title = mainWindow.getTitle();
    const match = title.match(/\((\d+)\)/);
    const count = match ? parseInt(match[1]) : 0;

    // New unread messages detected
    if (count > 0) {
      zeroCountStreak = 0;

      // Find ALL chats with unread messages
      try {
        const unreadChats = await mainWindow.webContents.executeJavaScript(`
          (function() {
            const unread = [];

            // Look for chat rows in the sidebar
            const rows = document.querySelectorAll('[role="row"], [role="listitem"]');

            for (const row of rows) {
              // Look for bold text (indicates unread)
              const nameSpan = row.querySelector('span[dir="auto"]');
              if (!nameSpan || nameSpan.textContent.length === 0 || nameSpan.textContent.length > 50) {
                continue;
              }

              const name = nameSpan.textContent;
              const style = window.getComputedStyle(nameSpan);
              const fontWeight = style.fontWeight;

              // Check if name is bold (font-weight >= 600)
              const isBold = parseInt(fontWeight) >= 600 || fontWeight === 'bold';

              if (isBold) {
                // Get message preview
                const spans = row.querySelectorAll('span[dir="auto"]');
                let preview = '';
                for (let i = 1; i < spans.length; i++) {
                  const text = spans[i].textContent;
                  // Skip timestamps like "1m", "2h", "12w"
                  if (!/^\d+[mhwd]$/.test(text) && text.length > 0) {
                    preview = text;
                    break;
                  }
                }

                unread.push({ name, preview: preview.slice(0, 100) });
              }
            }

            return unread;
          })()
        `);

        if (unreadChats.length > 0) {
          console.log('Unread chats found:', unreadChats);
        }

        // Send notification for each chat we haven't notified yet
        for (const chat of unreadChats) {
          if (!notifiedChats.has(chat.name)) {
            notifiedChats.add(chat.name);

            const notification = new Notification({
              title: chat.name,
              body: chat.preview || 'New message',
              icon: path.join(__dirname, 'icon.png'),
              silent: false
            });

            notification.on('click', () => {
              if (mainWindow) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.focus();
              }
            });

            notification.show();
            console.log('Notification sent for:', chat.name);
          }
        }

      } catch (err) {
        console.error('Error finding unread chats:', err);
      }
    }

    // Track zero count streak for debounced reset
    if (count === 0) {
      zeroCountStreak++;
      if (zeroCountStreak >= RESET_THRESHOLD) {
        console.log('All messages read (sustained), resetting');
        notifiedChats.clear();
      }
    }
  }, 2000);

  // Handle permission requests
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('Permission requested:', permission);
    if (permission === 'notifications') {
      callback(true); // Always allow notifications
    } else {
      callback(false);
    }
  });

  // Load Facebook Messenger
  mainWindow.loadURL('https://www.messenger.com');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // Request media permissions on macOS at startup
  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    const cameraStatus = systemPreferences.getMediaAccessStatus('camera');

    console.log('Microphone status:', micStatus);
    console.log('Camera status:', cameraStatus);

    if (micStatus !== 'granted') {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      console.log('Microphone permission requested:', granted);
    }

    if (cameraStatus !== 'granted') {
      const granted = await systemPreferences.askForMediaAccess('camera');
      console.log('Camera permission requested:', granted);
    }
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

