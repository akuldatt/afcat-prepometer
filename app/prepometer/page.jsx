'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { supabase } from '@/lib/supabaseClient';

// default topics
const DEFAULT_CHECKLIST = [
  { id: 1, subject: 'Maths', topic: 'Ratio & Proportion', status: 'Not started', notes: '' },
  { id: 2, subject: 'Maths', topic: 'Percentages', status: 'Not started', notes: '' },
  { id: 3, subject: 'Maths', topic: 'Profit & Loss', status: 'Not started', notes: '' },
  { id: 4, subject: 'Maths', topic: 'Time & Distance', status: 'Not started', notes: '' },
  { id: 5, subject: 'Maths', topic: 'Mixtures & Averages', status: 'Not started', notes: '' },
  { id: 6, subject: 'English', topic: 'Tenses', status: 'Not started', notes: '' },
  { id: 7, subject: 'English', topic: 'Error Spotting & Cloze', status: 'Not started', notes: '' },
  { id: 8, subject: 'English', topic: 'RC Practice', status: 'Not started', notes: '' },
  { id: 9, subject: 'English', topic: 'Vocab (roots & idioms)', status: 'Not started', notes: '' },
  { id: 10, subject: 'Reasoning', topic: 'Series & Analogy', status: 'Not started', notes: '' },
  { id: 11, subject: 'Reasoning', topic: 'Coding-Decoding', status: 'Not started', notes: '' },
  { id: 12, subject: 'Reasoning', topic: 'Figure/Non-verbal', status: 'Not started', notes: '' },
  { id: 13, subject: 'Reasoning', topic: 'Syllogism & Directions', status: 'Not started', notes: '' },
  { id: 14, subject: 'GK', topic: 'Defence (exercises & equipment)', status: 'Not started', notes: '' },
  { id: 15, subject: 'GK', topic: 'Static (Polity, Geo, History)', status: 'Not started', notes: '' },
  { id: 16, subject: 'GK', topic: 'Current Affairs (last 18 months)', status: 'Not started', notes: '' },
  { id: 17, subject: 'GK', topic: 'Misc (Awards, Appointments)', status: 'Not started', notes: '' },
];

const SUBJECTS = ['English', 'Maths', 'Reasoning', 'GK'];

