// Preload script to disable service workers and Facebook's own notifications
// We handle notifications ourselves in main.js

const { ipcRenderer } = require('electron');

// Completely disable service workers
delete navigator.serviceWorker;

Object.defineProperty(navigator, 'serviceWorker', {
  get: () => undefined,
  configurable: false
});

// Block Facebook's own notifications - we handle them in main.js
window.Notification = class {
  constructor(title, options) {
    // Do nothing - we don't want Facebook's notifications
    console.log('Facebook notification blocked:', title);
  }

  static get permission() { return 'denied'; }
  static requestPermission() { return Promise.resolve('denied'); }
};

console.log('Preload: Facebook notifications blocked, using native notifications from main process');

