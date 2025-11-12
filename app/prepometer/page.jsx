'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { supabase } from '@/lib/supabaseClient';

// AFCAT Prepometer — original UI preserved, Supabase auth + sync added

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

const SUBJECTS = ['English','Maths','Reasoning','GK'];

function uidFromSession(session) {
  return session?.user?.id ?? null;
}

export default function Prepometer() {
  // Auth
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [emailInput, setEmailInput] = useState('');

  // Data states (local copy shown in UI)
  const [checklist, setChecklist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('prep_checklist')) || DEFAULT_CHECKLIST; } catch { return DEFAULT_CHECKLIST; }
  });
  const [dailyData, setDailyData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('prep_daily')) || []; } catch { return []; }
  });
  const [today, setToday] = useState({ hours: '', mathsQ: '', reasoningQ: '', mock: '' });
  const [newTopic, setNewTopic] = useState({ subject: 'Maths', topic: '', status: 'Not started', notes: '' });

  // persist locally always
  useEffect(() => { try { localStorage.setItem('prep_checklist', JSON.stringify(checklist)); } catch {} }, [checklist]);
  useEffect(() => { try { localStorage.setItem('prep_daily', JSON.stringify(dailyData)); } catch {} }, [dailyData]);

  // Supabase auth listener + initial load
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
          await loadFromSupabase(session.user.id);
        }
      } catch (err) {
        console.error('auth init error', err);
        setAuthLoading(false);
      }
    })();

    const { subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadFromSupabase(session.user.id);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // compute progress
  const progress = useMemo(() => {
    const res = { English:0, Maths:0, Reasoning:0, GK:0 };
    SUBJECTS.forEach(s => {
      const items = checklist.filter(i => i.subject === s);
      if (items.length === 0) { res[s] = 0; return; }
      const done = items.filter(i => i.status === 'Done').length;
      res[s] = Math.round((done/items.length)*100);
    });
    return res;
  }, [checklist]);

  // chart data
  const chartData = (() => {
    const last = dailyData.slice(-30);
    if (last.length === 0) return [];
    return last.map(r => ({ date: r.date, hours: r.hours, mathsQ: r.mathsQ, reasoningQ: r.reasoningQ, mock: r.mock }));
  })();

  // ---- Supabase: load user data
  async function loadFromSupabase(userId) {
    try {
      // checklist
      const { data: clData, error: clErr } = await supabase
        .from('checklists')
        .select('id, subject, topic, status, notes')
        .eq('user_id', userId)
        .order('id', { ascending: true });

      if (clErr) {
        console.error('Checklist fetch error', clErr);
      } else if (clData && clData.length > 0) {
        // map DB rows to checklist shape (use numeric id)
        setChecklist(clData.map(r => ({ id: r.id, subject: r.subject, topic: r.topic, status: r.status, notes: r.notes })));
      } else {
        // no DB rows -> keep local checklist so user doesn't lose offline data
      }

      // daily logs
      const { data: dlData, error: dlErr } = await supabase
        .from('daily_logs')
        .select('id, log_date, hours, maths_q, reasoning_q, mock, notes')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (dlErr) {
        console.error('Daily logs fetch error', dlErr);
      } else if (dlData && dlData.length > 0) {
        setDailyData(dlData.map(r => ({
          id: r.id,
          date: r.log_date,
          hours: Number(r.hours) || 0,
          mathsQ: Number(r.maths_q) || 0,
          reasoningQ: Number(r.reasoning_q) || 0,
          mock: r.mock === null ? '' : Number(r.mock),
          notes: r.notes || ''
        })));
      }
    } catch (err) {
      console.error('loadFromSupabase error', err);
    }
  }

  // ---- Supabase: import local -> cloud (bulk insert)
  async function importLocalToSupabase() {
    if (!user) { alert('Sign in first to import local data.'); return; }
    try {
      // insert checklist (naive bulk insert). To avoid duplicates you can tweak later.
      const toInsertChecklist = checklist.map(item => ({
        user_id: user.id,
        subject: item.subject,
        topic: item.topic,
        status: item.status,
        notes: item.notes || ''
      }));
      if (toInsertChecklist.length > 0) {
        const { error: insertClErr } = await supabase.from('checklists').insert(toInsertChecklist);
        if (insertClErr) console.error('Checklist import error', insertClErr);
      }

      // insert daily logs
      const toInsertDaily = dailyData.map(d => ({
        user_id: user.id,
        log_date: d.date || new Date().toISOString().slice(0,10),
        hours: d.hours || 0,
        maths_q: d.mathsQ || 0,
        reasoning_q: d.reasoningQ || 0,
        mock: d.mock || null,
        notes: d.notes || ''
      }));
      if (toInsertDaily.length > 0) {
        const { error: insertDlErr } = await supabase.from('daily_logs').insert(toInsertDaily);
        if (insertDlErr) console.error('Daily import error', insertDlErr);
      }

      alert('Local data imported to your Supabase account. Reloading from cloud...');
      await loadFromSupabase(user.id);
    } catch (err) {
      console.error('importLocalToSupabase error', err);
      alert('Import failed — check console.');
    }
  }

  // ---- Supabase: save/update a single checklist item
  async function saveChecklistItemToSupabase(item) {
    if (!user) return;
    try {
      // if numeric id => update; else insert
      if (typeof item.id === 'number') {
        const { error } = await supabase.from('checklists').update({
          status: item.status,
          notes: item.notes
        }).eq('id', item.id).eq('user_id', user.id);
        if (error) console.error('update checklist error', error);
      } else {
        // insert and replace temp id with returned id
        const { data, error } = await supabase.from('checklists').insert([{
          user_id: user.id,
          subject: item.subject,
          topic: item.topic,
          status: item.status,
          notes: item.notes || ''
        }]).select('id').single();
        if (error) console.error('insert checklist error', error);
        else if (data?.id) {
          setChecklist(prev => prev.map(it => it === item ? { ...it, id: data.id } : it));
        }
      }
    } catch (err) {
      console.error('saveChecklistItemToSupabase', err);
    }
  }

  // ---- Supabase: delete checklist row
  async function deleteChecklistFromSupabase(itemId) {
    if (!user || typeof itemId !== 'number') return;
    try {
      const { error } = await supabase.from('checklists').delete().eq('id', itemId).eq('user_id', user.id);
      if (error) console.error('delete checklist error', error);
    } catch (err) {
      console.error('deleteChecklistFromSupabase', err);
    }
  }

  // ---- Supabase: add daily log remotely
  async function addDayRemote(d) {
    if (!user) return null;
    try {
      const { data, error } = await supabase.from('daily_logs').insert([{
        user_id: user.id,
        log_date: d.date || new Date().toISOString().slice(0,10),
        hours: d.hours || 0,
        maths_q: d.mathsQ || 0,
        reasoning_q: d.reasoningQ || 0,
        mock: d.mock || null,
        notes: d.notes || ''
      }]).select('id').single();
      if (error) { console.error('daily insert error', error); return null; }
      return data?.id || null;
    } catch (err) {
      console.error('addDayRemote', err);
      return null;
    }
  }

  // ---- UI handlers (local update + remote save when logged in)
  const updateChecklistItem = (id, patch) => {
    setChecklist(prev => {
      const updated = prev.map(it => it.id === id ? { ...it, ...patch } : it);
      const changed = updated.find(it => it.id === id);
      // remote save (non-blocking)
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
    // temp id so local UI is responsive
    const tempId = 't' + Date.now();
    const newItem = { id: tempId, subject: newTopic.subject, topic: newTopic.topic, status: newTopic.status, notes: newTopic.notes || '' };
    setChecklist(prev => [...prev, newItem]);
    // if logged in, insert remotely and update id mapping
    (async () => {
      if (user) {
        const { data, error } = await supabase.from('checklists').insert([{
          user_id: user.id,
          subject: newItem.subject,
          topic: newItem.topic,
          status: newItem.status,
          notes: newItem.notes
        }]).select('id').single();
        if (error) console.error('insert new topic error', error);
        else if (data?.id) {
          setChecklist(prev => prev.map(it => it.id === tempId ? { ...it, id: data.id } : it));
        }
      }
    })();
    setNewTopic({ subject: 'Maths', topic: '', status: 'Not started', notes: '' });
  };

  const addDay = async () => {
    const entry = { date: new Date().toLocaleDateString(), hours: Number(today.hours||0), mathsQ: Number(today.mathsQ||0), reasoningQ: Number(today.reasoningQ||0), mock: today.mock === '' ? '' : Number(today.mock), notes: today.notes || '' };
    setDailyData(prev => [...prev, entry]);
    if (user) {
      await addDayRemote(entry);
    }
    setToday({ hours:'', mathsQ:'', reasoningQ:'', mock:'' });
  };

  const resetAll = () => { if(!confirm('Reset all?')) return; setChecklist(DEFAULT_CHECKLIST); setDailyData([]); localStorage.removeItem('prep_checklist'); localStorage.removeItem('prep_daily'); if (user) { /* option: clear remote too — skip for safety */ } };

  // ---- Auth helpers
  async function signInWithEmail(email) {
    if (!email) { alert('Enter email'); return; }
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) alert('Sign in error: ' + error.message);
    else alert('Magic link sent. Check your email and click the link to sign in.');
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    alert('Signed out. Your local data remains in the browser.');
  }

  // ---- Export XLSX
  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    const dlHeader = ['Date','Hours Studied','Maths Qs Solved','Reasoning Qs Solved','Mock %'];
    const dlRows = dailyData.map(r => [r.date, r.hours, r.mathsQ, r.reasoningQ, r.mock]);
    const dlSheet = XLSX.utils.aoa_to_sheet([dlHeader, ...dlRows]);
    XLSX.utils.book_append_sheet(wb, dlSheet, 'DailyLogs');

    const clHeader = ['Subject','Topic','Status','Notes'];
    const clRows = checklist.map(c => [c.subject, c.topic, c.status, c.notes||'']);
    const clSheet = XLSX.utils.aoa_to_sheet([clHeader, ...clRows]);
    XLSX.utils.book_append_sheet(wb, clSheet, 'Checklist');

    const summary = [
      ['Metric','Value'],
      ['Average Hours Studied',''],
      ['Total Days Logged', dailyData.length],
      ['Average Mock %',''],
      ['Maths Topics Done','' ],
      ['English Topics Done','' ],
      ['Reasoning Topics Done','' ],
      ['GK Topics Done','' ],
    ];
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

  // UI styles
  const s = {
    page:{fontFamily:'Inter, Arial, sans-serif', padding:18, maxWidth:1200, margin:'0 auto'},
    header:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14},
    card:{background:'#fff',border:'1px solid #eee',borderRadius:10,padding:12,boxShadow:'0 6px 12px rgba(0,0,0,0.03)'},
    grid:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:12,marginBottom:12}
  };

  // header auth UI component (keeps the look minimal)
  function AuthControls() {
    if (authLoading) return <div style={{color:'#777'}}>Checking auth…</div>;
    if (user) {
      return (
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div style={{fontSize:13,color:'#222',fontWeight:600}}>{user.email}</div>
          <button style={{padding:'8px 12px',borderRadius:8,background:'#ef4444',color:'#fff',border:'none'}} onClick={signOut}>Sign out</button>
          <button style={{padding:'8px 12px',borderRadius:8,background:'#0ea5a4',color:'#fff',border:'none'}} onClick={importLocalToSupabase}>Import local → Cloud</button>
        </div>
      );
    }
    return (
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <input placeholder="Email for magic link" value={emailInput} onChange={e=>setEmailInput(e.target.value)} style={{padding:8,borderRadius:6,border:'1px solid #ddd'}} />
        <button style={{padding:'8px 12px',borderRadius:8,background:'#2563eb',color:'#fff',border:'none'}} onClick={()=>signInWithEmail(emailInput)}>Send Link</button>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={{fontSize:20,fontWeight:700}}>AFCAT Prepometer</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button style={{padding:'8px 12px',borderRadius:8,background:'#0ea5a4',color:'#fff',border:'none'}} onClick={()=>alert('Keep going — consistency wins!')}>Motivate</button>
          <button style={{padding:'8px 12px',borderRadius:8,background:'#2563eb',color:'#fff',border:'none'}} onClick={exportXLSX}>Export Excel</button>
          <button style={{padding:'8px 12px',borderRadius:8,background:'#f59e0b',color:'#fff',border:'none'}} onClick={exportChecklistCSV}>Export CSV</button>
          <button style={{padding:'8px 12px',borderRadius:8,background:'#ef4444',color:'#fff',border:'none'}} onClick={resetAll}>Reset</button>

          {/* Auth controls */}
          <div style={{marginLeft:12}}>
            <AuthControls />
          </div>
        </div>
      </div>

      {/* Progress overview */}
      <div style={s.grid}>
        {Object.entries(progress).map(([sub,val])=>(
          <div key={sub} style={s.card}>
            <div style={{fontWeight:700,marginBottom:8}}>{sub} — {val}%</div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{flex:1,height:12,background:'#eee',borderRadius:8,overflow:'hidden'}}>
                <div style={{width:`${val}%`,height:'100%',background:'#2563eb'}} />
              </div>
              <div style={{width:36,textAlign:'right',fontWeight:700}}>{val}%</div>
            </div>
            <div style={{marginTop:8,fontSize:13,color:'#444'}}>Topics Done / Total used to compute progress automatically.</div>
          </div>
        ))}
      </div>

      {/* Daily tracker */}
      <div style={{...s.card, marginBottom:12}}>
        <div style={{fontWeight:700, marginBottom:8}}>Daily Tracker — add today's work</div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          <input style={{padding:8,borderRadius:6,border:'1px solid #ddd',width:140}} placeholder="Hours Studied" value={today.hours} onChange={e=>setToday(p=>({...p,hours:e.target.value}))} type="number" min="0" />
          <input style={{padding:8,borderRadius:6,border:'1px solid #ddd',width:180}} placeholder="Maths Qs Solved" value={today.mathsQ} onChange={e=>setToday(p=>({...p,mathsQ:e.target.value}))} type="number" min="0" />
          <input style={{padding:8,borderRadius:6,border:'1px solid #ddd',width:180}} placeholder="Reasoning Qs Solved" value={today.reasoningQ} onChange={e=>setToday(p=>({...p,reasoningQ:e.target.value}))} type="number" min="0" />
          <input style={{padding:8,borderRadius:6,border:'1px solid #ddd',width:140}} placeholder="Mock Marks %" value={today.mock} onChange={e=>setToday(p=>({...p,mock:e.target.value}))} type="number" min="0" max="100" />
          <button style={{padding:'8px 12px',borderRadius:8,background:'#0ea5a4',color:'#fff',border:'none'}} onClick={addDay}>Add Day Record</button>
        </div>
      </div>

      {/* Charts */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 420px',gap:12,marginBottom:12}}>
        <div style={s.card}>
          <div style={{fontWeight:700, marginBottom:8}}>Combined Bar (Hours, Maths Qs, Reasoning Qs)</div>
          {chartData.length===0 ? <div style={{color:'#666'}}>No logs yet — add a day to see charts.</div> : (
            <div style={{width:'100%',height:320}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{fontSize:12}} />
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
          <div style={{fontWeight:700, marginBottom:8}}>Mock % Trend (Line) & Hours Trend</div>
          {chartData.length===0 ? <div style={{color:'#666'}}>No logs yet — add a day to see charts.</div> : (
            <div style={{width:'100%',height:320}}>
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

      {/* Checklist UI */}
      <div style={s.card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontWeight:700}}>Interactive Checklist</div>
          <div style={{display:'flex',gap:8}}>
            <button style={{padding:'8px 12px',borderRadius:8,background:'#f59e0b',color:'#fff',border:'none'}} onClick={()=>setChecklist(c=>c.slice().sort((a,b)=>a.subject.localeCompare(b.subject)||a.topic.localeCompare(b.topic)))}>Sort</button>
            <button style={{padding:'8px 12px',borderRadius:8,background:'#0ea5a4',color:'#fff',border:'none'}} onClick={()=>{ const csv = checklist.map(i=>`${i.subject},${i.topic.replaceAll(',',' ')} , ${i.status},${(i.notes||'').replaceAll(',',' ')}`).join('\\n'); navigator.clipboard.writeText(csv).then(()=>alert('Checklist copied to clipboard'))}}>Copy CSV</button>
          </div>
        </div>

        <div style={{marginTop:10}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr><th style={{textAlign:'left',padding:6}}>Subject</th><th style={{padding:6}}>Topic</th><th style={{padding:6}}>Status</th><th style={{padding:6}}>Notes</th><th style={{padding:6}}>Actions</th></tr>
            </thead>
            <tbody>
              {checklist.map(item => (
                <tr key={item.id}>
                  <td style={{padding:8}}>{item.subject}</td>
                  <td style={{padding:8}}>{item.topic}</td>
                  <td style={{padding:8}}>
                    <select value={item.status} onChange={(e)=>updateChecklistItem(item.id,{status:e.target.value})} style={{padding:6,borderRadius:6}}>
                      <option>Not started</option><option>In progress</option><option>Done</option>
                    </select>
                  </td>
                  <td style={{padding:8}}><input style={{padding:6,borderRadius:6,width:'100%'}} value={item.notes||''} onChange={(e)=>updateChecklistItem(item.id,{notes:e.target.value})} placeholder="Notes/problem" /></td>
                  <td style={{padding:8}}>
                    <button style={{padding:'6px 10px',borderRadius:6,background:'#f59e0b',color:'#fff',border:'none'}} onClick={()=>updateChecklistItem(item.id,{status: item.status==='Done' ? 'Not started' : 'Done'})}>Toggle Done</button>{' '}
                    <button style={{padding:'6px 10px',borderRadius:6,background:'#ef4444',color:'#fff',border:'none'}} onClick={()=>deleteChecklistItem(item.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{marginTop:12,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            <select value={newTopic.subject} onChange={e=>setNewTopic(nt=>({...nt,subject:e.target.value}))} style={{padding:8,borderRadius:6}}>
              <option>Maths</option><option>English</option><option>Reasoning</option><option>GK</option>
            </select>
            <input placeholder="New topic name" value={newTopic.topic} onChange={e=>setNewTopic(nt=>({...nt,topic:e.target.value}))} style={{padding:8,borderRadius:6,minWidth:260}} />
            <select value={newTopic.status} onChange={e=>setNewTopic(nt=>({...nt,status:e.target.value}))} style={{padding:8,borderRadius:6}}>
              <option>Not started</option><option>In progress</option><option>Done</option>
            </select>
            <input placeholder="Notes (optional)" value={newTopic.notes} onChange={e=>setNewTopic(nt=>({...nt,notes:e.target.value}))} style={{padding:8,borderRadius:6,minWidth:220}} />
            <button style={{padding:'8px 12px',borderRadius:8,background:'#0ea5a4',color:'#fff',border:'none'}} onClick={addNewTopic}>Add Topic</button>
          </div>
        </div>
      </div>

      <div style={{marginTop:10,color:'#555',fontSize:13}}>Tip: Click <b>Export Excel</b>, upload to Google Drive, then open with Google Sheets to enable live charts & weekly formulas (instructions below).</div>
    </div>
  );
}
