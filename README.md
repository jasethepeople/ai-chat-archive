# Echoes — AI Conversation Vault

A local-first archive MVP for importing, searching, reading, and exporting AI conversations. It runs in a browser or inside the included Tauri 2 desktop shell. The archive is stored in IndexedDB on the current device; the app does not connect to provider accounts or upload conversation content.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL in a modern browser. Build a static production bundle with `npm run build`.

## Desktop app (Tauri 2)

Install the Rust toolchain and the operating-system prerequisites in the [Tauri v2 prerequisites guide](https://v2.tauri.app/start/prerequisites/), then run:

```bash
npm install
npm run desktop:dev
```

Create a release bundle for the current operating system with `npm run desktop:build`. Tauri packages are platform-specific; build on each target OS or configure the appropriate cross-compilation environment. The generated shell is configured with a restrictive WebView content security policy and no provider credentials or network sync.

## GitHub Actions builds

The workflow in `.github/workflows/build-installers.yml` runs on every push and can also be started manually from the repository's Actions tab. It builds Windows x64, a universal macOS app, and Linux x64 in parallel, then uploads each platform's bundle as a separate Actions artifact for 14 days. No signing secrets or GitHub release are required for these build artifacts. Download them from the completed workflow run's **Artifacts** section. Public distribution should add Windows and macOS code signing; unsigned macOS builds can trigger Gatekeeper warnings.

## MVP features

- Import JSON and ZIP exports; ChatGPT's `conversations.json` mapping format is handled along with generic JSON arrays/objects containing `conversations`, `chats`, `threads`, `history`, or message arrays.
- Local IndexedDB storage, stable provider/source IDs, and repeat-import upserts.
- Search across titles, providers, and message text; filter by provider.
- Conversation reader and per-conversation Markdown export; full archive JSON backup/export.
- Delete a conversation from the local archive.
- ZIP entry count/size checks, CRC validation, path traversal guard, and no extraction to disk.

## Important limitations

The Tauri shell is scaffolded but has not been compiled in this environment because Rust and native WebView build prerequisites are not installed. Data is stored per app/browser profile and device; clearing its site data can remove the archive. Export backups regularly. The ZIP parser is defensive but imports are still untrusted input; avoid unusually large archives. Attachments and message branching are not yet rendered or preserved as full binary files. Claude/Gemini parsing varies by export version and should be validated against sanitized real exports before relying on it. Automatic sync, encrypted backups, migrations, and formal FTS5 search are not implemented yet.

## Development

- UI: React + TypeScript + Vite
- Local storage: Dexie / IndexedDB
- ZIP support: JSZip
- Source data stays on-device in normal app operation
