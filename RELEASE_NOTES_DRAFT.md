# Echoes release notes — draft

**Status:** Draft; not published or tagged.  
**Version:** Confirm before release. Tauri bundle configuration says `0.1.0`, while `package.json` still says `0.0.0`.

## Highlights

- Added optional account labels for provider exports. Labels are included in archive identity and can be used to keep conversations from separate accounts with the same provider ID apart. Reuse a label when importing updates from the same account; labels are user-entered and do not connect to or verify provider accounts.
- Added round-trip support for Echoes JSON backups. Import recognizes the Echoes backup envelope and preserves saved conversation IDs, providers, account labels, messages, and metadata. Re-import updates matching records. Backup import merges into the current archive; it does not remove records absent from the backup, and a typed label does not override labels saved in the backup.
- Improved imports for ChatGPT mapping exports and Gemini Takeout-style `entries` records. Gemini `model` messages normalize to assistant messages. DeepSeek-shaped JSON is covered through the generic importer and is currently categorized as `Other`.

## Importer reliability fixes

- Replaced position-only fallback IDs for conversations without provider IDs with deterministic content fingerprints. Different no-ID conversations from separate imports no longer collide just because they occupy the same array position. Re-importing unchanged content remains deduplicated. Without a provider ID, changed content may produce a new record and identical content may resolve to the same ID.
- Hardened malformed export handling so invalid records, JSON files, and ZIP entries produce warnings without discarding valid sibling conversations or preventing later files from being processed.
- Added regression coverage for atomic IndexedDB batch saves: when a transaction fails after an earlier write, the batch rolls back and import counters reset.
- Defined behavior for repeated explicit source IDs in a single export: the later record updates the existing stored ID rather than creating a second record.

## Tests and verification

The suite contains **9 passing tests across 2 files**. It covers account-aware identity, missing and duplicate IDs, malformed input recovery, transaction rollback, Echoes backup restoration and repeat import, and a provider integration test that routes representative ZIP exports through the same `importFiles` code used by the UI.

The integration fixtures cover ChatGPT's mapping structure, a Gemini Takeout-style `conversations`/`entries` file, and a DeepSeek-style JSON conversation array. Fixture text and IDs are invented and sanitized; they are representative format samples, not byte-for-byte copies of a user's export. Provider exports can vary, especially Gemini Takeout output.

The latest production frontend build and the cross-platform installer workflow completed successfully. [View the successful GitHub Actions run](https://github.com/jasethepeople/ai-chat-archive/actions/runs/40190063451).

## Desktop installer artifacts

The workflow now checks for expected formats before upload and fails the platform job if any required bundle is missing:

- **Windows x64:** MSI and NSIS setup EXE.
- **macOS universal:** DMG and `.app` bundle, built for Apple Silicon and Intel.
- **Linux x64:** DEB, RPM, and AppImage.

The workflow runs on pushes and manual dispatches. Successful bundles are uploaded as platform-specific Actions artifacts with 14-day retention. It does not create a GitHub Release or perform a production deployment.

## Maintainer checks before publishing

- Resolve the version mismatch (`package.json` `0.0.0` versus Tauri `0.1.0`) and choose a release tag; the repository currently has no release tag.
- Windows installers are unsigned, and macOS is not signed or notarized. Add signing/notarization credentials and configure the release pipeline before broad public distribution; users may otherwise see SmartScreen or Gatekeeper warnings.
- Confirm that the synthetic provider fixtures match the export variants the release intends to claim support for. They do not guarantee compatibility with every provider export version.
