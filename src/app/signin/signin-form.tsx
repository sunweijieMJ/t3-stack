'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { isOtpInvalidated, resolveAuthError } from '@/lib/auth-error';
import type { AuthMethod } from '@/lib/auth-methods';
import { safeInternalPath } from '@/lib/safe-path';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;

const inputClass =
  'w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10';

function useCountdown() {
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const start = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const reset = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCountdown(0);
  };

  return { countdown, start, reset };
}

function OtpBoxes({
  digits,
  onChange,
  idPrefix,
}: {
  digits: string[];
  onChange: (next: string[]) => void;
  idPrefix: string;
}) {
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    boxRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length > 1) {
      const next = [...digits];
      for (let i = 0; i < cleaned.length && index + i < OTP_LENGTH; i++) {
        next[index + i] = cleaned[i] ?? '';
      }
      onChange(next);
      boxRefs.current[
        Math.min(index + cleaned.length, OTP_LENGTH - 1)
      ]?.focus();
      return;
    }
    const next = [...digits];
    next[index] = cleaned;
    onChange(next);
    if (cleaned && index < OTP_LENGTH - 1) {
      boxRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      onChange(next);
      boxRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    const next = [...digits];
    for (let i = 0; i < pasted.length && i < OTP_LENGTH; i++) {
      next[i] = pasted[i] ?? '';
    }
    onChange(next);
    boxRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  const hiddenId = `${idPrefix}-otp-hidden`;

  return (
    <>
      <input
        autoComplete="one-time-code"
        className="sr-only"
        id={hiddenId}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '');
          if (!v) return;
          const next = Array(OTP_LENGTH).fill('') as string[];
          for (let i = 0; i < v.length && i < OTP_LENGTH; i++)
            next[i] = v[i] ?? '';
          onChange(next);
          boxRefs.current[Math.min(v.length, OTP_LENGTH - 1)]?.focus();
        }}
        tabIndex={-1}
        type="text"
      />
      <div className="flex justify-between gap-2" onPaste={handlePaste}>
        {digits.map((digit, i) => (
          <input
            aria-label={`验证码第 ${i + 1} 位`}
            className="h-12 w-12 flex-1 rounded-lg border border-gray-300 text-center font-semibold text-lg transition-colors focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            inputMode="numeric"
            key={i}
            maxLength={1}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            ref={(el) => {
              boxRefs.current[i] = el;
            }}
            type="text"
            value={digit}
          />
        ))}
      </div>
    </>
  );
}

function EmailPasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setError('邮箱格式不正确');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(resolveAuthError(result.error, '登录失败，请检查邮箱和密码'));
        return;
      }
      onSuccess();
    } catch {
      setError('操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-center text-red-600 text-sm">
          {error}
        </div>
      )}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            className="mb-1 block font-medium text-gray-700 text-sm"
            htmlFor="ep-email"
          >
            邮箱
          </label>
          <input
            autoComplete="email"
            className={inputClass}
            id="ep-email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="请输入邮箱"
            required
            type="email"
            value={email}
          />
        </div>
        <div>
          <label
            className="mb-1 block font-medium text-gray-700 text-sm"
            htmlFor="ep-password"
          >
            密码
          </label>
          <input
            autoComplete="current-password"
            className={inputClass}
            id="ep-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            required
            type="password"
            value={password}
          />
        </div>
        <button
          className="w-full rounded-lg bg-gray-900 px-4 py-2.5 font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading}
          type="submit"
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </>
  );
}

