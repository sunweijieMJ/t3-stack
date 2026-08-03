import dayjs from 'dayjs';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getContentType,
  getPublishedContentBySlug,
} from '@/server/services/content-public';
import styles from '../content.module.scss';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ type: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { type, slug } = await params;
  const row = await getPublishedContentBySlug(type, slug);
  if (!row) return {};
  return {
    title: row.title,
    description: row.summary ?? undefined,
  };
}

export default async function ContentDetailPage({ params }: PageProps) {
  const { type, slug } = await params;
  // 类型未登记时直接 404，与列表页保持一致
  if (!(await getContentType(type))) notFound();

  const row = await getPublishedContentBySlug(type, slug);
  // 不可见与不存在都走 404：区分开会让这个页面变成「该 slug 是否存在」的探测器
  if (!row) notFound();

  return (
    <article className={styles.wrap}>
      <h1 className={styles.heading}>{row.title}</h1>
      {row.publishedAt && (
        <time className={styles.detailDate}>
          {dayjs(row.publishedAt).format('YYYY-MM-DD HH:mm')}
        </time>
      )}
      {/* 正文是写入时已经过 sanitizeContentHtml 净化的 HTML，见 lib/content-html.ts。
          净化在写入侧完成，此处不再重复处理；新增写入口时务必接上净化。 */}
      <div
        className={styles.body}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: 正文为写入侧已净化的富文本
        dangerouslySetInnerHTML={{ __html: row.body }}
      />
    </article>
  );
}
