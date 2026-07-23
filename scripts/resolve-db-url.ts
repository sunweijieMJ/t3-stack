/**
 * 启动期解析 DATABASE_URL，输出到 stdout 供 entrypoint 注入。
 *
 * 解析顺序：
 *   1. process.env.DATABASE_URL 直接给定 → 原样输出（本地 / 阿里云模式）
 *   2. 否则要求 DB_SECRET_ARN（AWS 模式）：
 *      - 从 Secrets Manager 取 SecretString（JSON，含 username/password 等）
 *      - 拼出 postgresql://user:password@host:port/dbname?sslmode=...
 *      - host/user/dbname 优先取容器 env，缺失时回退 secret 字段
 *
 * 失败时退码 1，错误写到 stderr。
 */

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

const stripQuotes = (v: string | undefined) =>
  v?.replace(/^["']|["']$/g, '') ?? '';

async function fetchSecret(arn: string): Promise<Record<string, string>> {
  const region = stripQuotes(process.env.AWS_REGION) || arn.split(':')[3];
  if (!region) {
    throw new Error('cannot derive AWS region from ARN or AWS_REGION env');
  }
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!res.SecretString) {
    throw new Error('SecretString is empty (binary secret not supported)');
  }
  return JSON.parse(res.SecretString);
}

async function main() {
  const direct = stripQuotes(process.env.DATABASE_URL);
  if (direct) {
    process.stdout.write(direct);
    return;
  }

  const arn = stripQuotes(process.env.DB_SECRET_ARN);
  if (!arn) {
    process.stderr.write(
      '[resolve-db-url] DATABASE_URL or DB_SECRET_ARN must be set\n',
    );
    process.exit(1);
  }

  let secret: Record<string, string>;
  try {
    secret = await fetchSecret(arn);
  } catch (err) {
    process.stderr.write(
      `[resolve-db-url] fetch secret failed: ${(err as Error).message}\n`,
    );
    process.exit(1);
    return;
  }

  const host = stripQuotes(process.env.DB_HOST) || secret.host;
  const port = stripQuotes(process.env.DB_PORT) || secret.port || '5432';
  const dbname =
    stripQuotes(process.env.DB_NAME) || secret.dbname || 'postgres';
  const user = stripQuotes(process.env.DB_USER) || secret.username;
  const password = secret.password;
  const sslmode = stripQuotes(process.env.DB_SSLMODE) || 'require';

  // 用组合条件而非 missing 数组做守卫：这样 TS 能把 host/user/password 收窄为
  // 非空 string，后续拼接无需非空断言（!）。
  if (!host || !user || !password) {
    const missing: string[] = [];
    if (!host) missing.push('host');
    if (!user) missing.push('user');
    if (!password) missing.push('password');
    process.stderr.write(
      `[resolve-db-url] missing required field(s): ${missing.join(', ')}\n`,
    );
    process.exit(1);
    return;
  }

  const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${dbname}?sslmode=${sslmode}`;
  process.stdout.write(url);
}

main().catch((err) => {
  process.stderr.write(
    `[resolve-db-url] unexpected: ${(err as Error).stack || err}\n`,
  );
  process.exit(1);
});
