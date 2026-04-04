# Audio Book App

A simplified React Native application for reading and listening to TXT books, built with Expo.

## Features

1. **Local Text Reading**: 
   - Import TXT files from device.
   - Automatic chapter detection (supporting "第X章", "Chapter X").
   - Fallback to length-based splitting if no chapters found.

2. **Reading Experience**:
   - Scrollable text view.
   - Adjustable font size.
   - Dark/Light mode toggle.
   - Chapter navigation (Previous/Next, Chapter List).
   - Reading progress is automatically saved.

3. **Text-to-Speech (TTS)**:
   - Built-in TTS using `expo-speech`.
   - Play/Pause control.

4. **Book Management**:
   - Bookshelf with book covers (generated/placeholder) and progress.
   - Delete books.

5. **Settings**:
   - Global settings for appearance and reading preferences.

## Tech Stack

- **Framework**: React Native + Expo
- **Navigation**: React Navigation (Stack)
- **Storage**: AsyncStorage + Expo FileSystem
- **UI**: StyleSheet + React Native Vector Icons
- **TTS**: Expo Speech

## Installation & Running

1. **Prerequisites**:
   - Node.js and npm/yarn.
   - Expo Go app on your mobile device (or Android/iOS Simulator).

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start the App**:
   ```bash
   npx expo start
   ```

4. **Run on Device**:
   - Scan the QR code with Expo Go (Android) or Camera (iOS).
   - Press `a` for Android Emulator, `i` for iOS Simulator.

## Project Structure

```
src/
├── components/     # Reusable UI components
├── screens/        # Screen components (Bookshelf, Reader, etc.)
├── services/       # Business logic (BookService, ChapterService)
├── utils/          # Helpers and constants
├── navigation/     # Navigation configuration
├── hooks/          # Custom hooks (useSettings, useSpeech)
└── types.ts        # TypeScript definitions
```

## Usage Guide

1. **Importing Books**:
   - On the Bookshelf screen, tap the "+" button or "Upload Book".
   - Select a `.txt` file from your device.
   - The app will parse chapters automatically.

2. **Reading**:
   - Tap a book cover to open the Reader.
   - Tap the center of the screen to toggle the menu.
   - Use the bottom menu to change font size, theme, or start TTS.
   - Use the top menu to view the chapter list.

3. **TTS**:
   - Tap the "Read" button in the Reader menu to start listening.
   - Tap "Pause" to stop.

## Notes

- This is a simplified version and supports `.txt` files primarily.
- Large files are handled by splitting into chapters, but extremely large files might take a moment to process.
