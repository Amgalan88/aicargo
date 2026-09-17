// npx tsx --env-file=.env.local scripts/add-contract-website-bonus.ts
// Гэрээ байгуулсан каргод олгох 60 хоногийн үнэгүй вэбсайтыг давхар олгохгүйн тулд тэмдэглэнэ
import { prisma } from '../lib/prisma'

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE "WarehouseContract" ADD COLUMN IF NOT EXISTS "websiteBonusAt" TIMESTAMP(3)`)
  console.log('OK: websiteBonusAt column ready')
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('Алдаа:', e); process.exit(1) })
