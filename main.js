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

  // Track which messages we've already notified about (chat name + preview hash)
  let notifiedMessages = new Set();
  let zeroCountStreak = 0;
  const RESET_THRESHOLD = 5; // Must see 0 count 5 times (10 seconds) before resetting

  // Monitor page title for unread messages
  setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const title = mainWindow.getTitle();
    const match = title.match(/\((\d+)\)/);
    const count = match ? parseInt(match[1]) : 0;

    // New unread messages detected - only process if count INCREASED
    if (count > 0 && count > lastUnreadCount) {
      zeroCountStreak = 0;

      // Find ONLY the NEW unread chats (ones we haven't seen before)
      try {
        const unreadChats = await mainWindow.webContents.executeJavaScript(`
          (async function() {
            const unread = [];

            // Remember which chat is currently open
            const currentChatName = document.querySelector('[role="main"] h1')?.textContent || '';

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
                let preview = '';

                // Click on this chat to open it
                row.click();

                // Wait for the conversation to load
                await new Promise(resolve => setTimeout(resolve, 500));

                // Now read the actual latest message from the conversation view
                // Look for message containers in the main conversation area
                const conversationArea = document.querySelector('[role="main"]');
                if (!conversationArea) {
                  preview = 'New message';
                } else {
                  // Find all message rows in the conversation
                  const messages = conversationArea.querySelectorAll('[role="row"]');

                  console.log('Found', messages.length, 'messages for', name);

                  // Get the last message that's NOT from "You"
                  for (let i = messages.length - 1; i >= 0; i--) {
                    const msg = messages[i];
                    const ariaLabel = msg.getAttribute('aria-label') || '';

                    console.log('Checking message', i, ':', ariaLabel.substring(0, 100));

                    // Skip messages from "You"
                    if (ariaLabel.toLowerCase().includes('you sent') ||
                        ariaLabel.toLowerCase().includes('you said') ||
                        ariaLabel.toLowerCase().includes('you reacted')) {
                      console.log('  -> Skipping (from You)');
                      continue;
                    }

                    // Try to extract the message text from aria-label
                    // Format is usually: "Name sent message_text" or "Name said message_text"
                    const sentMatch = ariaLabel.match(/sent (.+?)(?:\.|$)/i);
                    const saidMatch = ariaLabel.match(/said (.+?)(?:\.|$)/i);

                    if (sentMatch && sentMatch[1]) {
                      preview = sentMatch[1].trim();
                      console.log('  -> Extracted from aria-label (sent):', preview);
                      break;
                    } else if (saidMatch && saidMatch[1]) {
                      preview = saidMatch[1].trim();
                      console.log('  -> Extracted from aria-label (said):', preview);
                      break;
                    }

                    // Check for media
                    const img = msg.querySelector('img[src*="scontent"]');
                    const video = msg.querySelector('video');

                    if (video) {
                      preview = 'Sent a video';
                      console.log('  -> Found video');
                      break;
                    } else if (img) {
                      preview = 'Sent a photo';
                      console.log('  -> Found photo');
                      break;
                    }

                    // Fallback: get text content from the message bubble
                    const textSpans = msg.querySelectorAll('span[dir="auto"]');
                    for (const span of textSpans) {
                      const text = span.textContent.trim();
                      if (text && text.length > 2 && text.length < 500 &&
                          !text.includes('Reacted') &&
                          !text.includes('Active') &&
                          !text.match(/^\d+[mhdw]$/)) {
                        preview = text;
                        console.log('  -> Extracted from text span:', preview);
                        break;
                      }
                    }

                    if (preview) break;
                  }

                  if (!preview) {
                    console.log('No preview found, using default');
                    preview = 'New message';
                  }
                }

                console.log('Final preview for', name, ':', preview);

                unread.push({
                  name,
                  preview: preview.slice(0, 100)
                });
              }
            }

            // Click back to the original chat if it was different
            if (currentChatName && unread.length > 0 && unread[unread.length - 1].name !== currentChatName) {
              const originalRow = Array.from(document.querySelectorAll('[role="row"], [role="listitem"]'))
                .find(r => r.textContent.includes(currentChatName));
              if (originalRow) {
                originalRow.click();
              }
            }

            return unread;
          })()
        `);

        if (unreadChats.length > 0) {
          console.log('Unread chats found:', unreadChats);
        }

        // Send notification for each unique message we haven't notified yet
        for (const chat of unreadChats) {
          const messageKey = `${chat.name}:${chat.preview}`;

          if (!notifiedMessages.has(messageKey)) {
            notifiedMessages.add(messageKey);

            const notification = new Notification({
              title: chat.name,
              body: chat.preview || 'New message',
              silent: false
            });

            notification.on('click', () => {
              if (mainWindow) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.focus();
              }
            });

            notification.show();
            console.log('Notification sent for:', chat.name, '-', chat.preview);
          }
        }

      } catch (err) {
        console.error('Error finding unread chats:', err);
      }
    } else if (count > 0) {
      // Count didn't increase, just reset the zero streak
      zeroCountStreak = 0;
    }

    // Track zero count streak for debounced reset
    if (count === 0) {
      zeroCountStreak++;
      if (zeroCountStreak >= RESET_THRESHOLD) {
        console.log('All messages read (sustained), resetting');
        notifiedMessages.clear();
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

