import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './no-access.module.scss';

export const metadata: Metadata = {
  title: '无访问权限',
  robots: { index: false, follow: false },
};

/**
 * 权限不足的落地页。
 *
 * 此前 proxy 与 admin/layout 在权限不足时直接 redirect('/')，用户看到的是
 * 「登录成功了，然后莫名其妙回到首页」——没有任何线索说明发生了什么，
 * 也无从判断是登录失败、还是权限不够、还是跳转配错了。本项目线上排查这个
 * 现象花了好几轮，绝大部分成本都在「分不清是哪一种」上。
 *
 * 刻意不写成 403 状态码页：用户是**已登录**的合法用户，只是没有后台权限，
 * 这是一次正常的产品分支而非错误。
 */
export default function NoAccessPage() {
  return (
    <div className={styles.wrap}>
      <p className={styles.eyebrow}>Access denied</p>
      <h1 className={styles.title}>当前账号无权访问后台</h1>
      <p className={styles.desc}>
        你已经登录成功，但这个账号没有进入管理后台的权限。
      </p>
      <p className={styles.hint}>
        若你确认自己应当是管理员，请让站点维护者检查：账号在数据库中的角色是否为
        admin，或其邮箱是否已加入 <code>ADMIN_EMAILS</code> 白名单。部署在
        Vercel 时，注意环境变量按 Production / Preview / Development
        分别存储，改完需要重新部署才会生效。
      </p>
      <Link className={styles.back} href="/">
        返回首页
      </Link>
    </div>
  );
}
