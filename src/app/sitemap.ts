import type { MetadataRoute } from 'next';
import { env } from '@/env';

const BASE_URL = env.BETTER_AUTH_URL ?? 'http://localhost:3000';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1.0,
    },
  ];
}
