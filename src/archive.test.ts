import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, importFiles, type Conversation } from './archive';

const providerFile = (name = 'chatgpt-export.json') => new File([
  JSON.stringify({ conversations: [{ id: 'shared-source-id', title: 'A conversation', messages: [{ id: 'm1', role: 'user', content: 'Hello' }] }] }),
], name, { type: 'application/json' });

beforeEach(async () => {
  await db.conversations.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('account-aware import identity', () => {
  it('keeps same-provider conversations separate when account labels differ', async () => {
    const personal = await importFiles([providerFile()], { accountLabel: 'Personal' });
    const work = await importFiles([providerFile()], { accountLabel: 'Work' });

    expect(personal.imported).toBe(1);
    expect(work.imported).toBe(1);
    const rows = await db.conversations.toArray();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(row => row.id)).size).toBe(2);
    expect(rows.map(row => row.accountLabel).sort()).toEqual(['Personal', 'Work']);
    expect(rows.every(row => row.platform === 'chatgpt')).toBe(true);
  });

  it('updates a repeat import for the same account instead of duplicating it', async () => {
    await importFiles([providerFile()], { accountLabel: 'Personal' });
    const again = await importFiles([providerFile()], { accountLabel: 'Personal' });

    expect(again.imported).toBe(0);
    expect(again.updated).toBe(1);
    expect(await db.conversations.count()).toBe(1);
  });
});

describe('source ID edge cases', () => {
  it('derives stable, distinct IDs for separate imports without source IDs', async () => {
    const first = new File([JSON.stringify({ conversations: [{ title: 'First export', messages: [{ role: 'user', content: 'First content' }] }] })], 'chatgpt-first.json', { type: 'application/json' });
    const second = new File([JSON.stringify({ conversations: [{ title: 'Second export', messages: [{ role: 'user', content: 'Second content' }] }] })], 'chatgpt-second.json', { type: 'application/json' });

    const summary = await importFiles([first, second], { accountLabel: 'Personal' });
    const rows = await db.conversations.toArray();

    expect(summary).toMatchObject({ imported: 2, updated: 0, skipped: 0 });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(row => row.sourceId)).size).toBe(2);
    expect(rows.every(row => row.sourceId.startsWith('import-'))).toBe(true);
    expect(rows.map(row => row.title).sort()).toEqual(['First export', 'Second export']);

    const repeat = await importFiles([first, second], { accountLabel: 'Personal' });
    expect(repeat).toMatchObject({ imported: 0, updated: 2, skipped: 0 });
    expect(await db.conversations.count()).toBe(2);
  });

  it('updates one record when an export repeats an explicit source ID', async () => {
    const duplicateIds = new File([JSON.stringify({ conversations: [
      { id: 'reused-id', title: 'Older copy', messages: [{ role: 'assistant', content: 'Old text' }] },
      { id: 'reused-id', title: 'Newer copy', messages: [{ role: 'assistant', content: 'New text' }] },
    ] })], 'chatgpt-duplicate-ids.json', { type: 'application/json' });

    const summary = await importFiles([duplicateIds]);
    const rows = await db.conversations.toArray();

    expect(summary).toMatchObject({ imported: 1, updated: 1, skipped: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceId: 'reused-id', title: 'Newer copy' });
    expect(rows[0].messages[0].content).toBe('New text');
  });
});

describe('generic provider export formats', () => {
  it('parses a DeepSeek-style history export with custom conversation and turn fields', async () => {
    const deepseekExport = new File([JSON.stringify({
      history: [{
        chat_id: 'deepseek-chat-42',
        name: 'Planning with DeepSeek',
        create_time: 1735689600,
        update_time: 1735693200,
        turns: [
          { uuid: 'turn-user', sender: 'user', text: 'Help me plan a launch.', timestamp: 1735689600 },
          { uuid: 'turn-assistant', author: { role: 'assistant' }, message: { content: [{ text: 'Start with a clear launch checklist.' }] }, timestamp: 1735693200 },
        ],
      }],
    })], 'deepseek-history-export.json', { type: 'application/json' });

    const summary = await importFiles([deepseekExport], { accountLabel: 'Personal DeepSeek' });
    const [conversation] = await db.conversations.toArray();

    expect(summary).toMatchObject({ imported: 1, updated: 0, skipped: 0, warnings: [] });
    expect(conversation).toMatchObject({
      id: 'account:other:Personal%20DeepSeek:deepseek-chat-42',
      platform: 'other',
      sourceId: 'deepseek-chat-42',
      accountLabel: 'Personal DeepSeek',
      title: 'Planning with DeepSeek',
      messages: [
        { id: 'turn-user', role: 'user', content: 'Help me plan a launch.' },
        { id: 'turn-assistant', role: 'assistant', content: 'Start with a clear launch checklist.' },
      ],
    });
    expect(conversation.messages[0].createdAt).toBe('2025-01-01T00:00:00.000Z');
  });
});

