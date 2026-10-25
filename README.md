# Echoes — AI Conversation Vault

A local-first archive MVP for importing, searching, reading, and exporting AI conversations. It runs in a browser or inside the included Tauri 2 desktop shell. The archive is stored in IndexedDB on the current device; the app does not connect to provider accounts or upload conversation content.

## Install the desktop app

The latest test installers are produced by [GitHub Actions](https://github.com/jasethepeople/ai-chat-archive/actions/workflows/build-installers.yml). Open the newest successful **Build desktop installers** run and download the artifact matching your operating system from the run summary. Artifacts are retained for 14 days; this project does not yet publish versioned GitHub Releases, so download the installer promptly.

### Windows

Download the Windows artifact, then run either the `.msi` installer or the `-setup.exe` installer and follow its prompts. Windows 10 version 1803 and newer, and Windows 11, include the Microsoft Edge WebView2 Runtime used by the app. These CI builds are unsigned, so Windows SmartScreen may show a warning. Only continue if you trust the source and expect this warning for an unsigned test build.

### macOS

Download the macOS universal `.dmg`, open it, and drag **Echoes** into **Applications**. The build supports both Apple Silicon and Intel Macs. The current CI build is not signed or notarized, so macOS Gatekeeper may block it or display an unidentified-developer warning. Do not bypass that warning unless you trust this build; signed and notarized distribution is not configured yet.

### Linux

Download the Linux artifact and choose the package for your distribution:

- Debian or Ubuntu: install the `.deb` file, for example with `sudo apt install ./<downloaded-file>.deb`.
- Fedora or another RPM-based distribution: install the `.rpm` file with `sudo dnf install ./<downloaded-file>.rpm`.
- AppImage: make it executable with `chmod +x <downloaded-file>.AppImage`, then launch it with `./<downloaded-file>.AppImage`.

The app requires a compatible WebKitGTK 4.1 runtime on Linux. If a package manager reports missing dependencies, install the requested packages or try the distribution-native `.deb`/`.rpm` package.

### Before importing conversations

Echoes keeps its archive in local app/browser storage and does not sync it to an account or cloud. Use **Backup** or **Export archive** regularly and store the JSON backup somewhere safe. Clearing app data or removing the application can put local conversations at risk. Automatic sync and encrypted backups are not implemented yet.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL in a modern browser. Build a static production bundle with `npm run build`.

Run the importer regression tests with `npm test`.

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
- Optional account labels on provider-export imports, with account-aware IDs so same-provider conversations from different accounts remain separate.
- Local IndexedDB storage, stable provider/source/account IDs, and repeat-import upserts.
- Search across titles, providers, account labels, and message text; filter by provider or account.
- Conversation reader and per-conversation Markdown export; full archive JSON backup/export.
- Echoes JSON backups can be re-imported while retaining original IDs, providers, account labels, metadata, and messages.
- Delete a conversation from the local archive.
- ZIP entry count/size checks, CRC validation, path traversal guard, and no extraction to disk.

## Important limitations

The Tauri shell is scaffolded but has not been compiled in this environment because Rust and native WebView build prerequisites are not installed. Data is stored per app/browser profile and device; clearing its site data can remove the archive. Export backups regularly. The ZIP parser is defensive but imports are still untrusted input; avoid unusually large archives. Attachments and message branching are not yet rendered or preserved as full binary files. Claude/Gemini parsing varies by export version and should be validated against sanitized real exports before relying on it. Automatic sync, encrypted backups, migrations, and formal FTS5 search are not implemented yet.

## Development

- UI: React + TypeScript + Vite
- Local storage: Dexie / IndexedDB
- ZIP support: JSZip
- Source data stays on-device in normal app operation
