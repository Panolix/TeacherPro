# Release Notes — TeacherPro v1.3.0

### Version 1.3.0 (April 15, 2026)

This release is a significant upgrade to the AI assistant experience and cross-platform reliability of the Ollama backend.

## Highlights

### AI Chat — fully conversational
The Lesson AI Chat has been redesigned from the ground up. It now reads your full lesson plan — including teacher name, subject, and planned date — and responds conversationally. It can summarize your lesson, identify key themes, review learning objectives, and suggest improvements or activity ideas without ever asking you to paste anything in.

Quick-action chips appear when the chat is empty so you can get useful answers with one click. A clear button in the chat header lets you reset the conversation at any time.

Chat responses now render properly formatted text — headings, bullet and numbered lists, bold, italic, and inline code are all handled correctly.

### AI Rewrite — tone and language submenus
Right-clicking selected text now opens expandable submenus for rewrite and translate. Six rewrite tones are available: Improve, More Formal, More Casual, Simpler, More Engaging, and More Concise. The translate submenu lists 12 common languages, with your configured target language pinned at the top.

Rewrites are now also permitted inside table cells and list items, not just plain paragraphs.

### Ollama lifecycle — reliable startup and shutdown
The Ollama server now shuts down cleanly when the app quits on all platforms and via all quit paths (including macOS Cmd+Q). The app tracks the child process it spawned and uses a platform-appropriate fallback (`pkill` on macOS/Linux, `taskkill` on Windows) to catch any forked subprocesses. The app only attempts shutdown if it was the one that started Ollama.

## What's New

**Added**
- AI rewrite context menu with six tone options (Improve, More Formal, More Casual, Simpler, More Engaging, More Concise)
- AI translate context menu with a 12-language picker; configured target language pinned at top with ★
- Five quick-action chips in empty chat state (Summarize, Key themes, Check learning objectives, Suggest improvements, Activity ideas)
- Clear chat button in the chat header

**Changed**
- AI rewrite and translate now work inside table cells and list items
- AI rewrite uses a dedicated per-tone system prompt with explicit instructions to change wording
- Lesson AI Chat is now purely conversational — automatic in-place REPLACE:N editing removed
- Chat includes teacher name, subject, and planned date metadata in every message
- Chat system prompt covers summarization, themes, recommendations, and pedagogy; never asks to paste content
- Chat response renderer rewritten to handle headings, bullet/numbered lists, bold, italic, and inline code
- Chat panel layout redesigned: full-width AI responses (no bubble), compact right-aligned user messages, cleaner header

**Fixed**
- Ollama server now shuts down reliably on app quit across macOS, Linux, and Windows
- `pkill`/`taskkill` fallback catches forked Ollama subprocesses that outlive the tracked child PID
- App only shuts down Ollama if it was the process that started it
