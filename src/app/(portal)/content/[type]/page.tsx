import dayjs from 'dayjs';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  clampPage,
  getContentType,
  listPublishedCategories,
  listPublishedContent,
} from '@/server/services/content-public';
import styles from './content.module.scss';

// 可见性取决于当前登录用户的角色，不能沿用 portal layout 的 ISR ——
// 缓存下来的页面会把某个角色看到的内容原样发给其他人。
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ page?: string; category?: string }>;
}

/** 保留当前分类地翻页；分类为空时不留一个空的 ?category= 在 URL 上 */
function pageHref(type: string, page: number, category?: string) {
  const qs = new URLSearchParams({ page: String(page) });
  if (category) qs.set('category', category);
  return `/content/${type}?${qs.toString()}`;
}

export default async function ContentListPage({
  params,
  searchParams,
}: PageProps) {
  const { type } = await params;
  const { page: rawPage, category: rawCategory } = await searchParams;
  // 空串按「未选择分类」处理：?category= 这种空参数在手工改 URL 或表单提交时
  // 很常见，传给 service 会去查一个 slug='' 的分类，白跑一趟。
  //
  // 切换分类会自然回到第 1 页 —— 下面的分类链接只带 ?category=，不带 page。
  // 这是有意的：停在第 5 页切到一个只有 2 页的分类会得到空列表，而页面上没有
  // 任何东西提示「你在一个不存在的页码上」。
  const category = rawCategory?.trim() || undefined;
  // 用与 listPublishedContent 同一套收敛：这里的 page 还要参与分页器渲染，
  // 沿用旧的 `Number(rawPage) || 1` 会让 ?page=Infinity 渲染出「Infinity / 3」。
  const page = clampPage(rawPage);

  // 未在后台登记的类型一律 404：不校验的话 /content/任意字符串 都会渲染出
  // 一个空列表页并把原始 slug 当标题，既是 SEO 垃圾页，也让类型名打错这种
  // 失误毫无提示。
  const contentType = await getContentType(type);
  if (!contentType) notFound();

  const [{ rows, total, pageSize }, categories] = await Promise.all([
    listPublishedContent({ type, page, categorySlug: category }),
    listPublishedCategories(type),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={styles.wrap}>
      <h1 className={styles.heading}>{contentType.label}</h1>

      {/* 只有真的存在分类时才渲染这一行。一个只有「全部」的筛选条是纯噪声，
          而绝大多数站点在起步阶段一个分类都没建。 */}
      {categories.length > 0 && (
        <nav className={styles.categoryBar}>
          <Link
            className={category ? styles.categoryLink : styles.categoryActive}
            href={`/content/${type}`}
          >
            全部
          </Link>
          {categories.map((c) => (
            <Link
              className={
                c.slug === category
                  ? styles.categoryActive
                  : styles.categoryLink
              }
              href={`/content/${type}?category=${encodeURIComponent(c.slug)}`}
              key={c.id}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      )}

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
            <Link href={pageHref(type, page - 1, category)}>上一页</Link>
          )}
          <span>
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={pageHref(type, page + 1, category)}>下一页</Link>
          )}
        </nav>
      )}
    </div>
  );
}
