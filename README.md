# Gemini Translator & Flashcards Extension

A lightweight, powerful Google Chrome extension for in-page instant translation and flashcard learning powered by the **Google Gemini API** (including **Gemini 3.5 Flash Lite** & **Gemini 3.5 Flash**).

## ✨ Features

- **⚡ Instant In-Page Translation**: Select any text on any webpage to trigger instant translation into Vietnamese or English.
- **🤖 Multi-Model Support**:
  - **Auto**: Automatically chooses fast Lite model for short words/phrases and Flash for longer paragraphs.
  - **Gemini 3.5 Flash**: High quality translation for complex sentences.
  - **Gemini 3.5 Flash Lite**: Ultra-fast and lightweight responses.
  - **Gemini 3.0 Flash**: Legacy model fallback support.
- **🛡️ Secure Multi-API Key Management**:
  - Enter one or multiple Gemini API keys directly via the extension settings.
  - Automatic key rotation and smart fallback on rate limits (429 / 503).
  - Built-in connection testing tool.
  - Zero API keys in source code — safe for Git and public repos!
- **📚 Dictionary & Flashcards**:
  - Automatically captures phonetic transcriptions (IPA/Romaji), parts of speech, synonyms, and example sentences.
  - Built-in popup flashcard reviewer with memory retention tracking.
- **🔊 Text-to-Speech (TTS)**: In-page audio pronunciation for vocabulary.

## 🚀 Installation & Setup

1. Clone or download this repository.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** (Tải tiện ích đã giải nén) and select this project folder (`translate-app`).
5. Click on the extension icon in Chrome toolbar -> Click the **⚙️ Settings icon**.
6. Obtain free Gemini API key(s) from [Google AI Studio](https://aistudio.google.com/app/apikey), paste them into the settings box (one key per line), and click **💾 Lưu cấu hình** (Save).
7. Optionally click **⚡ Kiểm tra kết nối** (Test Connection) to verify your keys.

## 🛠️ Tech Stack

- **Manifest V3** Chrome Extension
- **Vanilla JavaScript & CSS**
- **Google Gemini REST API** (`gemini-3.5-flash-lite`, `gemini-3.5-flash`, etc.)