describe('malformed export handling', () => {
  it('skips a malformed record, retains valid siblings, and continues after invalid JSON files', async () => {
    const mixedExport = new File([JSON.stringify({ conversations: [
      { id: 'valid-before', title: 'Before', messages: [{ role: 'user', content: 'Keep this one.' }] },
      { id: 'broken-record', title: 'Broken', messages: [null] },
      { id: 'valid-after', title: 'After', create_time: 1e300, messages: [{ role: 'assistant', content: 'Keep this too.' }] },
    ] })], 'chatgpt-export.json', { type: 'application/json' });
    const invalidJson = new File(['{not valid JSON'], 'broken-export.json', { type: 'application/json' });

    const summary = await importFiles([mixedExport, invalidJson]);
    const rows = await db.conversations.toArray();

    expect(summary.imported).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(rows.map(row => row.sourceId).sort()).toEqual(['valid-after', 'valid-before']);
    expect(rows.find(row => row.sourceId === 'valid-after')?.createdAt).toBeNull();
    expect(summary.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('skipped unsupported or empty conversation 2'),
      expect.stringContaining('invalid JSON'),
    ]));
  });
});

describe('IndexedDB batch rollback', () => {
  it('rolls back earlier writes and resets counts when a later transaction read fails', async () => {
    const batch = new File([JSON.stringify({ conversations: [
      { id: 'first', title: 'First', messages: [{ role: 'user', content: 'This write should roll back.' }] },
      { id: 'second', title: 'Second', messages: [{ role: 'user', content: 'This read will fail.' }] },
    ] })], 'chatgpt-batch.json', { type: 'application/json' });
    const originalGet = db.conversations.get.bind(db.conversations);
    vi.spyOn(db.conversations, 'get').mockImplementation((async (id: string) => {
      if (id === 'chatgpt:second') throw new Error('simulated IndexedDB read failure');
      return originalGet(id);
    }) as any);

    const summary = await importFiles([batch]);

    expect(summary).toMatchObject({ imported: 0, updated: 0, skipped: 1 });
    expect(summary.warnings.join(' ')).toContain('Could not save imported conversations to the local archive');
    expect(summary.warnings.join(' ')).toContain('simulated IndexedDB read failure');
    expect(await db.conversations.count()).toBe(0);
  });
});

describe('Echoes backup restoration', () => {
  it('preserves original ids, provider, account label, metadata, and messages and is safe to reimport', async () => {
    const original: Conversation = {
      id: 'custom-preserved-id',
      platform: 'claude',
      sourceId: 'original-source-id',
      accountLabel: 'Client account',
      title: 'Saved chat',
      createdAt: '2025-01-02T03:04:05.000Z',
      updatedAt: '2025-01-03T03:04:05.000Z',
      messages: [{ id: 'message-1', role: 'assistant', content: 'Saved text', createdAt: '2025-01-02T03:05:00.000Z', metadata: { channel: 'final' } }],
      metadata: { sourceFormat: 'fixture' },
      importedAt: '2025-01-04T03:04:05.000Z',
    };
    const backup = new File([JSON.stringify({ format: 'conversation-vault', version: 1, conversations: [original] })], 'conversation-vault-backup.json', { type: 'application/json' });

    const first = await importFiles([backup], { accountLabel: 'Wrong override' });
    expect(first.imported).toBe(1);
    expect(first.warnings[0]).toContain('labels saved in the Echoes backup were preserved');
    expect(await db.conversations.get(original.id)).toEqual(original);

    const second = await importFiles([backup]);
    expect(second.imported).toBe(0);
    expect(second.updated).toBe(1);
    expect(await db.conversations.count()).toBe(1);
    expect(await db.conversations.get(original.id)).toEqual(original);
  });
});
