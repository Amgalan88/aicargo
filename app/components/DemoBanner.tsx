// Демо орчны байнгын анхааруулга.
// Өмнө нь анхааруулга нь landing-ийн "Анхааруулга" таб дотор нуугдмал байсан тул
// жинхэнэ үйлчлүүлэгчид үүнийг хардаггүй, ачаагаа энд бүртгэчихдэг байв.
export default function DemoBanner() {
  return (
    <div
      role="status"
      style={{
        background: 'var(--yellow)',
        color: 'var(--on-accent)',
        padding: '0.6rem 1rem',
        fontSize: '0.85rem',
        lineHeight: 1.45,
        textAlign: 'center',
      }}
    >
      <strong>Энэ бол туршилтын демо орчин.</strong>{' '}
      Энд бүртгэсэн ачаа жинхэнэ карго руу очихгүй бөгөөд өгөгдөл өдөр бүр шөнө устана.
      Ачаагаа хянахын тулд <strong>өөрийн каргогийнхоо вэб хаягаар</strong> орно уу.
    </div>
  )
}
