// npx tsx --env-file=.env.local scripts/add-loyalty.ts
// Олголтын баримт + урамшуулал (VIP хөнгөлөлт, оноо): 6 шинэ хүснэгт, Shipment.receiptId (raw DDL — бусад scripts/add-*.ts-тэй
// адил дүрэм). Зөвхөн нэмэлт, дахин ажиллуулж болно. Бүх карго дээр урамшуулал унтраалттай үүснэ (LoyaltySettings мөр байхгүй).
// Amgalan зөвшөөрсний дараа л production DB дээр ажиллуулна.
import { prisma } from '../lib/prisma'
import { LOYALTY_DDL, LOYALTY_RLS_DDL, LOYALTY_RLS_CHECK, SHIPMENT_INDEX_VALID_CHECK } from './loyalty-ddl'

async function main() {
  for (const sql of LOYALTY_DDL) await prisma.$executeRawUnsafe(sql)

  const [idx] = await prisma.$queryRawUnsafe<{ valid: boolean }[]>(SHIPMENT_INDEX_VALID_CHECK)
  if (!idx?.valid) throw new Error('"Shipment_receiptId_idx" INVALID байна — DROP INDEX хийгээд дахин ажиллуулна уу')

  const owners = await prisma.$queryRawUnsafe<{ table: string; rls: boolean; appBypasses: boolean }[]>(LOYALTY_RLS_CHECK)
  const blocked = owners.filter(o => !o.appBypasses)
  if (blocked.length) {
    console.warn('RLS асаагаагүй: энэ role эдгээр хүснэгтийн эзэмшигч биш —', blocked.map(o => o.table).join(', '))
  } else {
    for (const sql of LOYALTY_RLS_DDL) await prisma.$executeRawUnsafe(sql)
  }

  console.log('OK: HandoverReceipt, HandoverReceiptAdjustment, LoyaltySettings, LoyaltyAccount, LoyaltyLedger, ShipmentPriceLog, Shipment.receiptId ready')
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('Алдаа:', e); process.exit(1) })
