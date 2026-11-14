// npx tsx --env-file=.env.local scripts/add-loyalty.ts
// Урамшууллын хүснэгтүүд (HandoverReceipt, LoyaltySettings/Account/Ledger, ShipmentPriceChange) — raw DDL, давтан ажиллуулж болно.
// ⚠ Production DB-д зөвхөн эзэмшигчийн зөвшөөрлөөр, шинэ кодыг deploy хийхээс ӨМНӨ ажиллуулна (олголт HandoverReceipt-д бичдэг).
import { prisma } from '../lib/prisma'
import { LOYALTY_DDL } from './loyalty-ddl'

async function main() {
  for (const sql of LOYALTY_DDL) await prisma.$executeRawUnsafe(sql)
  console.log(`OK: loyalty schema ready (${LOYALTY_DDL.length} statements)`)
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('Алдаа:', e); process.exit(1) })
