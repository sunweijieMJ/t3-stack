import { getFrontendConfig } from '@/server/services/config';
import styles from './index.module.scss';

interface SocialLink {
  label: string;
  url: string;
}

function buildSocialLinks(
  social: Record<string, string> | undefined,
): SocialLink[] {
  if (!social) return [];
  const items: SocialLink[] = [];
  if (social.linkedin) items.push({ label: 'LinkedIn', url: social.linkedin });
  if (social.x) items.push({ label: 'X', url: social.x });
  if (social.youtube) items.push({ label: 'YouTube', url: social.youtube });
  if (social.weibo) items.push({ label: '微博', url: social.weibo });
  if (social.email)
    items.push({ label: social.email, url: `mailto:${social.email}` });
  return items;
}

export async function PortalFooter() {
  const cfg = await getFrontendConfig();
  const footer = cfg.footer ?? {};
  const tagline = footer.tagline || '';
  const address = footer.address || '';
  // 年份不能写死：上一版硬编码 '© 2026'，跨年后整站页脚就开始显示过期年份。
  // 本组件是 Server Component（非 'use client'），取值发生在服务端渲染时，
  // 不存在客户端时区不一致导致的 hydration mismatch；门户走 ISR（layout 里
  // revalidate = 60），跨年后最迟一分钟内自动更新。
  const copyright =
    footer.copyright || `© ${new Date().getFullYear()}. All Rights Reserved.`;
  const icp = footer.icp || '';
  const icpLink = footer.icpLink || 'https://beian.miit.gov.cn/';

  const socialLinks = buildSocialLinks(
    cfg.social as Record<string, string> | undefined,
  );

  return (
    <footer className={styles.footer} id="site-footer">
      <h2 className={styles.tagline}>{tagline}</h2>
      <div className={styles.right}>
        <div className={styles.info}>
          <div className={styles.address}>{address}</div>
          {socialLinks.length > 0 && (
            <div className={styles.social}>
              {socialLinks.map((s) => (
                <a
                  className={styles.socialLink}
                  href={s.url}
                  key={s.label}
                  rel="noreferrer"
                  target={s.url.startsWith('mailto:') ? undefined : '_blank'}
                >
                  {s.label}
                </a>
              ))}
            </div>
          )}
        </div>
        <p className={styles.copyright}>
          {copyright}
          {icp && (
            <>
              {' · '}
              <a
                className={styles.socialLink}
                href={icpLink}
                rel="noreferrer"
                target="_blank"
              >
                {icp}
              </a>
            </>
          )}
        </p>
      </div>
    </footer>
  );
}
