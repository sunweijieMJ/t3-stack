import { getContentTypes } from '@/server/services/content-public';
import AdminContentView from './index';

// 与 users/page.tsx 同理：内容类型清单存在 systemConfig 的 jsonb 里，是运行时值，
// 默认 SSG 会在构建期把它固化。必须按请求求值。
//
// 用服务端组件读取而不是新加一个 tRPC 接口：清单本身在 page.getFrontendConfig 里，
// 而那个接口要 config.manage —— editor 有 content.manage 却读不到，正是要避免的
// 「能进这个页面，却拿不到这个页面必需的数据」。这里在服务端直接读 service，
// 不经过权限门，也少一次客户端往返。
export const dynamic = 'force-dynamic';

export default async function AdminContentPage() {
  return <AdminContentView contentTypes={await getContentTypes()} />;
}
