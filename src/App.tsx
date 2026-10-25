import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Search, Upload, Download, MessageSquareText, Clock3, ChevronRight, X, ShieldCheck, Trash2, FileDown, Sparkles, PanelLeftClose, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { db, deleteConversation, exportJSON, exportMarkdown, importFiles, type Conversation, type ImportSummary, type Platform } from './archive';
import './App.css';

const platforms: (Platform|'all')[] = ['all','chatgpt','claude','gemini','perplexity','grok','copilot','other'];
const label = (p: string) => p === 'all' ? 'All sources' : p.charAt(0).toUpperCase()+p.slice(1);
const dateLabel = (s: string | null) => s ? new Date(s).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : 'Date unavailable';
function preview(c: Conversation) { return c.messages.find(m=>m.content)?.content || 'No text preview available'; }

export default function App() {
  const [items,setItems] = useState<Conversation[]>([]);
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const [query,setQuery] = useState('');
  const [platform,setPlatform] = useState<Platform|'all'>('all');
  const [accountFilter,setAccountFilter] = useState('all');
  const [importOpen,setImportOpen] = useState(false);
  const [accountLabel,setAccountLabel] = useState('');
  const [busy,setBusy] = useState(false);
  const [summary,setSummary] = useState<ImportSummary|null>(null);
  const [menu,setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = async () => setItems(await db.conversations.orderBy('updatedAt').reverse().toArray());
  useEffect(()=>{ refresh(); },[]);
  const accountLabels=useMemo(()=>Array.from(new Set(items.map(c=>c.accountLabel?.trim()).filter((v):v is string=>Boolean(v)))).sort((a,b)=>a.localeCompare(b)),[items]);
  const filtered=useMemo(()=>items.filter(c=>(platform==='all'||c.platform===platform) && (accountFilter==='all'||(accountFilter==='__unlabeled__'?!c.accountLabel:c.accountLabel===decodeURIComponent(accountFilter.slice(6)))) && (!query || `${c.title} ${c.platform} ${c.accountLabel||''} ${c.messages.map(m=>m.content).join(' ')}`.toLowerCase().includes(query.toLowerCase()))),[items,platform,accountFilter,query]);
  const selected=items.find(c=>c.id===selectedId) || null;
  async function handleImport(files: FileList|null) {
    if(!files?.length) return; setBusy(true); setSummary(null);
    try { const result=await importFiles(Array.from(files),{accountLabel}); setSummary(result); await refresh(); setImportOpen(false); setAccountLabel(''); }
    finally {setBusy(false); if(fileRef.current) fileRef.current.value='';}
  }
  async function removeSelected() { if(!selected) return; await deleteConversation(selected.id); setSelectedId(null); await refresh(); }
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Archive size={19}/></div><div><b>Echoes</b><span>Conversation vault</span></div><button className="icon-btn menu-toggle" onClick={()=>setMenu(!menu)} aria-label="Toggle navigation"><PanelLeftClose size={17}/></button></div>
      <div className="side-label">LIBRARY</div>
      <nav className={menu?'nav open':'nav'}>{platforms.map(p=><button key={p} className={`nav-item ${platform===p?'active':''}`} onClick={()=>{setPlatform(p);setSelectedId(null);setMenu(false)}}><span className="nav-dot" data-platform={p}/>{label(p)}<span className="nav-count">{p==='all'?items.length:items.filter(c=>c.platform===p).length}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="privacy-card"><ShieldCheck size={17}/><div><strong>Private by design</strong><span>Your archive stays on this device.</span></div></div><span className="version">LOCAL ARCHIVE · V0.1</span></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Library</span><ChevronRight size={15}/><strong>{selected?selected.title:'All conversations'}</strong></div><div className="top-actions"><button className="button quiet" onClick={()=>exportJSON(items)} disabled={!items.length}><Download size={16}/> Backup</button><button className="button primary" onClick={()=>setImportOpen(true)} disabled={busy}><Plus size={17}/>{busy?'Importing…':'Import archive'}</button><input ref={fileRef} type="file" accept=".json,.zip,application/json,application/zip" multiple hidden onChange={e=>handleImport(e.target.files)}/></div></header>
      {importOpen&&<div className="modal-scrim" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setImportOpen(false)}}><section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title"><button className="icon-btn dialog-close" onClick={()=>setImportOpen(false)} disabled={busy} aria-label="Close import dialog"><X size={17}/></button><div className="dialog-icon"><Upload size={20}/></div><h2 id="import-title">Bring conversations in</h2><p>Choose a JSON or ZIP export. Optionally label which account it came from, such as “Work” or “Personal”.</p><label className="account-field">Account label <span>Optional</span><input value={accountLabel} onChange={e=>setAccountLabel(e.target.value)} placeholder="e.g. Work, Personal, Client account" maxLength={80}/></label><div className="dialog-note"><ShieldCheck size={15}/> This label is saved locally and helps distinguish exports from the same provider.</div><button className="button primary dialog-submit" onClick={()=>fileRef.current?.click()} disabled={busy}><Upload size={16}/>{busy?'Importing…':'Choose export files'}</button><button className="dialog-cancel" onClick={()=>setImportOpen(false)} disabled={busy}>Cancel</button></section></div>}
      {selected ? <section className="reader-view"><div className="reader-head"><button className="back-link" onClick={()=>setSelectedId(null)}>← Back to conversations</button><div className="reader-actions"><button className="button quiet" onClick={()=>exportMarkdown(selected)}><FileDown size={15}/> Markdown</button><button className="icon-btn danger" onClick={removeSelected} title="Delete conversation"><Trash2 size={16}/></button></div></div><div className="reader-title"><div className="reader-source"><span className="platform-pill" data-platform={selected.platform}>{selected.platform}</span>{selected.accountLabel&&<span className="account-pill">{selected.accountLabel}</span>}</div><h1>{selected.title}</h1><div className="reader-meta">{selected.messages.length} messages <span>·</span> Updated {dateLabel(selected.updatedAt)}</div></div><div className="message-thread">{selected.messages.map((m,i)=><article key={`${m.id}-${i}`} className={`message-card ${m.role==='user'?'from-user':''}`}><div className="message-avatar">{m.role.toLowerCase().startsWith('assistant')?'✦':m.role.toLowerCase().startsWith('user')?'Y':m.role.slice(0,1).toUpperCase()}</div><div className="message-content"><div className="message-meta"><b>{m.role}</b>{m.createdAt&&<time>{new Date(m.createdAt).toLocaleString()}</time>}</div><div className="message-text">{m.content || <i>Non-text message or attachment</i>}</div></div></article>)}</div></section> : <section className="library-view">
        <div className="hero-row"><div><div className="eyebrow"><Sparkles size={14}/> YOUR PERSONAL AI MEMORY</div><h1>Every conversation,<br/><em>one quiet place.</em></h1><p className="hero-sub">A private, searchable home for the ideas you’ve explored with AI.</p></div><div className="hero-art"><div className="orb orb-one"/><div className="orb orb-two"/><div className="art-card"><MessageSquareText size={22}/><span>One archive.<br/>All your thinking.</span><i/></div></div></div>
        {summary&&<div className={`import-result ${summary.warnings.length?'with-warning':''}`}><div className="result-heading"><CheckCircle2 size={17}/><strong>Import complete</strong><button className="icon-btn" onClick={()=>setSummary(null)}><X size={15}/></button></div><span>{summary.imported} added · {summary.updated} updated · {summary.skipped} skipped</span>{summary.warnings.slice(0,4).map((w,i)=><small key={i}><AlertCircle size={12}/>{w}</small>)}</div>}
        <div className="section-heading"><div><h2>Your conversations <span className="total">{filtered.length}</span></h2><p>Everything you’ve brought together.</p></div><button className="export-link" onClick={()=>exportJSON(items)} disabled={!items.length}><Download size={15}/> Export archive</button></div>
        <div className="tools-row"><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search conversations and messages…"/><kbd>⌘ K</kbd></div><select value={platform} onChange={e=>setPlatform(e.target.value as Platform|'all')} aria-label="Filter by source">{platforms.map(p=><option value={p} key={p}>{label(p)}</option>)}</select><select value={accountFilter} onChange={e=>setAccountFilter(e.target.value)} aria-label="Filter by account"><option value="all">All accounts</option><option value="__unlabeled__">No account label</option>{accountLabels.map(name=><option value={`label:${encodeURIComponent(name)}`} key={name}>{name}</option>)}</select></div>
        {!items.length ? <div className="empty-state"><div className="empty-icon"><Archive size={26}/></div><h3>Your archive starts here</h3><p>Import an official AI data export to bring your conversations into a private, searchable library. Your data stays in this browser.</p><button className="button primary" onClick={()=>setImportOpen(true)}><Upload size={16}/> Choose export file</button><span>Supports JSON and ZIP exports</span></div> : filtered.length===0 ? <div className="no-results">No conversations match this search.</div> : <div className="conversation-list">{filtered.map(c=><button className="conversation-row" key={c.id} onClick={()=>setSelectedId(c.id)}><div className="row-icon" data-platform={c.platform}><MessageSquareText size={18}/></div><div className="row-main"><div className="row-title"><strong>{c.title}</strong><span className="platform-pill" data-platform={c.platform}>{c.platform}</span>{c.accountLabel&&<span className="account-pill">{c.accountLabel}</span>}</div><p>{preview(c).slice(0,180)}{preview(c).length>180?'…':''}</p><div className="row-meta"><span><Clock3 size={13}/>{dateLabel(c.updatedAt)}</span><span><MessageSquareText size={13}/>{c.messages.length} messages</span></div></div><ChevronRight className="row-chevron" size={17}/></button>)}</div>}
        <footer className="library-footer"><span><ShieldCheck size={14}/> Stored locally in this browser</span><span>Import official exports · Nothing is uploaded</span></footer>
      </section>}
    </main>
  </div>
}
