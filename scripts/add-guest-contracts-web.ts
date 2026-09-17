// npx tsx --env-file=.env.local scripts/add-guest-contracts-web.ts
// Зочны гэрээ вэб дээр шууд үүсдэг болсон: и-мэйл баталгаажуулдаггүй тул нэг и-мэйлд нэг гэрээ гэсэн хязгаарыг авна
import { prisma } from '../lib/prisma'

async function main() {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "WarehouseContract_one_open_per_guest"`)
  console.log('OK: per-email guest contract index dropped')
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('Алдаа:', e); process.exit(1) })