function EmailOtpForm({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState<'input' | 'code'>('input');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { countdown, start, reset } = useCountdown();
  const formRef = useRef<HTMLFormElement>(null);
  // 防止自动提交（验证码填满即触发 submit）与手动提交并发，导致同一验证码被二次消费而误报错误
  const submittingRef = useRef(false);
  const code = digits.join('');

  const updateDigits = useCallback((next: string[]) => {
    setDigits(next);
    if (next.every((d) => d !== '') && next.length === OTP_LENGTH) {
      setTimeout(() => {
        formRef.current?.dispatchEvent(
          new Event('submit', { cancelable: true, bubbles: true }),
        );
      }, 0);
    }
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setError('邮箱格式不正确');
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    setLoading(true);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'sign-in',
      });
      if (result.error) {
        setError(resolveAuthError(result.error, '发送失败，请稍后重试'));
        return;
      }
      setStep('code');
      start();
    } catch {
      setError('发送失败，请稍后重试');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== OTP_LENGTH) {
      setError('请输入验证码');
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    setLoading(true);
    try {
      const result = await authClient.signIn.emailOtp({ email, otp: code });
      if (result.error) {
        setError(resolveAuthError(result.error, '验证码错误，请重试'));
        // 验证码已被服务端作废（错误次数过多/过期/失效）：清空旧码并放开「重新获取」，
        // 否则用户会卡在已失效的旧码上一直提示「不正确」。
        if (isOtpInvalidated(result.error)) {
          setDigits(Array(OTP_LENGTH).fill(''));
          reset();
        }
        return;
      }
      onSuccess();
    } catch {
      setError('验证失败，请稍后重试');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <>
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-center text-red-600 text-sm">
          {error}
        </div>
      )}
      {step === 'input' ? (
        <form className="space-y-4" onSubmit={handleSend}>
          <div>
            <label
              className="mb-1 block font-medium text-gray-700 text-sm"
              htmlFor="eo-email"
            >
              邮箱
            </label>
            <input
              autoComplete="email"
              className={inputClass}
              id="eo-email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="请输入邮箱"
              required
              type="email"
              value={email}
            />
          </div>
          <button
            className="w-full rounded-lg bg-gray-900 px-4 py-2.5 font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading}
            type="submit"
          >
            {loading ? '发送中...' : '获取验证码'}
          </button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={handleVerify} ref={formRef}>
          <p className="mb-2 text-center text-gray-500 text-sm">
            验证码已发送至 {email}
          </p>
          <div>
            <label
              className="mb-2 block font-medium text-gray-700 text-sm"
              htmlFor="eo-otp-hidden"
            >
              验证码
            </label>
            <OtpBoxes digits={digits} idPrefix="eo" onChange={updateDigits} />
          </div>
          <button
            className="w-full rounded-lg bg-gray-900 px-4 py-2.5 font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading}
            type="submit"
          >
            {loading ? '验证中...' : '验证'}
          </button>
          <button
            className="w-full text-center text-gray-400 text-sm disabled:opacity-40"
            disabled={countdown > 0}
            onClick={() => {
              setStep('input');
              setDigits(Array(OTP_LENGTH).fill(''));
              setError('');
              reset();
            }}
            type="button"
          >
            {countdown > 0 ? `${countdown}s 后重发` : '重新发送'}
          </button>
        </form>
      )}
    </>
  );
}

const subtitleMap: Record<string, string> = {
  'email-password': '使用邮箱密码登录',
  'email-otp': '使用邮箱验证码登录',
};

interface SignInFormProps {
  authMethod: AuthMethod;
  siteName: string;
  /** basic.defaultPage —— 无 callbackUrl 时的登录后落点，由服务端读配置注入 */
  defaultPage: string;
}

function SignInFormInner({
  authMethod,
  siteName,
  defaultPage,
}: SignInFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 优先级：callbackUrl（用户本来想去的页面）→ 后台配置的默认页面 → 首页。
  // callbackUrl 来自 URL 查询串（攻击者可控），defaultPage 来自后台配置
  // （只有管理员可写），两者都要过 safeInternalPath 这道开放重定向防护。
  const callbackUrl =
    safeInternalPath(searchParams.get('callbackUrl')) ??
    safeInternalPath(defaultPage) ??
    '/';

  const handleSuccess = () => {
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link className="font-bold text-3xl text-gray-900" href="/">
            {siteName}
          </Link>
        </div>
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          <h1 className="mb-2 text-center font-semibold text-2xl text-gray-900">
            登录
          </h1>
          <p className="mb-6 text-center text-gray-500 text-sm">
            {subtitleMap[authMethod]}
          </p>
          {authMethod === 'email-password' && (
            <EmailPasswordForm onSuccess={handleSuccess} />
          )}
          {authMethod === 'email-otp' && (
            <EmailOtpForm onSuccess={handleSuccess} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function SignInForm(props: SignInFormProps) {
  return (
    <Suspense>
      <SignInFormInner {...props} />
    </Suspense>
  );
}
