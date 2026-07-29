'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { isOtpInvalidated, resolveAuthError } from '@/lib/auth-error';
import type { AuthMethod } from '@/lib/auth-methods';
import { Atmosphere } from './atmosphere';
import styles from './signin.module.scss';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;
const EASE = [0.3, 0.26, 0.38, 1] as const;

// ==================== 通用零件 ====================

/** 输入框外壳：聚焦时标签变色 + 下划线从中间展开 */
function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: (bind: {
    id: string;
    onFocus: () => void;
    onBlur: () => void;
    className: string;
  }) => React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const reduced = useReducedMotion();

  return (
    <div className={`${styles.field} ${focused ? styles.fieldFocused : ''}`}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      <div className={styles.inputWrap}>
        {children({
          id,
          onFocus: () => setFocused(true),
          onBlur: () => setFocused(false),
          className: styles.input ?? '',
        })}
        <motion.span
          animate={{ scaleX: focused ? 1 : 0 }}
          className={styles.inputUnderline}
          initial={false}
          transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE }}
        />
      </div>
    </div>
  );
}

/** 错误提示：高度与透明度联动展开，避免出现/消失时整块表单跳动 */
function Alert({ message }: { message: string }) {
  const reduced = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          animate={{ height: 'auto', opacity: 1 }}
          className={styles.alert}
          exit={{ height: 0, opacity: 0 }}
          initial={reduced ? false : { height: 0, opacity: 0 }}
          role="alert"
          transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }}
        >
          <div className={styles.alertInner}>
            <span className={styles.alertDot} />
            <span>{message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 提交按钮：空闲时高光循环扫过，loading 时转圈并禁用 */
function Submit({
  loading,
  loadingText,
  children,
}: {
  loading: boolean;
  loadingText: string;
  children: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.button
      className={styles.submit}
      disabled={loading}
      initial={false}
      type="submit"
      whileHover={reduced || loading ? undefined : { y: -2 }}
      whileTap={reduced || loading ? undefined : { y: 0, scale: 0.99 }}
    >
      {!reduced && !loading && (
        <motion.span
          animate={{ x: ['-160%', '260%'] }}
          className={styles.submitSheen}
          transition={{
            duration: 1.4,
            repeat: Number.POSITIVE_INFINITY,
            repeatDelay: 2.6,
            ease: 'easeInOut',
          }}
        />
      )}
      {loading && (
        <motion.span
          animate={{ rotate: 360 }}
          className={styles.spinner}
          transition={{
            duration: 0.8,
            repeat: Number.POSITIVE_INFINITY,
            ease: 'linear',
          }}
        />
      )}
      {loading ? loadingText : children}
    </motion.button>
  );
}

/** 登录成功过场。与 router.push 同时播放，不额外拖慢跳转。 */
function SuccessOverlay() {
  const reduced = useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className={styles.success}
      initial={reduced ? false : { opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        animate={{ scale: 1 }}
        className={styles.successRing}
        initial={reduced ? false : { scale: 0.6 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="22"
          viewBox="0 0 24 24"
          width="22"
        >
          <motion.path
            animate={{ pathLength: 1 }}
            d="M4 12.5 L9.5 18 L20 6.5"
            initial={reduced ? false : { pathLength: 0 }}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            transition={{ duration: 0.5, delay: 0.12, ease: EASE }}
          />
        </svg>
      </motion.div>
      <p className={styles.successText}>Signed in</p>
    </motion.div>
  );
}

// ==================== 验证码输入 ====================

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
  const reduced = useReducedMotion();

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
      return;
    }
    // 左右方向键在格子间移动 —— 六格验证码的通用交互预期，原实现没有
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      boxRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      e.preventDefault();
      boxRefs.current[index + 1]?.focus();
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

  return (
    <>
      {/* 系统级验证码自动填充的落点：浏览器只认单个 autocomplete="one-time-code"
          输入框，拆成六格就拿不到这个能力。它对读屏隐藏、不可 Tab 到，
          收到值后立刻分发到六个格子。 */}
      <input
        aria-hidden="true"
        autoComplete="one-time-code"
        className={styles.srOnly}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '');
          // 读完即清空：否则同一个验证码第二次自动填充时 value 没有变化，
          // onChange 不触发，用户会以为自动填充失灵。
          e.target.value = '';
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
      <div className={styles.otpRow} onPaste={handlePaste}>
        {digits.map((digit, i) => (
          <motion.input
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            aria-label={`验证码第 ${i + 1} 位`}
            className={`${styles.otpBox} ${digit ? styles.otpBoxFilled : ''}`}
            // label 指向第一格（而非隐藏的自动填充框），点标签能真正落到可见输入上
            id={i === 0 ? `${idPrefix}-otp` : undefined}
            initial={reduced ? undefined : { opacity: 0, y: 10 }}
            inputMode="numeric"
            key={i}
            maxLength={1}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            ref={(el: HTMLInputElement | null) => {
              boxRefs.current[i] = el;
            }}
            transition={{ duration: 0.35, delay: i * 0.045, ease: EASE }}
            type="text"
            value={digit}
          />
        ))}
      </div>
    </>
  );
}

// ==================== 倒计时 ====================

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

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCountdown(0);
  }, []);

  return { countdown, start, reset };
}

// ==================== 邮箱 + 密码 ====================

function EmailPasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
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
        setLoading(false);
        return;
      }
      // 成功分支刻意不复位 loading：router.push 是异步的，按钮若立刻恢复可点，
      // 用户会在等待跳转的空档里再点一次，白白多打一次登录接口。
      onSuccess();
    } catch {
      setError('操作失败，请重试');
      setLoading(false);
    }
  };

  return (
    <>
      <Alert message={error} />
      <form className={styles.form} onSubmit={handleSubmit}>
        <Field id="ep-email" label="Email">
          {(bind) => (
            <input
              autoComplete="email"
              placeholder="you@example.com"
              required
              type="email"
              value={email}
              {...bind}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>

        <Field id="ep-password" label="Password">
          {(bind) => (
            <>
              <input
                autoComplete="current-password"
                placeholder="请输入密码"
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                {...bind}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                className={styles.passwordToggle}
                onClick={() => setShowPassword((v) => !v)}
                type="button"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </>
          )}
        </Field>

        <Submit loading={loading} loadingText="Signing in">
          Sign in
        </Submit>
      </form>
    </>
  );
}

// ==================== 邮箱验证码 ====================

function EmailOtpForm({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState<'input' | 'code'>('input');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { countdown, start, reset } = useCountdown();
  const reduced = useReducedMotion();
  // 防止「填满自动提交」与「手动点提交」并发，导致同一验证码被消费两次而误报错误
  const submittingRef = useRef(false);

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

  // 验证码由参数传入而不是从 state 读：「填满即提交」发生在 setDigits 之后的同一个
  // 事件回调里，此时闭包里的 digits 还是旧值（少最后一位）。
  const verify = useCallback(
    async (code: string) => {
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
          // 验证码已被服务端作废（错误次数过多 / 过期 / 不存在）：清空旧码并放开
          // 「重新发送」，否则用户会卡在已失效的旧码上一直提示「不正确」。
          if (isOtpInvalidated(result.error)) {
            setDigits(Array(OTP_LENGTH).fill(''));
            reset();
          }
          setLoading(false);
          return;
        }
        onSuccess(); // 同上：成功后保持 loading，等路由切走
      } catch {
        setError('验证失败，请稍后重试');
        setLoading(false);
      } finally {
        submittingRef.current = false;
      }
    },
    [email, onSuccess, reset],
  );

  const updateDigits = useCallback(
    (next: string[]) => {
      setDigits(next);
      if (next.length === OTP_LENGTH && next.every((d) => d !== '')) {
        // 直接调用，而不是像原实现那样往 form 上 dispatch 一个合成 submit 事件：
        // 少一层 DOM 事件往返，也不再依赖「setState 已 flush」这个时序假设。
        void verify(next.join(''));
      }
    },
    [verify],
  );

  const slide = reduced
    ? {}
    : {
        initial: { opacity: 0, x: 24 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -24 },
        transition: { duration: 0.35, ease: EASE },
      };

  return (
    <>
      <Alert message={error} />
      <AnimatePresence initial={false} mode="wait">
        {step === 'input' ? (
          <motion.form
            className={styles.form}
            key="input"
            onSubmit={handleSend}
            {...slide}
          >
            <Field id="eo-email" label="Email">
              {(bind) => (
                <input
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={email}
                  {...bind}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            <Submit loading={loading} loadingText="Sending">
              Get code
            </Submit>
          </motion.form>
        ) : (
          <motion.form
            className={styles.form}
            key="code"
            onSubmit={(e) => {
              e.preventDefault();
              void verify(digits.join(''));
            }}
            {...slide}
          >
            <p className={styles.otpHint}>
              验证码已发送至 <span className={styles.otpHintMail}>{email}</span>
            </p>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="eo-otp">
                Verification code
              </label>
              <OtpBoxes digits={digits} idPrefix="eo" onChange={updateDigits} />
            </div>
            <Submit loading={loading} loadingText="Verifying">
              Verify
            </Submit>
            <button
              className={styles.ghost}
              disabled={countdown > 0}
              onClick={() => {
                setStep('input');
                setDigits(Array(OTP_LENGTH).fill(''));
                setError('');
                reset();
              }}
              type="button"
            >
              {countdown > 0
                ? `${countdown}s 后可重新发送`
                : '换个邮箱 / 重新发送'}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </>
  );
}

// ==================== 页面 ====================

const SUBTITLE: Record<AuthMethod, string> = {
  'email-password': '使用邮箱与密码登录',
  'email-otp': '输入邮箱获取一次性验证码',
};

export interface SignInFormProps {
  authMethod: AuthMethod;
  siteName: string;
  /** 登录后落点。已由服务端过 safeInternalPath 白名单：callbackUrl → 后台默认页 → / */
  redirectTo: string;
  /** basic.primaryColor，作为 --accent 注入；整页高亮（描边/光晕/极光）全部由它派生 */
  primaryColor: string;
}

export default function SignInForm({
  authMethod,
  siteName,
  redirectTo,
  primaryColor,
}: SignInFormProps) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [done, setDone] = useState(false);

  const handleSuccess = useCallback(() => {
    setDone(true);
    router.push(redirectTo);
    router.refresh();
  }, [router, redirectTo]);

  return (
    <div
      className={styles.page}
      style={{ '--accent': primaryColor } as React.CSSProperties}
    >
      <Atmosphere siteName={siteName} />

      <section className={styles.formSide}>
        <motion.div
          animate={reduced ? undefined : { opacity: 1, y: 0 }}
          className={styles.card}
          initial={reduced ? undefined : { opacity: 0, y: 18 }}
          transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
        >
          <div className={styles.cardHead}>
            <span className={styles.eyebrow}>Sign in</span>
            <h1 className={styles.title}>登录 {siteName}</h1>
            <p className={styles.subtitle}>{SUBTITLE[authMethod]}</p>
          </div>

          {authMethod === 'email-password' ? (
            <EmailPasswordForm onSuccess={handleSuccess} />
          ) : (
            <EmailOtpForm onSuccess={handleSuccess} />
          )}

          <AnimatePresence>{done && <SuccessOverlay />}</AnimatePresence>
        </motion.div>
      </section>
    </div>
  );
}
