import { suggestCargos } from '@/lib/cargo-host'

// Бүртгэлгүй субдомэйн (жш: 808cargo.aicargo.mn) — ердийн нэвтрэх хуудас биш, "олдсонгүй" гэж хэлж зөв хаягийг санал болгоно
export default async function UnknownCargo({ slug }: { slug: string }) {
  const suggestions = await suggestCargos(slug).catch(() => [])
  return (
    <div className="page" style={{ maxWidth: 460, paddingTop: '4rem' }}>
      <div className="empty-state uc">
        <h3>Ийм карго олдсонгүй</h3>
        <p><b className="uc-host">{slug}.aicargo.mn</b> хаягаар бүртгэлтэй карго алга. Хаягаа шалгаад дахин оролдоно уу.</p>
        {suggestions.length > 0 && (
          <div className="uc-list">
            <span>Та энэ каргог хайж байсан уу?</span>
            {suggestions.map(c => (
              <a key={c.slug} href={`https://${c.slug}.aicargo.mn`} className="uc-item">
                <b>{c.slug}.aicargo.mn →</b>
                <small>{c.name}</small>
              </a>
            ))}
          </div>
        )}
        <a href="https://www.aicargo.mn" className="uc-home">aicargo.mn руу очих</a>
      </div>
    </div>
  )
}
