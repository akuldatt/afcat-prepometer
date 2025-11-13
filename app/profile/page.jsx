'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const router = useRouter();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user ?? null;
      if (!user) {
        router.replace('/auth');
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, created_at')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') console.error('profile fetch', error);
      setProfile(data ?? { id: user.id, username: '' });
      setUsername(data?.username ?? '');
      setLoading(false);
    })();
  }, [router]);

  async function saveProfile(e) {
    e?.preventDefault();
    setLoading(true);
    try {
      const userId = profile?.id;
      const payload = { username: username || null };
      const { error } = await supabase.from('profiles').upsert([{ id: userId, ...payload }], { returning: 'minimal' });
      if (error) console.error('save profile error', error);
      else alert('Profile saved');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={{padding:20}}>Loading…</div>;

  return (
    <div style={{padding:20, maxWidth:800, margin:'0 auto'}}>
      <h2>Profile</h2>
      <form onSubmit={saveProfile} style={{display:'grid',gap:12, maxWidth:520}}>
        <label>Username
          <input value={username} onChange={(e)=>setUsername(e.target.value)} style={{padding:10,borderRadius:8,border:'1px solid #ddd'}} />
        </label>
        <div style={{display:'flex',gap:8}}>
          <button type="submit" style={{padding:'10px 14px', borderRadius:8, background:'#2563eb', color:'#fff', border:'none'}}>Save</button>
          <button type="button" onClick={() => router.push('/prepometer')} style={{padding:'10px 14px', borderRadius:8}}>Back</button>
        </div>
      </form>
    </div>
  );
}
