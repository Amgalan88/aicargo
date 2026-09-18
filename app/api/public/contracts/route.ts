import { NextResponse } from 'next/server'

// Агуулахтай гэрээг зөвхөн aicargo-д карго нээсэн админ байгуулна (/admin/warehouse) — бүртгэлгүй
// хүн гэрээ эхлүүлэх боломжгүй. Өмнө эхлүүлсэн зочны гэрээ /api/public/contracts/[token]-оор хэвээр ажиллана
export async function POST() {
  return NextResponse.json({ error: 'Гэрээ байгуулахын тулд эхлээд aicargo-д каргогоо нээнэ үү', needsCargo: true }, { status: 403 })
}
