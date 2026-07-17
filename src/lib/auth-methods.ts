/**
 * 登录方式类型与解析。
 * 实际值由服务端从 env.AUTH_METHOD 读取，通过 props 注入到客户端组件，
 * 因此不在此文件做顶层 env 读取，避免把服务端 env 暴露给客户端。
 */
export type AuthMethod = 'email-password' | 'email-otp';

const VALID_METHODS = new Set<AuthMethod>(['email-password', 'email-otp']);

export function parseAuthMethod(raw: string | undefined): AuthMethod {
  const trimmed = raw?.trim() as AuthMethod | undefined;
  if (trimmed && VALID_METHODS.has(trimmed)) return trimmed;
  return 'email-otp';
}
