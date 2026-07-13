// Демо каргог гараар үүсгэх/шинэчлэх:
//   DATABASE_URL тохируулаад:  npx tsx scripts/seed-demo.ts
import { seedDemoCargo } from '../lib/demo-seed'

seedDemoCargo()
  .then(r => {
    console.log('Демо карго бэлэн:', r)
    process.exit(0)
  })
  .catch(e => {
    console.error('Seed алдаа:', e)
    process.exit(1)
  })
