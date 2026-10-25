'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthApiError, AuthResult, authService } from '@/services/authService';

type Mode = 'signin' | 'signup' | 'verify' | 'forgot' | 'reset';

const TITLES: Record<Mode, { title: string; subtitle: string }> = {
  signin: { title: 'Sign in', subtitle: 'Welcome back. Sign in to manage your virtual tours.' },
  signup: { title: 'Create your account', subtitle: 'We will email you a code to verify your address.' },
  verify: { title: 'Check your email', subtitle: 'Enter the 6-digit code we sent to' },
  forgot: { title: 'Reset your password', subtitle: 'Enter your email and we will send you a code.' },
  reset: { title: 'Set a new password', subtitle: 'Enter the 6-digit code we sent to' },
};

const inputClass =
  'block w-full px-3 py-2.5 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth, isAuthenticated, isLoading } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.push('/admin/tours');
  }, [isAuthenticated, isLoading, router]);

  // Countdown before "Resend code" is allowed (matches the server's 60 s cooldown)
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const go = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setCode('');
    if (next === 'signin' || next === 'signup') setPassword('');
  };

  const finish = (result: AuthResult) => {
    setAuth(result.token, result.user);
    router.push('/admin/tours');
  };

  const run = async (action: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    switch (mode) {
      case 'signin':
        return run(async () => {
          try {
            finish(await authService.login(email, password));
          } catch (err) {
            if (err instanceof AuthApiError && err.code === 'email_not_verified') {
              setMode('verify');
              setResendIn(60);
              setNotice('Your email is not verified yet. We sent you a new code.');
              return;
            }
            if (err instanceof AuthApiError && err.code === 'password_not_set') {
              setMode('forgot');
              setNotice('Your account was moved to the new sign-in. Set a password with an emailed code to continue.');
              return;
            }
            throw err;
          }
        });
      case 'signup':
        return run(async () => {
          await authService.register(name, email, password);
          setMode('verify');
          setResendIn(60);
        });
      case 'verify':
        return run(async () => finish(await authService.verifyEmail(email, code)));
      case 'forgot':
        return run(async () => {
          await authService.forgotPassword(email);
          setMode('reset');
          setPassword('');
          setResendIn(60);
          setNotice('If an account exists for this email, a code is on its way.');
        });
      case 'reset':
        return run(async () => finish(await authService.resetPassword(email, code, password)));
    }
  };

  const resend = () =>
    run(async () => {
      await authService.resendCode(email, mode === 'reset' ? 'reset_password' : 'verify_email');
      setResendIn(60);
      setNotice('We sent you a new code.');
    });

  const { title, subtitle } = TITLES[mode];
  const needsCode = mode === 'verify' || mode === 'reset';
  const needsPassword = mode === 'signin' || mode === 'signup' || mode === 'reset';
  const submitLabel = {
    signin: loading ? 'Signing in...' : 'Sign in',
    signup: loading ? 'Creating account...' : 'Create account',
    verify: loading ? 'Verifying...' : 'Verify email',
    forgot: loading ? 'Sending code...' : 'Send code',
    reset: loading ? 'Saving...' : 'Save password and sign in',
  }[mode];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full p-6 sm:p-8 bg-white rounded-xl shadow-sm">
        {(mode === 'signin' || mode === 'signup') && (
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
            {(['signin', 'signup'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => go(tab)}
                className={`py-2 rounded-md text-sm font-medium cursor-pointer ${mode === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {tab === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>
        )}

        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {subtitle}
          {needsCode && <span className="font-medium text-gray-900"> {email}</span>}
        </p>

        {notice && <p className="mt-4 rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">{notice}</p>}
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input id="name" type="text" autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Your name" />
            </div>
          )}

          {!needsCode && (
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" />
            </div>
          )}

          {needsCode && (
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">6-digit code</label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={`${inputClass} text-center text-2xl tracking-[0.5em] font-mono`}
                placeholder="------"
              />
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-gray-500">The code expires in 10 minutes.</span>
                <button
                  type="button"
                  onClick={resend}
                  disabled={resendIn > 0 || loading}
                  className="font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400 cursor-pointer disabled:cursor-not-allowed"
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                </button>
              </div>
            </div>
          )}

          {needsPassword && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  {mode === 'reset' ? 'New password' : 'Password'}
                </label>
                {mode === 'signin' && (
                  <button type="button" onClick={() => go('forgot')} className="text-sm font-medium text-blue-600 hover:text-blue-700 cursor-pointer">
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  minLength={mode === 'signin' ? undefined : 8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-12`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <Icon icon={showPassword ? 'mdi:eye-off' : 'mdi:eye'} className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                </button>
              </div>
              {mode !== 'signin' && <p className="mt-1 text-xs text-gray-500">At least 8 characters.</p>}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (needsCode && code.length !== 6)}
            className="w-full flex justify-center py-2.5 px-4 text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitLabel}
          </button>
        </form>

        {(needsCode || mode === 'forgot') && (
          <button type="button" onClick={() => go('signin')} className="mt-4 w-full text-sm font-medium text-gray-600 hover:text-gray-900 cursor-pointer">
            ← Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
