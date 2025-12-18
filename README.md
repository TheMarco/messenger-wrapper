# Facebook Messenger Desktop Wrapper

A clean, minimal desktop wrapper for Facebook Messenger built with Electron. This should alleviate the pain of Meta disabling the Mac Desktop Messenger app.

## Features

- 🎯 **Messenger-only** - Top navigation bar removed for distraction-free messaging
- 🔐 **Uses your browser credentials** - Persistent session maintains your login
- 🖥️ **Native desktop app** - Runs as a standalone application

## Binaries

[Apple Silicon (M1,M2,M3,M4,M5)](https://drive.google.com/file/d/1oBiIs-i2nScI66lx7MjhQOJq3LU65vyB/view?usp=sharing)

[Older Intel Macs](https://drive.google.com/file/d/1Ias4HFwPXJOpkhXpkRMC78PDcblK6wGL/view?usp=sharing)

[Windows Installer 64bit and 32bit](https://drive.google.com/file/d/1hgzuZG1bPiwnyswfMdMxtiR2kcif96lv/view?usp=sharing)

## Installation from this source tree

```bash
npm install
```

## Usage

To run the application:

```bash
npm start
```

## Building

To build the application for distribution:

```bash
npm run build
```

This will create distributable packages for your platform in the `dist` folder.

## How it works

- Uses Electron to wrap the Facebook Messenger web interface
- Injects custom CSS to hide the top navigation bar
- Maintains a persistent session so you stay logged in
- Restricts navigation to keep you within the Messenger interface
