import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { db, importFiles } from './archive';

const fixture = (name: string) => readFile(new URL(`../tests/fixtures/provider-exports/${name}`, import.meta.url), 'utf8');

async function exportZip(name: string, entries: Record<string, string>): Promise<File> {
  const zip = new JSZip();
  for (const [path, contents] of Object.entries(entries)) zip.file(path, contents);
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], name, { type: 'application/zip' });
}

beforeEach(async () => {
  await db.conversations.clear();
});

describe('provider export integration', () => {
  it('imports representative ChatGPT, Gemini Takeout, and DeepSeek ZIP exports end to end', async () => {
    const [chatgptJson, geminiJson, deepseekJson] = await Promise.all([
      fixture('chatgpt-conversations.json'),
      fixture('gemini-conversations.json'),
      fixture('deepseek-conversations.json'),
    ]);
    const exports = [
      await exportZip('chatgpt-data-export.zip', {
        'conversations.json': chatgptJson,
        'user.json': JSON.stringify({ id: 'sanitized-fixture-user' }),
      }),
      await exportZip('takeout-gemini.zip', {
        'Takeout/Gemini Apps/conversations.json': geminiJson,
      }),
      await exportZip('deepseek-data-export.zip', {
        'export/deepseek-conversations.json': deepseekJson,
      }),
    ];

    const summary = await importFiles(exports);
    const rows = await db.conversations.toArray();
    const chatgpt = rows.find(row => row.platform === 'chatgpt');
    const gemini = rows.find(row => row.platform === 'gemini');
    const deepseek = rows.find(row => row.sourceId === 'deepseek-fixture-conversation-001');

    expect(summary).toMatchObject({ imported: 3, updated: 0, skipped: 0, warnings: [] });
    expect(rows).toHaveLength(3);
    expect(chatgpt).toMatchObject({
      id: 'chatgpt:chatgpt-fixture-conversation-001',
      title: 'Kyoto weekend itinerary',
      metadata: { sourceFormat: 'chatgpt-mapping' },
      messages: [
        { id: 'chatgpt-message-user-001', role: 'user', content: 'Plan a two-day trip to Kyoto.' },
        { id: 'chatgpt-message-assistant-001', role: 'assistant', content: 'Start with an early visit to Fushimi Inari, then explore Higashiyama.' },
      ],
    });
    expect(gemini).toMatchObject({
      id: 'gemini:gemini-fixture-conversation-001',
      title: 'Plan a Kyoto weekend',
      messages: [
        { role: 'user', content: 'Suggest a relaxed two-day Kyoto itinerary.' },
        { role: 'assistant', content: 'Spend one day around Higashiyama and another near Arashiyama.' },
      ],
    });
    expect(deepseek).toMatchObject({
      id: 'other:deepseek-fixture-conversation-001',
      platform: 'other',
      title: 'Debugging an async Python function',
      messages: [
        { role: 'user', content: 'Why is my async function not awaiting correctly?' },
        { role: 'assistant', content: 'Check that the coroutine is awaited and that the caller is itself running in an event loop.' },
      ],
    });

    const repeat = await importFiles(exports);
    expect(repeat).toMatchObject({ imported: 0, updated: 3, skipped: 0 });
    expect(await db.conversations.count()).toBe(3);
  });
});
