import Dexie, { type Table } from 'dexie';
import JSZip from 'jszip';

export type Platform = 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'grok' | 'copilot' | 'other';
export interface Message { id: string; role: string; content: string; createdAt: string | null; metadata?: Record<string, unknown> }
export interface Conversation { id: string; platform: Platform; sourceId: string; title: string; createdAt: string | null; updatedAt: string | null; messages: Message[]; metadata?: Record<string, unknown>; importedAt: string }

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
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v * 1000).toISOString();
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
const makeId = (platform: string, source: string) => `${platform}:${source}`;

function parseConversation(raw: any, platform: Platform, index: number): Conversation | null {
  if (!raw || typeof raw !== 'object') return null;
  const sourceId = str(raw.id || raw.conversation_id || raw.uuid || raw.chat_id || `import-${index}`);
  const title = str(raw.title || raw.name || raw.subject || 'Untitled conversation') || 'Untitled conversation';
  const messages: Message[] = [];
  if (raw.mapping && typeof raw.mapping === 'object') {
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
      const content = textOf(m.content ?? m.text ?? m.message ?? m);
      if (content || m.role || m.author) messages.push({ id: str(m.id || m.uuid) || `${sourceId}-${i}`, role: str(m.role || m.author?.role || m.sender || 'unknown'), content, createdAt: iso(m.created_at || m.create_time || m.timestamp), metadata: m.metadata && typeof m.metadata === 'object' ? m.metadata : undefined });
    });
  }
  if (!messages.length && !raw.mapping && !Array.isArray(raw.messages)) return null;
  const createdAt = iso(raw.create_time || raw.created_at || raw.createdAt);
  const updatedAt = iso(raw.update_time || raw.updated_at || raw.updatedAt) || createdAt;
  return { id: makeId(platform, sourceId), platform, sourceId, title, createdAt, updatedAt, messages, metadata: { sourceFormat: raw.mapping ? 'chatgpt-mapping' : 'generic-json' }, importedAt: new Date().toISOString() };
}

function extractConversations(json: any): any[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  for (const key of ['conversations','chats','threads','history']) if (Array.isArray(json[key])) return json[key];
  if (json.mapping || json.messages || json.chat_messages || json.turns) return [json];
  return [];
}
export interface ImportSummary { imported: number; updated: number; skipped: number; warnings: string[] }
export async function importFiles(files: File[]): Promise<ImportSummary> {
  const parsed: Conversation[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  for (const file of files) {
    try {
      let candidates: {name:string; text:string}[] = [];
      if (file.name.toLowerCase().endsWith('.zip')) {
        if (file.size > 250 * 1024 * 1024) throw new Error('ZIP exceeds the 250 MB safety limit.');
        const zip = await JSZip.loadAsync(file, { checkCRC32: true });
        const entries = Object.values(zip.files).filter(f => !f.dir && !f.name.startsWith('__MACOSX/') && /\.json$/i.test(f.name));
        if (entries.length > 1000) throw new Error('ZIP contains too many JSON files.');
        let total = 0;
        for (const entry of entries) {
          if (entry.name.split('/').includes('..')) { warnings.push(`Skipped unsafe path in ${file.name}`); continue; }
          const blob = await entry.async('blob'); total += blob.size;
          if (blob.size > 60 * 1024 * 1024 || total > 250 * 1024 * 1024) throw new Error('Extracted JSON exceeds the safety limit.');
          candidates.push({name: entry.name, text: await blob.text()});
        }
      } else if (/\.json$/i.test(file.name)) candidates = [{name:file.name,text:await file.text()}];
      else { warnings.push(`${file.name}: choose a .json or .zip export.`); skipped++; continue; }
      let found = 0;
      for (const candidate of candidates) {
        let data: any;
        try { data = JSON.parse(candidate.text); } catch { warnings.push(`${candidate.name}: invalid JSON.`); continue; }
        const platform = platformFrom(`${file.name} ${candidate.name}`);
        const items = extractConversations(data);
        items.forEach((item, i) => { const sourcePlatform = item?.mapping ? 'chatgpt' : platform; const conversation = parseConversation(item, sourcePlatform, i); if (conversation) { parsed.push(conversation); found++; } });
      }
      if (!found) { warnings.push(`${file.name}: no supported conversations found.`); skipped++; }
    } catch (error) { warnings.push(`${file.name}: ${error instanceof Error ? error.message : 'could not read file'}`); skipped++; }
  }
  const result = { imported: 0, updated: 0, skipped, warnings };
  await db.transaction('rw', db.conversations, async () => {
    for (const conversation of parsed) {
      const existing = await db.conversations.get(conversation.id);
      if (existing) result.updated++; else result.imported++;
      await db.conversations.put(conversation);
    }
  });
  return result;
}
export async function exportJSON(conversations: Conversation[]) {
  download(new Blob([JSON.stringify({format:'conversation-vault', version:1, exportedAt:new Date().toISOString(), conversations}, null, 2)], {type:'application/json'}), 'conversation-vault-backup.json');
}
export async function exportMarkdown(c: Conversation) {
  const body = [`# ${c.title}`, ``, `Source: ${c.platform} · ${c.messages.length} messages`, ``, ...c.messages.flatMap(m => [`## ${m.role}${m.createdAt ? ` · ${new Date(m.createdAt).toLocaleString()}` : ''}`, ``, m.content || '*(No text content)*', ``])].join('\n');
  download(new Blob([body], {type:'text/markdown'}), `${safeName(c.title)}.md`);
}
function safeName(s: string) { return s.replace(/[^a-z0-9-_]+/gi,'-').replace(/^-|-$/g,'').slice(0,80) || 'conversation'; }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
export async function deleteConversation(id: string) { await db.conversations.delete(id); }
