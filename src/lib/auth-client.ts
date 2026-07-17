import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// 客户端总是挂载 emailOTPClient 插件 —— 它仅是 SDK 方法，
// 实际是否启用 OTP 流程由 SignInForm 的 authMethod prop（来自服务端 env）决定。
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});

export type Session = typeof authClient.$Infer.Session;
