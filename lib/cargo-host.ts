import { cache } from 'react'
import { prisma } from '@/lib/prisma'

// Субдомэйнээр карго хайх — layout болон metadata хоёулаа нэг хүсэлтэд дуудна (cache)
export const hostCargo = cache(async (slug: string) =>
  prisma.cargo.findUnique({ where: { slug }, select: { id: true, brandTheme: true } }))

export const hostCargoExists = async (slug: string): Promise<boolean> => !!(await hostCargo(slug))

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return d[a.length][b.length]
}

// Буруу бичсэн хаягт ойролцоо каргонууд: "808cargo" → 808, "hurdd" → hurd
export async function suggestCargos(slug: string): Promise<{ slug: string; name: string }[]> {
  const typed = slug.toLowerCase()
  const bare = typed.replace(/-?(cargo|kargo|karg|carg)-?/g, '') || typed
  const all = await prisma.cargo.findMany({ select: { slug: true, name: true } })
  return all
    .map(c => {
      const s = c.slug.toLowerCase()
      let score = Infinity
      if (s === bare) score = 0
      else if (s.length >= 3 && (typed.includes(s) || s.includes(bare))) score = 1
      else {
        const dist = Math.min(distance(s, typed), distance(s, bare))
        if (dist <= (s.length <= 4 ? 1 : 2)) score = 1 + dist
      }
      return { ...c, score }
    })
    .filter(c => c.score < Infinity)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(({ slug, name }) => ({ slug, name }))
}
