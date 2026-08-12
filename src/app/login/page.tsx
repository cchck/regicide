'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DecoButton from '@/components/DecoButton';
import Flourish from '@/components/Flourish';

// Where to land after signing in. Read from the URL rather than useSearchParams so the
// page needs no Suspense boundary. Only same-site paths are honoured — an absolute URL
// here would be an open redirect (a share link could bounce someone off to any site).
function nextPath(): string {
  if (typeof window === 'undefined') return '/';
  const raw = new URLSearchParams(window.location.search).get('next');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const isSignup = mode === 'signup';
    // Normalised here too, purely so the field and the record agree on screen. The server
    // does the same on both signup and sign-in and is the authority — this is not what
    // makes case-insensitive login work.
    const emailNorm = email.trim().toLowerCase();
    try {
      if (isSignup) {
        const res = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailNorm, password, displayName }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || `注册失败（HTTP ${res.status}）`);
          setBusy(false);
          return;
        }
      }
      const result = await signIn('credentials', { email: emailNorm, password, redirect: false });
      if (result?.error) {
        // Distinguish "just signed up but auto-login failed" from a plain signin failure —
        // the first case is misleading otherwise (account IS created, but user sees "password wrong").
        setError(
          isSignup
            ? '账号已创建，但自动登录失败，请切换到"登录"重试'
            : '邮箱或密码不正确',
        );
        setBusy(false);
        if (isSignup) setMode('signin');
        return;
      }
      router.push(nextPath());
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setError(`网络错误：${msg}`);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 py-10 relative overflow-hidden">
      {/* Ambient background wash — faint blood glow above, teal below */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(170,17,17,0.10) 0%, transparent 60%),' +
            'radial-gradient(ellipse 80% 50% at 50% 100%, rgba(42,138,138,0.05) 0%, transparent 60%)',
        }}
      />
      <div className="fixed top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blood-dim to-transparent" />
      <div className="fixed bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blood-dim to-transparent" />

      <div className="relative w-full max-w-2xl">
        {/* Title */}
        <div className="text-center mb-12 slide-up">
          <div className="flex items-center justify-center gap-4 mb-5">
            <div className="w-20 sm:w-28 h-px bg-gradient-to-r from-transparent to-blood-dim" />
            <Flourish />
          </div>
          <h1
            className="font-gothic text-cracked text-6xl sm:text-7xl tracking-[8px] sm:tracking-[12px] mb-4 leading-none"
            style={{
              backgroundImage: 'linear-gradient(180deg, #f0ece4 0%, #c49a30 35%, #aa1111 75%, #4a0808 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.8))',
            }}
          >
            REGICIDE
          </h1>
          <p className="font-gothic text-cracked text-3xl sm:text-4xl tracking-[10px] text-blood uppercase">弑 君</p>
          <div className="flex items-center justify-center gap-4 mt-5">
            <Flourish flip />
            <div className="w-20 sm:w-28 h-px bg-gradient-to-l from-transparent to-blood-dim" />
          </div>
        </div>

        {/* Form frame — corner brackets + inset double border, echoing card art */}
        <form
          onSubmit={handleSubmit}
          className="relative border border-border/70 bg-abyss/70 backdrop-blur-sm px-8 sm:px-14 py-12 sm:py-14 fade-in-up"
          style={{ animationDelay: '150ms' }}
        >
          {/* Corner brackets */}
          <span className="absolute top-2 left-2 w-6 h-6 border-t border-l border-blood/80" />
          <span className="absolute top-2 right-2 w-6 h-6 border-t border-r border-blood/80" />
          <span className="absolute bottom-2 left-2 w-6 h-6 border-b border-l border-blood/80" />
          <span className="absolute bottom-2 right-2 w-6 h-6 border-b border-r border-blood/80" />
          {/* Inset inner frame — the card-art double-border motif */}
          <span className="absolute inset-3 border border-border-subtle/60 pointer-events-none" />

          {/* Mode toggle */}
          <div className="flex items-center justify-center gap-8 mb-10">
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(null); }}
              className={
                'relative pb-2.5 text-lg sm:text-xl tracking-[8px] font-display uppercase transition-all duration-200 ' +
                (mode === 'signin' ? 'text-blood-glow' : 'text-text-muted hover:text-text-secondary')
              }
            >
              登 录
              {mode === 'signin' && (
                <span
                  className="absolute -bottom-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-blood-glow to-transparent"
                  style={{ boxShadow: '0 0 8px rgba(221,34,34,0.6)' }}
                />
              )}
            </button>
            <div
              className="w-2 h-2 rotate-45"
              style={{ background: '#2a2a3a', boxShadow: 'inset 0 0 2px rgba(0,0,0,0.6)' }}
            />
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null); }}
              className={
                'relative pb-2.5 text-lg sm:text-xl tracking-[8px] font-display uppercase transition-all duration-200 ' +
                (mode === 'signup' ? 'text-blood-glow' : 'text-text-muted hover:text-text-secondary')
              }
            >
              注 册
              {mode === 'signup' && (
                <span
                  className="absolute -bottom-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-blood-glow to-transparent"
                  style={{ boxShadow: '0 0 8px rgba(221,34,34,0.6)' }}
                />
              )}
            </button>
          </div>

          {/* Fields */}
          <div className="flex flex-col gap-7">
            {mode === 'signup' && (
              <Field label="昵 称" name="displayName" value={displayName} onChange={setDisplayName} required autoComplete="nickname" />
            )}
            <Field label="邮 箱" name="email" type="email" value={email} onChange={setEmail} required autoComplete="email" />
            <Field
              label="密 码"
              name="password"
              type="password"
              value={password}
              onChange={setPassword}
              required
              minLength={6}
              hint={mode === 'signup' ? '至少 6 位' : undefined}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
            {/* Said plainly, because it is true and the consequence is permanent. There is
                no reset flow — deliberately, for now — so a forgotten password is a lost
                account, and the player deserves to know that before they pick one. */}
            {mode === 'signup' && (
              <p className="-mt-3 text-[11px] tracking-[2px] text-amber/80 font-display leading-relaxed">
                密码无法找回，请务必记牢或让浏览器保存
              </p>
            )}
          </div>

          {/* Error banner — styled like an inline plaque, not a raw browser alert */}
          {error && (
            <div
              className="mt-8 border-t border-b border-blood/60 bg-blood-surface/70 px-4 py-3 text-center fade-in"
              style={{ boxShadow: 'inset 0 0 20px rgba(170,17,17,0.15)' }}
            >
              <p className="text-blood-glow text-sm tracking-[3px] font-display">{error}</p>
            </div>
          )}

          {/* Submit — deliberate breathing room from the last input */}
          <div className="mt-14">
            <DecoButton color="blood" size="lg" fullWidth disabled={busy}>
              {busy ? '请 稍 候' : mode === 'signin' ? '入   场' : '签 订 契 约'}
            </DecoButton>
          </div>
        </form>

        {/* Guest entry — the "back door" for casual play */}
        <div className="text-center mt-10 fade-in-up" style={{ animationDelay: '400ms' }}>
          <div className="flex items-center justify-center gap-4 text-text-muted">
            <div className="w-14 sm:w-20 h-px bg-gradient-to-r from-transparent to-border" />
            <button
              type="button"
              onClick={() => router.push('/')}
              className="text-sm tracking-[5px] uppercase font-display hover:text-text-secondary transition-colors"
            >
              以 访 客 身 份 入 场
            </button>
            <div className="w-14 sm:w-20 h-px bg-gradient-to-l from-transparent to-border" />
          </div>
          <p className="text-xs text-text-dim tracking-[4px] font-display mt-4 uppercase">
            未登录时不记录筹码 · 无法上榜
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = 'text',
  value,
  onChange,
  required,
  minLength,
  hint,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  /**
   * Passed in rather than derived from `type`, because the right token depends on which
   * form this is. Deriving it hardcoded every password box to `current-password`, and on
   * the signup form that actively suppresses the browser's offer to save or generate one —
   * which matters more here than in most apps: with no reset flow, the password the
   * browser stores is the only copy that survives the player forgetting it.
   */
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
  hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <label
          htmlFor={name}
          className="flex items-center gap-2.5 text-sm tracking-[6px] text-text-secondary uppercase font-display"
        >
          {/* Diamond marker — moved out of the input so it can't overlap the typed text */}
          <span
            className="inline-block w-2 h-2 rotate-45 transition-all duration-200"
            style={{
              background: focused ? '#dd2222' : '#2a2a3a',
              boxShadow: focused ? '0 0 8px rgba(221,34,34,0.7)' : 'none',
            }}
          />
          {label}
        </label>
        {hint && <span className="text-xs tracking-[3px] text-text-dim font-display">{hint}</span>}
      </div>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={type}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete={autoComplete}
          className="w-full bg-black/55 border text-text-bright px-5 py-4 text-base tracking-[2px] font-display outline-none transition-all duration-200"
          style={{
            borderColor: focused ? '#aa1111' : '#2a2a3a',
            boxShadow: focused
              ? '0 0 22px rgba(170,17,17,0.15), inset 0 0 14px rgba(0,0,0,0.4)'
              : 'inset 0 0 10px rgba(0,0,0,0.4)',
          }}
        />
        {/* Focus underline — sweeps in from center */}
        <span
          className="absolute -bottom-px left-1/2 h-px bg-blood-glow transition-all duration-300 origin-center"
          style={{
            width: focused ? '100%' : '0',
            transform: 'translateX(-50%)',
            boxShadow: focused ? '0 0 6px rgba(221,34,34,0.5)' : 'none',
          }}
        />
      </div>
    </div>
  );
}
