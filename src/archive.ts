import Dexie, { type Table } from 'dexie';
import JSZip from 'jszip';

export type Platform = 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'grok' | 'copilot' | 'other';
export interface Message { id: string; role: string; content: string; createdAt: string | null; metadata?: Record<string, unknown> }
export interface Conversation { id: string; platform: Platform; sourceId: string; accountLabel?: string | null; title: string; createdAt: string | null; updatedAt: string | null; messages: Message[]; metadata?: Record<string, unknown>; importedAt: string }

class VaultDB extends Dexie {
  conversations!: Table<Conversation, string>;
  constructor() {
    super('conversation-vault');
    this.version(1).stores({ conversations: '&id, platform, sourceId, updatedAt' });
  }
}
export const db = new VaultDB();

const str = (v: unknown) => typeof v === 'string' ? v : '';
const iso = (v: unknown): string | null => {
  if (typeof v === 'string' && v) return v;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const date = new Date(v * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
};
const textOf = (v: any): string => {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join('\n');
  if (v && typeof v === 'object') {
    if (typeof v.text === 'string') return v.text;
    if (Array.isArray(v.parts)) return v.parts.map(textOf).filter(Boolean).join('\n');
    if (v.content && typeof v.content === 'object') return textOf(v.content);
  }
  return '';
};
const platformFrom = (name: string): Platform => {
  const s = name.toLowerCase();
  return (['chatgpt','claude','gemini','perplexity','grok','copilot'] as Platform[]).find(p => s.includes(p)) ?? 'other';
};
const makeId = (platform: string, source: string, accountLabel?: string | null) => accountLabel
  ? `account:${encodeURIComponent(platform)}:${encodeURIComponent(accountLabel)}:${encodeURIComponent(source)}`
  : `${platform}:${source}`;

function stableSerialize(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
}
function fallbackSourceId(raw: any): string {
  const input = stableSerialize(raw);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + i), 0x01000193);
  }
  const fingerprint = `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
  return `import-${fingerprint}`;
}

function parseConversation(raw: any, platform: Platform, accountLabel?: string | null): Conversation | null {
  if (!raw || typeof raw !== 'object') return null;
  const sourceId = str(raw.id || raw.conversation_id || raw.uuid || raw.chat_id) || fallbackSourceId(raw);
  const title = str(raw.title || raw.name || raw.subject || 'Untitled conversation') || 'Untitled conversation';
  const messages: Message[] = [];
  if (raw.mapping && typeof raw.mapping === 'object' && !Array.isArray(raw.mapping)) {
    const nodes = Object.entries(raw.mapping as Record<string, any>).map(([key, node]) => ({ key, node: node?.message })).filter(x => x.node && x.node.message);
    nodes.sort((a,b) => (Number(a.node.create_time)||0) - (Number(b.node.create_time)||0));
    for (const {key,node} of nodes) {
      const content = textOf(node.message?.content);
      if (!content && !node.message?.recipient) continue;
      messages.push({ id: str(node.id) || key, role: str(node.author?.role) || 'unknown', content, createdAt: iso(node.create_time), metadata: { recipient: node.recipient, channel: node.metadata?.channel, status: node.status } });
    }
  } else {
    const source = raw.messages || raw.chat_messages || raw.turns || raw.items || [];
    if (Array.isArray(source)) source.forEach((m: any, i: number) => {
      if (!m || typeof m !== 'object' || Array.isArray(m)) return;
      const content = textOf(m.content ?? m.text ?? m.message ?? m);
      if (content || m.role || m.author) messages.push({ id: str(m.id || m.uuid) || `${sourceId}-${i}`, role: str(m.role || m.author?.role || m.sender || 'unknown'), content, createdAt: iso(m.created_at || m.create_time || m.timestamp), metadata: m.metadata && typeof m.metadata === 'object' && !Array.isArray(m.metadata) ? m.metadata : undefined });
    });
  }
  if (!messages.length) return null;
  const createdAt = iso(raw.create_time || raw.created_at || raw.createdAt);
  const updatedAt = iso(raw.update_time || raw.updated_at || raw.updatedAt) || createdAt;
  const normalizedAccount = accountLabel?.trim() || null;
  return { id: makeId(platform, sourceId, normalizedAccount), platform, sourceId, accountLabel: normalizedAccount, title, createdAt, updatedAt, messages, metadata: { sourceFormat: raw.mapping ? 'chatgpt-mapping' : 'generic-json' }, importedAt: new Date().toISOString() };
}

function extractConversations(json: any): any[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  for (const key of ['conversations','chats','threads','history']) if (Array.isArray(json[key])) return json[key];
  if (json.mapping || json.messages || json.chat_messages || json.turns) return [json];
  return [];
}
const validPlatforms: Platform[] = ['chatgpt','claude','gemini','perplexity','grok','copilot','other'];
function parseBackupConversation(raw: any): Conversation | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.sourceId !== 'string' || !Array.isArray(raw.messages)) return null;
  if (!validPlatforms.includes(raw.platform)) return null;
  const messages: Message[] = raw.messages.map((m: any, i: number) => ({
    id: str(m?.id) || `${raw.sourceId}-${i}`,
    role: str(m?.role) || 'unknown',
    content: str(m?.content),
    createdAt: typeof m?.createdAt === 'string' ? m.createdAt : null,
    metadata: m?.metadata && typeof m.metadata === 'object' && !Array.isArray(m.metadata) ? m.metadata : undefined,
  }));
  return {
    id: raw.id,
    platform: raw.platform,
    sourceId: raw.sourceId,
    accountLabel: typeof raw.accountLabel === 'string' && raw.accountLabel.trim() ? raw.accountLabel : null,
    title: str(raw.title) || 'Untitled conversation',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    messages,
    metadata: raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata) ? raw.metadata : undefined,
    importedAt: str(raw.importedAt) || new Date().toISOString(),
  };
}
export interface ImportSummary { imported: number; updated: number; skipped: number; warnings: string[] }
export interface ImportOptions { accountLabel?: string | null }
const errorText = (error: unknown) => error instanceof Error && error.message ? error.message : 'unknown error';
export async function importFiles(files: File[], options: ImportOptions = {}): Promise<ImportSummary> {
  const parsed: Conversation[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  const accountLabel = typeof options.accountLabel === 'string' ? options.accountLabel.trim() || null : null;
  for (const file of files) {
    try {
      let candidates: {name:string; text:string}[] = [];
      if (file.name.toLowerCase().endsWith('.zip')) {
        if (file.size > 250 * 1024 * 1024) throw new Error('ZIP exceeds the 250 MB safety limit.');
        const zip = await JSZip.loadAsync(file, { checkCRC32: true });
        const entries = Object.values(zip.files).filter(f => !f.dir && !f.name.startsWith('__MACOSX/') && /\.json$/i.test(f.name));
        if (entries.length > 1000) throw new Error('ZIP contains too many JSON files.');
        if (!entries.length) { warnings.push(`${file.name}: ZIP contains no JSON files.`); skipped++; continue; }
        let total = 0;
        for (const entry of entries) {
          if (entry.name.split('/').includes('..')) { warnings.push(`Skipped unsafe path in ${file.name}`); continue; }
          let blob: Blob;
          try { blob = await entry.async('blob'); }
          catch (error) { warnings.push(`${entry.name}: could not read ZIP entry (${errorText(error)}).`); continue; }
          total += blob.size;
          if (blob.size > 60 * 1024 * 1024 || total > 250 * 1024 * 1024) throw new Error('Extracted JSON exceeds the safety limit.');
          candidates.push({name: entry.name, text: await blob.text()});
        }
      } else if (/\.json$/i.test(file.name)) candidates = [{name:file.name,text:await file.text()}];
      else { warnings.push(`${file.name}: choose a .json or .zip export.`); skipped++; continue; }
      let found = 0;
      let decodedCandidates = 0;
      for (const candidate of candidates) {
        let data: any;
        try { data = JSON.parse(candidate.text); } catch { warnings.push(`${candidate.name}: invalid JSON.`); continue; }
        decodedCandidates++;
        if (data?.format === 'conversation-vault') {
          if (data.version !== 1 || !Array.isArray(data.conversations)) {
            warnings.push(`${candidate.name}: unsupported Echoes backup version or structure.`);
            continue;
          }
          if (accountLabel) warnings.push(`${candidate.name}: the supplied account label was ignored; labels saved in the Echoes backup were preserved.`);
          let restored = 0;
          for (let i = 0; i < data.conversations.length; i++) {
            try {
              const conversation = parseBackupConversation(data.conversations[i]);
              if (conversation) { parsed.push(conversation); found++; restored++; }
              else warnings.push(`${candidate.name}: skipped malformed backup conversation ${i + 1}.`);
            } catch (error) { warnings.push(`${candidate.name}: backup conversation ${i + 1} could not be parsed (${errorText(error)}).`); }
          }
          if (!restored) warnings.push(`${candidate.name}: no valid conversations found in the Echoes backup.`);
          continue;
        }
        const platform = platformFrom(`${file.name} ${candidate.name}`);
        const items = extractConversations(data);
        for (let i = 0; i < items.length; i++) {
          try {
            const item = items[i];
            const sourcePlatform = item?.mapping ? 'chatgpt' : platform;
            const conversation = parseConversation(item, sourcePlatform, accountLabel);
            if (conversation) { parsed.push(conversation); found++; }
            else warnings.push(`${candidate.name}: skipped unsupported or empty conversation ${i + 1}.`);
          } catch (error) { warnings.push(`${candidate.name}: conversation ${i + 1} could not be parsed (${errorText(error)}).`); }
        }
      }
      if (!found) {
        if (decodedCandidates) warnings.push(`${file.name}: no supported conversations found.`);
        skipped++;
      }
    } catch (error) { warnings.push(`${file.name}: ${errorText(error)}.`); skipped++; }
  }
  const result = { imported: 0, updated: 0, skipped, warnings };
  if (parsed.length) {
    try {
      await db.transaction('rw', db.conversations, async () => {
        for (const conversation of parsed) {
          const existing = await db.conversations.get(conversation.id);
          if (existing) result.updated++; else result.imported++;
          await db.conversations.put(conversation);
        }
      });
    } catch (error) {
      result.imported = 0;
      result.updated = 0;
      result.skipped++;
      result.warnings.push(`Could not save imported conversations to the local archive (${errorText(error)}).`);
    }
  }
  return result;
}
export async function exportJSON(conversations: Conversation[]) {
  download(new Blob([JSON.stringify({format:'conversation-vault', version:1, exportedAt:new Date().toISOString(), conversations}, null, 2)], {type:'application/json'}), 'conversation-vault-backup.json');
}
export async function exportMarkdown(c: Conversation) {
  const account = c.accountLabel ? ` · Account: ${c.accountLabel}` : '';
  const body = [`# ${c.title}`, ``, `Source: ${c.platform}${account} · ${c.messages.length} messages`, ``, ...c.messages.flatMap(m => [`## ${m.role}${m.createdAt ? ` · ${new Date(m.createdAt).toLocaleString()}` : ''}`, ``, m.content || '*(No text content)*', ``])].join('\n');
  download(new Blob([body], {type:'text/markdown'}), `${safeName(c.title)}.md`);
}
function safeName(s: string) { return s.replace(/[^a-z0-9-_]+/gi,'-').replace(/^-|-$/g,'').slice(0,80) || 'conversation'; }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
export async function deleteConversation(id: string) { await db.conversations.delete(id); }
