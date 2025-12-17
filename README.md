# Facebook Messenger Desktop Wrapper

A clean, minimal desktop wrapper for Facebook Messenger built with Electron.

## Features

- 🌙 **Dark mode** - Forced dark theme for comfortable viewing
- 🎯 **Messenger-only** - Top navigation bar removed for distraction-free messaging
- 🔐 **Uses your browser credentials** - Persistent session maintains your login
- 🖥️ **Native desktop app** - Runs as a standalone application

## Installation

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
- Injects custom CSS to enable dark mode and hide the top navigation bar
- Maintains a persistent session so you stay logged in
- Restricts navigation to keep you within the Messenger interface
