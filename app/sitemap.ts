import type { MetadataRoute } from 'next'

// Үндсэн домэйны нийтэд нээлттэй хуудсууд — Google Search Console-д бүртгүүлнэ
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.aicargo.mn'
  return [
    { url: base, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/signup-cargo`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ]
}
