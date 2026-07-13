import type { MetadataRoute } from 'next'

// Хайлтын crawler-уудад: маркетингийн хуудсуудыг индексжүүл,
// нэвтрэлт шаардсан/дотоод хэсгүүдийг бүү оролд
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/super', '/orders', '/batch', '/api/', '/login', '/register', '/forgot-password'],
    },
    sitemap: 'https://www.aicargo.mn/sitemap.xml',
  }
}
