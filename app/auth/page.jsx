'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

/**
 * Auth page — cleaner UI without animation and with premium action buttons
 * Supports: signup (email+password+username), login (email+password), reset password
 *
 * Replace app/auth/page.jsx with this file.
 */

export default function AuthPage() {
  const router = useRouter();

  // UI mode: 'login' | 'signup' | 'reset'
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session ?? null;
        if (!mounted) return;
        if (session?.user) {
          // ensure profile exists (silently) then go to prepometer
          await ensureProfile(session.user);
          router.replace('/prepometer');
        }
      } catch (err) {
        console.error('session check', err);
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  // ensure profile exists in profiles table (safe to call multiple times)
  async function ensureProfile(user, providedUsername = null) {
    if (!user) return;
    try {
      const { data: profile, error: selErr } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', user.id)
        .single();

      if (!profile) {
        const toInsert = { id: user.id, username: providedUsername || null };
        await supabase.from('profiles').insert([toInsert]);
      } else if (providedUsername && profile.username !== providedUsername) {
        await supabase.from('profiles').update({ username: providedUsername }).eq('id', user.id);
      }
    } catch (err) {
      // ignore errors silently, log for debug
      console.warn('ensureProfile error', err);
    }
  }

  // SIGNUP handler
  async function handleSignup(e) {
    e?.preventDefault();
    setMessage('');
    if (!email.trim() || !password) {
      setMessage('Enter email and password.');
      return;
    }
    if (!username.trim()) {
      setMessage('Choose a username (display name).');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password
      });

      if (error) {
        setMessage('Sign up error: ' + (error.message || error));
        setLoading(false);
        return;
      }

      const user = data?.user ?? null;
      if (user && user.id) {
        await ensureProfile(user, username.trim());
        setMessage('Account created. Redirecting if session active...');
        const { data: sdata } = await supabase.auth.getSession();
        if (sdata?.session) router.replace('/prepometer');
        else setMessage('Check your email to confirm. After confirmation, log in.');
      } else {
        // Email confirm flow — store pending username so user can claim after confirmation
        try { localStorage.setItem('pending_username', username.trim()); } catch {}
        setMessage('Check your email for a confirmation link. After confirming, log in.');
      }
    } catch (err) {
      console.error('signup unexpected', err);
      setMessage('Unexpected error — check console.');
    } finally {
      setLoading(false);
    }
  }

  // LOGIN handler
  async function handleLogin(e) {
    e?.preventDefault();
    setMessage('');
    if (!email.trim() || !password) {
      setMessage('Enter email and password.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) {
        setMessage('Sign in error: ' + (error.message || error));
        setLoading(false);
        return;
      }

      const user = data?.user ?? null;
      if (user) {
        const pending = localStorage.getItem('pending_username') || null;
        await ensureProfile(user, pending || username || null);
        try { localStorage.removeItem('pending_username'); } catch (e) {}
        setMessage('Signed in — redirecting...');
        router.replace('/prepometer');
      } else {
        setMessage('Signed in but no user returned. Check console.');
      }
    } catch (err) {
      console.error('login unexpected', err);
      setMessage('Unexpected error — check console.');
    } finally {
      setLoading(false);
    }
  }

  // PASSWORD RESET
  async function handlePasswordReset(e) {
    e?.preventDefault();
    setMessage('');
    if (!email.trim()) { setMessage('Enter your email to reset password'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth` : undefined
      });
      if (error) setMessage('Reset error: ' + (error.message || error));
      else setMessage('Password reset link sent (check spam).');
    } catch (err) {
      console.error('reset unexpected', err);
      setMessage('Unexpected error — check console.');
    } finally {
      setLoading(false);
    }
  }

  function switchTo(m) {
    setMessage('');
    setMode(m);
  }

  return (
    <div style={page}>
      <div style={centerWrap}>
        <div className="card" style={card}>
          <div style={cardHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>AFCAT Prepometer</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{mode === 'login' ? 'Login' : mode === 'signup' ? 'Create account' : 'Password reset'}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>Track study | Charts | Export</div>
          </div>

          <form onSubmit={mode === 'signup' ? handleSignup : mode === 'login' ? handleLogin : handlePasswordReset} style={formStyle}>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={input}
              autoComplete="email"
            />

            {mode === 'signup' && (
              <input
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={input}
                required
              />
            )}

            {mode !== 'reset' && (
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={input}
                required={mode !== 'reset'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            )}

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="submit" disabled={loading} className="action-primary" style={primaryBtn}>
                {loading ? 'Working…' : (mode === 'signup' ? 'Create account' : mode === 'login' ? 'Login' : 'Send reset link')}
              </button>

              <button type="button" onClick={() => { setEmail(''); setPassword(''); setUsername(''); setMessage(''); }} className="action-secondary" style={secondaryBtn}>
                Clear
              </button>

              {/* Premium action buttons block */}
              <div className="action-group" style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {mode !== 'signup' && (
                  <button type="button" className="action-primary-small" onClick={() => switchTo('signup')} style={actionPrimarySmall}>
                    ✨ Create account
                  </button>
                )}

                {mode !== 'login' && (
                  <button type="button" className="action-secondary-small" onClick={() => switchTo('login')} style={actionSecondarySmall}>
                    Log in
                  </button>
                )}

                <button type="button" className="action-link" onClick={() => switchTo('reset')} style={actionLink}>
                  Forgot password?
                </button>
              </div>
            </div>

            {message && <div style={messageBox}>{message}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7280', marginTop: 8 }}>
              <a href="/prepometer" style={{ color: '#2563eb', textDecoration: 'none' }}>Back to Prepometer</a>
              <a href="/profile" style={{ color: '#2563eb', textDecoration: 'none' }}>Profile setup</a>
            </div>
          </form>
        </div>
      </div>

      {/* Inline styles + small CSS tweaks */}
      <style jsx>{`
        .action-group { }
        .action-primary-small {}
        .action-secondary-small {}
        .action-link {}
        @media (max-width: 520px) {
          .action-group { justify-content: center; gap: 8px; }
        }
      `}</style>
    </div>
  );
}

/* Inline style objects used above */
const page = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg,#f8fbff 0%, #ffffff 100%)',
  position: 'relative',
  overflow: 'hidden',
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial'
};

const centerWrap = {
  minHeight: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 28,
};

const card = {
  width: 760,
  maxWidth: '96%',
  borderRadius: 14,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,250,252,0.98))',
  boxShadow: '0 18px 40px rgba(13, 38, 76, 0.06)',
  border: '1px solid rgba(15, 23, 42, 0.04)',
  padding: 28,
  position: 'relative',
  overflow: 'hidden'
};

const cardHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 14
};

const logoBadge = {
  width: 48,
  height: 48,
  borderRadius: 10,
  background: 'linear-gradient(135deg,#0b3d91,#2563eb)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 800,
  fontSize: 20,
  boxShadow: '0 8px 24px rgba(11, 61, 145, 0.12)'
};

const formStyle = {
  display: 'grid',
  gap: 12,
  marginTop: 8
};

const input = {
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid #e6eef9',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
  fontSize: 15,
  outline: 'none',
  transition: 'box-shadow .15s, border-color .15s',
};

const primaryBtn = {
  padding: '10px 16px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(90deg,#0b3d91,#2563eb)',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 10px 24px rgba(37,99,235,0.14)'
};

const secondaryBtn = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(11,61,145,0.08)',
  background: '#ffffff',
  color: '#0b3d91',
  cursor: 'pointer'
};

const actionPrimarySmall = {
  padding: '8px 12px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(90deg,#0b3d91,#2563eb)',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 8px 20px rgba(37,99,235,0.14)'
};

const actionSecondarySmall = {
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid rgba(11,61,145,0.08)',
  background: '#fff',
  color: '#0b3d91',
  fontWeight: 700,
  cursor: 'pointer'
};

const actionLink = {
  background: 'none',
  border: 'none',
  color: '#2563eb',
  cursor: 'pointer',
  padding: '6px 8px',
  fontSize: 14,
  textDecoration: 'underline',
  textUnderlineOffset: 3
};

const messageBox = {
  padding: 12,
  borderRadius: 10,
  background: '#fff7ed',
  color: '#92400e',
  marginTop: 6,
  border: '1px solid rgba(249, 207, 132, 0.28)'
};
