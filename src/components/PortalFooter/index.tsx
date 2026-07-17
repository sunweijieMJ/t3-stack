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
  const copyright = footer.copyright || '© 2026. All Rights Reserved.';
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
