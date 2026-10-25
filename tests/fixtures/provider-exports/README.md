# Provider export integration fixtures

These small fixtures contain invented conversation text and identifiers; they contain no user data. Their layouts are sanitized, representative examples used to exercise the import pipeline, not byte-for-byte copies of a personal export.

- `chatgpt-conversations.json` uses the ChatGPT `conversations.json` mapping structure with message nodes, `author.role`, `content.parts`, timestamps, and parent/child links. The structure is illustrated in public parsing discussion: https://community.openai.com/t/decoding-exported-data-by-parsing-conversations-json-and-or-chat-html/403144
- `gemini-conversations.json` uses a Google Takeout-style `conversations` array with `entries` and the `model` role. The example shape and the variability caveat are discussed in a public Gemini Takeout importer issue: https://github.com/nearai/ironclaw/issues/152. It is not an official Google schema specification.
- `deepseek-conversations.json` uses the documented simplified DeepSeek export example: conversation records with IDs, timestamps, model, and role/content messages: https://ai-chat-importer.com/blog/how-to-export-deepseek-conversations

The integration test packages these files into representative ZIP layouts and invokes the same `importFiles` path used by the UI. Real provider exports can vary; validate against a user's own export before treating any fixture as exhaustive.
