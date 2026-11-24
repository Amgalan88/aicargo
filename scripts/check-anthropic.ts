// Anthropic түлхүүр зөв эсэхийг шалгана. Загварын мэдээлэл л уншина: мөнгө зарцуулахгүй, түлхүүрийг хэвлэхгүй.
// Ажиллуулах: npx --no-install tsx scripts/check-anthropic.ts
import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { ADMIN_AI_MODEL } from '../lib/anthropic'

function keyFromEnvFile(): string | undefined {
  try {
    const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find(l => l.startsWith('ANTHROPIC_API_KEY='))
    return line?.slice('ANTHROPIC_API_KEY='.length).trim().replace(/^["']|["']$/g, '') || undefined
  } catch { return undefined }
}

async function main() {
  const key = process.env.ANTHROPIC_API_KEY?.trim() || keyFromEnvFile()
  if (!key) { console.log('✗ ANTHROPIC_API_KEY хоосон байна (.env.local)'); process.exit(1) }
  if (!key.startsWith('sk-ant-')) console.log('! Түлхүүр sk-ant- гэж эхлэхгүй байна, зөв хуулсан эсэхээ шалгаарай')
  try {
    const m = await new Anthropic({ apiKey: key }).models.retrieve(ADMIN_AI_MODEL)
    console.log(`✓ Түлхүүр ажиллаж байна. Загвар: ${m.id} (${m.display_name})`)
  } catch (e) {
    const status = (e as { status?: number }).status
    console.log(status === 401 ? '✗ Түлхүүр буруу эсвэл устгагдсан (401)'
      : status === 404 ? `✗ ${ADMIN_AI_MODEL} загвар энэ бүртгэлд олдсонгүй (404)`
      : `✗ Алдаа: ${status ?? ''} ${(e as Error).message}`)
    process.exit(1)
  }
}
main()