export default function Prepometer() {
  // auth
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // profile
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // local data
  const [checklist, setChecklist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('prep_checklist')) || DEFAULT_CHECKLIST; } catch { return DEFAULT_CHECKLIST; }
  });
  const [dailyData, setDailyData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('prep_daily')) || []; } catch { return []; }
  });
  const [today, setToday] = useState({ hours: '', mathsQ: '', reasoningQ: '', mock: '', notes: '' });
  const [newTopic, setNewTopic] = useState({ subject: 'Maths', topic: '', status: 'Not started', notes: '' });

  // email ref to avoid caret jump
  const emailRef = useRef(null);

  useEffect(() => localStorage.setItem('prep_checklist', JSON.stringify(checklist)), [checklist]);
  useEffect(() => localStorage.setItem('prep_daily', JSON.stringify(dailyData)), [dailyData]);

  // session init + auth listener
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session ?? null;
        if (!mounted) return;
        setUser(session?.user ?? null);
        setAuthLoading(false);
        if (session?.user) {
          await loadProfile(session.user.id);
          await loadFromSupabase(session.user.id);
        } else {
          setProfile(null); setProfileLoading(false);
        }
      } catch (err) {
        console.error('auth init', err);
        setAuthLoading(false);
        setProfileLoading(false);
      }
    })();

    const { subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadProfile(session.user.id);
        await loadFromSupabase(session.user.id);
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    });

    return () => { mounted = false; subscription?.unsubscribe(); };
  }, []);

  // load profile
  async function loadProfile(userId) {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase.from('profiles').select('username, full_name, avatar_url').eq('id', userId).single();
      if (!error) setProfile(data);
    } catch (err) {
      console.error('loadProfile', err);
    } finally {
      setProfileLoading(false);
    }
  }

  // progress (case-insensitive done)
  const progress = useMemo(() => {
    const res = { English: 0, Maths: 0, Reasoning: 0, GK: 0 };
    SUBJECTS.forEach(s => {
      const items = checklist.filter(i => i.subject === s);
      if (items.length === 0) { res[s] = 0; return; }
      const done = items.filter(i => String(i.status || '').toLowerCase().startsWith('done')).length;
      res[s] = Math.round((done / items.length) * 100);
    });
    return res;
  }, [checklist]);

  // charts data
  const chartData = dailyData.slice(-30).map(r => ({ date: r.date, hours: r.hours, mathsQ: r.mathsQ, reasoningQ: r.reasoningQ, mock: r.mock }));

  // --- Supabase load user data (checklists + logs)
  async function loadFromSupabase(userId) {
    try {
      // checklists
      const { data: clData, error: clErr } = await supabase.from('checklists').select('id, subject, topic, status, notes').eq('user_id', userId).order('id', { ascending: true });
      if (!clErr && clData) {
        // map DB rows
        setChecklist(clData.map(r => ({ id: r.id, subject: r.subject, topic: r.topic, status: r.status, notes: r.notes || '' })));
      }
      // daily logs
      const { data: dlData, error: dlErr } = await supabase.from('daily_logs').select('id, log_date, hours, maths_q, reasoning_q, mock, notes').eq('user_id', userId).order('log_date', { ascending: true });
      if (!dlErr && dlData) {
        setDailyData(dlData.map(r => ({ id: r.id, date: r.log_date, hours: Number(r.hours) || 0, mathsQ: Number(r.maths_q) || 0, reasoningQ: Number(r.reasoning_q) || 0, mock: r.mock === null ? '' : Number(r.mock), notes: r.notes || '' })));
      }
    } catch (err) {
      console.error('loadFromSupabase', err);
    }
  }

  // --- Sync helpers (save checklist item)
  async function saveChecklistItemToSupabase(item) {
    if (!user) return;
    try {
      if (typeof item.id === 'number') {
        // update
        const { error } = await supabase.from('checklists').update({ status: item.status, notes: item.notes, updated_at: new Date().toISOString() }).eq('id', item.id).eq('user_id', user.id);
        if (error) console.error('update checklist', error);
      } else {
        // insert
        const { data, error } = await supabase.from('checklists').insert([{ user_id: user.id, subject: item.subject, topic: item.topic, status: item.status, notes: item.notes || '' }]).select('id').single();
        if (error) console.error('insert checklist', error);
        else if (data?.id) {
          // replace temp id with real id
          setChecklist(prev => prev.map(it => it === item ? { ...it, id: data.id } : it));
        }
      }
    } catch (err) {
      console.error('saveChecklistItemToSupabase', err);
    }
  }

  async function deleteChecklistFromSupabase(itemId) {
    if (!user || typeof itemId !== 'number') return;
    try {
      const { error } = await supabase.from('checklists').delete().eq('id', itemId).eq('user_id', user.id);
      if (error) console.error('delete checklist', error);
    } catch (err) {
      console.error('deleteChecklistFromSupabase', err);
    }
  }

  async function addDayRemote(d) {
    if (!user) return null;
    try {
      const { data, error } = await supabase.from('daily_logs').insert([{ user_id: user.id, log_date: d.date, hours: d.hours || 0, maths_q: d.mathsQ || 0, reasoning_q: d.reasoningQ || 0, mock: d.mock === '' ? null : d.mock, notes: d.notes || '' }]).select('id').single();
      if (error) { console.error('daily insert', error); return null; }
      return data?.id || null;
    } catch (err) {
      console.error('addDayRemote', err);
      return null;
    }
  }

  // UI handlers (local update + remote save)
  const updateChecklistItem = (id, patch) => {
    setChecklist(prev => {
      const updated = prev.map(it => it.id === id ? { ...it, ...patch } : it);
      const changed = updated.find(it => it.id === id);
      if (user && changed) saveChecklistItemToSupabase(changed).catch(console.error);
      return updated;
    });
  };

  const deleteChecklistItem = (id) => {
    if (!confirm('Delete this topic?')) return;
    setChecklist(prev => prev.filter(it => it.id !== id));
    if (user && typeof id === 'number') deleteChecklistFromSupabase(id).catch(console.error);
  };

  const addNewTopic = () => {
    if (!newTopic.topic.trim()) { alert('Enter topic name'); return; }
    const tempId = 't' + Date.now();
    const newItem = { id: tempId, subject: newTopic.subject, topic: newTopic.topic, status: newTopic.status, notes: newTopic.notes || '' };
    setChecklist(prev => [...prev, newItem]);
    (async () => {
      if (user) {
        const { data, error } = await supabase.from('checklists').insert([{ user_id: user.id, subject: newItem.subject, topic: newItem.topic, status: newItem.status, notes: newItem.notes }]).select('id').single();
        if (error) console.error('insert new topic', error);
        else if (data?.id) {
          setChecklist(prev => prev.map(it => it.id === tempId ? { ...it, id: data.id } : it));
        }
      }
    })();
    setNewTopic({ subject: 'Maths', topic: '', status: 'Not started', notes: '' });
  };

  const addDay = async () => {
    const entry = { date: new Date().toISOString().slice(0,10), hours: Number(today.hours||0), mathsQ: Number(today.mathsQ||0), reasoningQ: Number(today.reasoningQ||0), mock: today.mock === '' ? '' : Number(today.mock), notes: today.notes || '' };
    setDailyData(prev => [...prev, entry]);
    if (user) await addDayRemote(entry);
    setToday({ hours:'', mathsQ:'', reasoningQ:'', mock:'', notes:'' });
  };

  const resetAll = () => { if (!confirm('Reset all?')) return; setChecklist(DEFAULT_CHECKLIST); setDailyData([]); localStorage.removeItem('prep_checklist'); localStorage.removeItem('prep_daily'); };

  // import local to supabase (bulk, naive - may create dupes)
  async function importLocalToSupabase() {
    if (!user) { alert('Sign in first to import'); return; }
    try {
      // checklist bulk insert
      const toInsertChecklist = checklist.map(item => ({ user_id: user.id, subject: item.subject, topic: item.topic, status: item.status, notes: item.notes || '' }));
      if (toInsertChecklist.length) {
        const { error } = await supabase.from('checklists').insert(toInsertChecklist);
        if (error) console.error('import checklist', error);
      }
      // daily logs
      const toInsertDaily = dailyData.map(d => ({ user_id: user.id, log_date: d.date, hours: d.hours, maths_q: d.mathsQ, reasoning_q: d.reasoningQ, mock: d.mock === '' ? null : d.mock, notes: d.notes || '' }));
      if (toInsertDaily.length) {
        const { error } = await supabase.from('daily_logs').insert(toInsertDaily);
        if (error) console.error('import daily', error);
      }
      alert('Imported local data to your Supabase account. Re-loading data...');
      await loadFromSupabase(user.id);
    } catch (err) {
      console.error('importLocalToSupabase', err);
      alert('Import failed - see console');
    }
  }

  // auth helpers
  async function signInWithEmail(email) {
    if (!email) return alert('Enter email');
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) alert('Sign in error: ' + (error.message || error));
    else alert('Magic link sent. Check your inbox.');
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    alert('Signed out');
  }

  // export functions
  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    const dlHeader = ['Date','Hours Studied','Maths Qs Solved','Reasoning Qs Solved','Mock %','Notes'];
    const dlRows = dailyData.map(r => [r.date, r.hours, r.mathsQ, r.reasoningQ, r.mock, r.notes || '']);
    const dlSheet = XLSX.utils.aoa_to_sheet([dlHeader, ...dlRows]);
    XLSX.utils.book_append_sheet(wb, dlSheet, 'DailyLogs');

    const clHeader = ['Subject','Topic','Status','Notes'];
    const clRows = checklist.map(c => [c.subject, c.topic, c.status, c.notes || '']);
    const clSheet = XLSX.utils.aoa_to_sheet([clHeader, ...clRows]);
    XLSX.utils.book_append_sheet(wb, clSheet, 'Checklist');

    const summary = [['Metric','Value'], ['Total Days Logged', dailyData.length]];
    const sSheet = XLSX.utils.aoa_to_sheet(summary);
    XLSX.utils.book_append_sheet(wb, sSheet, 'Summary');

    const wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), `afcat_prep_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportChecklistCSV = () => {
    const header = ['Subject','Topic','Status','Notes'];
    const rows = checklist.map(r => [r.subject, r.topic.replaceAll(',',' '), r.status, (r.notes||'').replaceAll(',',' ')]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'afcat_checklist.csv'; a.click(); URL.revokeObjectURL(url);
  };

  // header with profile UI
  function HeaderWithProfile() {
    if (profileLoading) return <div style={{ color: '#777' }}>Checking profile…</div>;
    if (!user) {
      return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="/auth" style={{ padding: '8px 12px', borderRadius: 8, background: '#2563eb', color: '#fff', textDecoration: 'none' }}>Sign in</a>
        </div>
      );
    }
    const display = profile?.username || profile?.full_name || user.email || 'You';
    const letter = String(display).charAt(0).toUpperCase();
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <a href="/profile" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#222' }}>
          <div style={{ width: 36, height: 36, borderRadius: 999, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
            { profile?.avatar_url ? <img src={profile.avatar_url} alt="avatar" style={{ width: 36, height: 36, borderRadius: 999 }} /> : letter }
          </div>
          <div style={{ fontWeight: 600 }}>{display}</div>
        </a>
        <button style={{ padding: '8px 10px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none' }} onClick={signOut}>Sign out</button>
      </div>
    );
  }

  // UI styles
  const s = {
    page:{ fontFamily:'Inter, Arial, sans-serif', padding:18, maxWidth:1200, margin:'0 auto' },
    header:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 },
    card:{ background:'#fff', border:'1px solid #eee', borderRadius:10, padding:12, boxShadow:'0 6px 12px rgba(0,0,0,0.03)' },
    grid:{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:12, marginBottom:12 }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div><div style={{ fontSize:20, fontWeight:700 }}>AFCAT Prepometer — Study Tracker</div></div>

        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button style={{ padding:'8px 12px', borderRadius:8, background:'#0ea5a4', color:'#fff', border:'none' }} onClick={()=>alert('Keep going — consistency wins!')}>Motivate</button>
          <button style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', border:'none' }} onClick={exportXLSX}>Export Excel</button>
          <button style={{ padding:'8px 12px', borderRadius:8, background:'#f59e0b', color:'#fff', border:'none' }} onClick={exportChecklistCSV}>Export CSV</button>
          <button style={{ padding:'8px 12px', borderRadius:8, background:'#ef4444', color:'#fff', border:'none' }} onClick={resetAll}>Reset</button>
          <div style={{ marginLeft:12 }}><HeaderWithProfile /></div>
        </div>
      </div>

      {/* Progress */}
      <div style={s.grid}>
        {Object.entries(progress).map(([sub, val]) => (
          <div key={sub} style={s.card}>
            <div style={{ fontWeight:700, marginBottom:8 }}>{sub} — {val}%</div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ flex:1, height:12, background:'#eee', borderRadius:8, overflow:'hidden' }}>
                <div style={{ width:`${val}%`, height:'100%', background:'#2563eb' }} />
              </div>
              <div style={{ width:36, textAlign:'right', fontWeight:700 }}>{val}%</div>
            </div>
            <div style={{ marginTop:8, fontSize:13, color:'#444' }}>Topics Done / Total used to compute progress automatically.</div>
          </div>
        ))}
      </div>

      {/* Daily tracker */}
      <div style={{ ...s.card, marginBottom:12 }}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Daily Tracker — add today's work</div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <input style={{ padding:8, borderRadius:6, border:'1px solid #ddd', width:140 }} placeholder="Hours Studied" value={today.hours} onChange={e=>setToday(p=>({...p,hours:e.target.value}))} type="number" min="0" />
          <input style={{ padding:8, borderRadius:6, border:'1px solid #ddd', width:180 }} placeholder="Maths Qs Solved" value={today.mathsQ} onChange={e=>setToday(p=>({...p,mathsQ:e.target.value}))} type="number" min="0" />
          <input style={{ padding:8, borderRadius:6, border:'1px solid #ddd', width:180 }} placeholder="Reasoning Qs Solved" value={today.reasoningQ} onChange={e=>setToday(p=>({...p,reasoningQ:e.target.value}))} type="number" min="0" />
          <input style={{ padding:8, borderRadius:6, border:'1px solid #ddd', width:140 }} placeholder="Mock Marks %" value={today.mock} onChange={e=>setToday(p=>({...p,mock:e.target.value}))} type="number" min="0" max="100" />
          <input style={{ padding:8, borderRadius:6, border:'1px solid #ddd', width:260 }} placeholder="Notes (optional)" value={today.notes} onChange={e=>setToday(p=>({...p,notes:e.target.value}))} />
          <button style={{ padding:'8px 12px', borderRadius:8, background:'#0ea5a4', color:'#fff', border:'none' }} onClick={addDay}>Add Day Record</button>
        </div>
      </div>

      {/* Charts */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 420px', gap:12, marginBottom:12 }}>
        <div style={s.card}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Combined Bar (Hours, Maths Qs, Reasoning Qs)</div>
          {chartData.length === 0 ? <div style={{ color:'#666' }}>No logs yet — add a day to see charts.</div> : (
            <div style={{ width:'100%', height:320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize:12 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="hours" name="Hours" fill="#60a5fa" />
                  <Bar dataKey="mathsQ" name="Maths Qs" fill="#34d399" />
                  <Bar dataKey="reasoningQ" name="Reasoning Qs" fill="#fbbf24" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div style={s.card}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Mock % Trend (Line) & Hours Trend</div>
          {chartData.length === 0 ? <div style={{ color:'#666' }}>No logs yet — add a day to see charts.</div> : (
            <div style={{ width:'100%', height:320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="mock" name="Mock %" stroke="#ef4444" strokeWidth={2} dot={{ r:3 }} />
                  <Line type="monotone" dataKey="hours" name="Hours" stroke="#2563eb" strokeWidth={2} dot={{ r:3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Checklist */}
      <div style={s.card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:700 }}>Interactive Checklist</div>
          <div style={{ display:'flex', gap:8 }}>
            <button style={{ padding:'8px 12px', borderRadius:8, background:'#f59e0b', color:'#fff', border:'none' }} onClick={()=>setChecklist(c=>c.slice().sort((a,b)=>a.subject.localeCompare(b.subject)||a.topic.localeCompare(b.topic)))}>Sort</button>
            <button style={{ padding:'8px 12px', borderRadius:8, background:'#0ea5a4', color:'#fff', border:'none' }} onClick={() => { const csv = checklist.map(i=>`${i.subject},${i.topic.replaceAll(',',' ')} , ${i.status},${(i.notes||'').replaceAll(',',' ')}`).join('\n'); navigator.clipboard.writeText(csv).then(()=>alert('Checklist copied to clipboard')); }}>Copy CSV</button>
            <button style={{ padding:'8px 12px', borderRadius:8, background:'#06b6d4', color:'#fff', border:'none' }} onClick={importLocalToSupabase}>Import local → Cloud</button>
          </div>
        </div>

        <div style={{ marginTop:10 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr><th style={{ textAlign:'left', padding:6 }}>Subject</th><th style={{ padding:6 }}>Topic</th><th style={{ padding:6 }}>Status</th><th style={{ padding:6 }}>Notes</th><th style={{ padding:6 }}>Actions</th></tr>
            </thead>
            <tbody>
              {checklist.map(item => (
                <tr key={item.id}>
                  <td style={{ padding:8 }}>{item.subject}</td>
                  <td style={{ padding:8 }}>{item.topic}</td>
                  <td style={{ padding:8 }}>
                    <select value={item.status} onChange={(e)=>updateChecklistItem(item.id,{status:e.target.value})} style={{ padding:6, borderRadius:6 }}>
                      <option>Not started</option><option>In progress</option><option>Done</option>
                    </select>
                  </td>
                  <td style={{ padding:8 }}><input style={{ padding:6, borderRadius:6, width:'100%' }} value={item.notes||''} onChange={(e)=>updateChecklistItem(item.id,{notes:e.target.value})} placeholder="Notes/problem" /></td>
                  <td style={{ padding:8 }}>
                    <button style={{ padding:'6px 10px', borderRadius:6, background:'#f59e0b', color:'#fff', border:'none' }} onClick={()=>updateChecklistItem(item.id,{status: item.status==='Done' ? 'Not started' : 'Done'})}>Toggle Done</button>{' '}
                    <button style={{ padding:'6px 10px', borderRadius:6, background:'#ef4444', color:'#fff', border:'none' }} onClick={()=>deleteChecklistItem(item.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop:12, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <select value={newTopic.subject} onChange={e=>setNewTopic(nt=>({...nt,subject:e.target.value}))} style={{ padding:8, borderRadius:6 }}>
              <option>Maths</option><option>English</option><option>Reasoning</option><option>GK</option>
            </select>
            <input placeholder="New topic name" value={newTopic.topic} onChange={e=>setNewTopic(nt=>({...nt,topic:e.target.value}))} style={{ padding:8, borderRadius:6, minWidth:260 }} />
            <select value={newTopic.status} onChange={e=>setNewTopic(nt=>({...nt,status:e.target.value}))} style={{ padding:8, borderRadius:6 }}>
              <option>Not started</option><option>In progress</option><option>Done</option>
            </select>
            <input placeholder="Notes (optional)" value={newTopic.notes} onChange={e=>setNewTopic(nt=>({...nt,notes:e.target.value}))} style={{ padding:8, borderRadius:6, minWidth:220 }} />
            <button style={{ padding:'8px 12px', borderRadius:8, background:'#0ea5a4', color:'#fff', border:'none' }} onClick={addNewTopic}>Add Topic</button>
          </div>
        </div>
      </div>

      <div style={{ marginTop:10, color:'#555', fontSize:13 }}>Tip: Click <b>Export Excel</b>, upload to Google Drive, then open with Google Sheets to enable live charts & weekly formulas.</div>
    </div>
  );
}
