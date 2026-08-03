import dayjs from 'dayjs';
import Link from 'next/link';
import { listPublishedContent } from '@/server/services/content-public';
import styles from './content.module.scss';

// 可见性取决于当前登录用户的角色，不能沿用 portal layout 的 ISR ——
// 缓存下来的页面会把某个角色看到的内容原样发给其他人。
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function ContentListPage({
  params,
  searchParams,
}: PageProps) {
  const { type } = await params;
  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Number(rawPage) || 1);

  const { rows, total, pageSize } = await listPublishedContent({ type, page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={styles.wrap}>
      <h1 className={styles.heading}>{type}</h1>

      {rows.length === 0 ? (
        <p className={styles.empty}>暂无内容</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li className={styles.item} key={row.id}>
              <Link
                className={styles.itemLink}
                href={`/content/${type}/${row.slug}`}
              >
                <div className={styles.itemMain}>
                  <h2 className={styles.itemTitle}>
                    {row.pinned && <span className={styles.pin}>置顶</span>}
                    {row.title}
                  </h2>
                  {row.summary && (
                    <p className={styles.itemSummary}>{row.summary}</p>
                  )}
                </div>
                {row.publishedAt && (
                  <time className={styles.itemDate}>
                    {dayjs(row.publishedAt).format('YYYY-MM-DD')}
                  </time>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className={styles.pager}>
          {page > 1 && (
            <Link href={`/content/${type}?page=${page - 1}`}>上一页</Link>
          )}
          <span>
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/content/${type}?page=${page + 1}`}>下一页</Link>
          )}
        </nav>
      )}
    </div>
  );
}
