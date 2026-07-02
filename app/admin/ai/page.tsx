import AdminAIChat from '@/app/components/AdminAIChat'
import { AI_SUPPORT_ENABLED } from '@/lib/ai-feature-flag'

export const metadata = { title: 'AI Туслах' }

export default function AdminAIPage() {
  if (!AI_SUPPORT_ENABLED) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 12, padding: '4rem 1rem', textAlign: 'center', minHeight: '50vh',
      }}>
        <div style={{ fontSize: '2.5rem' }}>✨</div>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)' }}>AI Туслах — Тун удахгүй</h2>
        <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)', maxWidth: 360 }}>
          Одоогоор сайжруулалт хийгдэж байна. Удахгүй эргэн ажиллах болно.
        </p>
      </div>
    )
  }
  return <AdminAIChat />
}
