import type { MetadataRoute } from 'next'

// Хайлтын crawler-уудад: маркетингийн хуудсуудыг индексжүүл,
// нэвтрэлт шаардсан/дотоод хэсгүүдийг бүү оролд
//
// Демог энд Disallow хийхгүй — хийвэл Google хуудсыг дахин уншиж чадахгүй тул
// layout дахь `noindex` мета-г хэзээ ч харахгүй, өмнө индексжсэн бол тэндээ үлдэнэ.
// Демог индексээс гаргах ажлыг `noindex` мета гүйцэтгэнэ (app/layout.tsx).
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
