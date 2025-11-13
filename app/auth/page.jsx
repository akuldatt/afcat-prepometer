'use client';

import React, { useRef, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const emailRef = useRef(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // If user already signed in, redirect to /prepometer (or profile if you prefer)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session ?? null;
        if (!mounted) return;
        if (session?.user) {
          // If you want them to complete profile first, redirect to /profile instead
          router.replace('/prepometer');
        }
      } catch (err) {
        console.error('session check', err);
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  async function sendLink(e) {
    e?.preventDefault();
    const email = emailRef.current?.value?.trim();
    if (!email) { setStatus('Please enter your email'); return; }
    setLoading(true);
    setStatus('Sending magic link…');

    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) {
        console.error('signIn error', error);
        setStatus('Error: ' + (error.message || error));
      } else {
        setStatus('Magic link sent. Check your inbox (also spam). After clicking the link you will be signed in.');
      }
    } catch (err) {
      console.error(err);
      setStatus('Unexpected error — check console');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      fontFamily: 'Inter, Arial, sans-serif',
      maxWidth: 720, margin: '36px auto', padding: 16
    }}>
      <div style={{
        border: '1px solid #eee', borderRadius: 12, padding: 20, boxShadow: '0 6px 18px rgba(0,0,0,0.04)'
      }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>Sign in / Sign up</h2>
        <p style={{ color: '#444' }}>Enter your email — we'll send a magic link to sign you in. No password required.</p>

        <form onSubmit={sendLink} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <input
            ref={emailRef}
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
            onKeyDown={(e) => { if (e.key === 'Enter') sendLink(e); }}
          />

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 14px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer'
              }}
            >
              {loading ? 'Sending…' : 'Send Magic Link'}
            </button>

            <button
              type="button"
              onClick={() => { emailRef.current && (emailRef.current.value = ''); setStatus(''); }}
              style={{
                padding: '10px 14px',
                background: '#f3f4f6',
                color: '#111827',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
          </div>

          <div style={{ color: '#666', fontSize: 13 }}>
            By signing in you agree to use your account for saving prep progress. If you already have an account, click the magic link from your email to sign in.
          </div>

          {status && <div style={{ padding: 10, background: '#fff7ed', borderRadius: 8, color: '#92400e' }}>{status}</div>}

          <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
            <a href="/prepometer" style={{ color: '#2563eb', textDecoration: 'underline' }}>Back to Prepometer</a>
            <span style={{ color: '#888' }}>•</span>
            <a href="/profile" style={{ color: '#2563eb', textDecoration: 'underline' }}>Profile setup</a>
          </div>
        </form>
      </div>
    </div>
  );
}
