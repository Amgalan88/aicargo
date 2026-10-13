const CACHE = 'aicargo-v2'
// Хэрэглэгчийн хэл (push мэдэгдлийн текст) — шинэчлэлтэд устгагдахгүй
const PREFS = 'aicargo-prefs'

self.addEventListener('install', e => {
  self.skipWaiting()
})

// Хуучин кэш (хувийн API хариу агуулж болзошгүй) устгана
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== PREFS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  // Network-first: always fresh, fall back to cache
  if (e.request.method !== 'GET') return
  // Хувийн мэдээлэл (API, гэрээний нууц холбоос) төхөөрөмж дээр хадгалагдахгүй
  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/contracts/')) return
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
        return res
      })
      .catch(() => caches.match(e.request))
  )
})

// ── Push мэдэгдэл ──
// Текстийг хэрэглэгчийн сонгосон хэлээр (MN/EN/中文) энд бүтээнэ. Мэдэгдэх утга алга бол серверийн монгол текст.
// Эрээнд ирсэн мэдэгдэл дараалан ирвэл овоолохгүй — өмнөхтэй нь нэгтгэж "N ачаа" болгоно
async function pushLang() {
  try {
    const r = await caches.match('/__push-lang', { cacheName: PREFS })
    const t = r ? await r.text() : ''
    return t === 'en' || t === 'cn' ? t : 'mn'
  } catch { return 'mn' }
}

const money = v => '₮' + Math.round(v).toLocaleString('en-US')
const codeList = codes => codes.slice(0, 3).join(', ') + (codes.length > 3 ? ` +${codes.length - 3}` : '')

function ereenText(lang, codes, label) {
  const n = codes.length
  const title = lang === 'en' ? (n > 1 ? `📦 ${n} parcels reached Ereen` : '📦 Your parcel reached Ereen')
    : lang === 'cn' ? (n > 1 ? `📦 ${n} 件货物已到二连` : '📦 货物已到二连')
    : label ? `📦 ${n > 1 ? `${n} ачаа` : 'Ачаа'} · ${label}`
    : n > 1 ? `📦 ${n} ачаа Эрээнд ирлээ` : '📦 Ачаа Эрээнд ирлээ'
  return { title, body: codeList(codes) }
}

function arrivedText(lang, d) {
  const n = d.n, total = d.total > 0 ? d.total : 0, cargo = d.cargo ? ` — ${d.cargo}` : ''
  if (lang === 'en') return {
    title: `📦 ${n} parcel${n > 1 ? 's' : ''} arrived`,
    body: `${n} parcel${n > 1 ? 's' : ''} for ${d.phone} ${n > 1 ? 'are' : 'is'} ready for pickup.${total ? ` Total ${money(total)}.` : ''}${cargo}`,
  }
  if (lang === 'cn') return {
    title: `📦 您的 ${n} 件货物已到达`,
    body: `${d.phone} 的 ${n} 件货物已到达，可以取货。${total ? `合计 ${money(total)}。` : ''}${cargo}`,
  }
  return {
    title: `📦 Таны ${n} ачаа ирлээ`,
    body: `Таны ${d.phone} дугаар дээр ${n} ачаа ирсэн байна.${total ? ` Нийт ${money(total)}.` : ''}${cargo}`,
  }
}

self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: 'Мэдэгдэл', body: e.data ? e.data.text() : '' } }
  e.waitUntil((async () => {
    const lang = await pushLang()
    let title = d.title || 'Мэдэгдэл'
    let body = d.body || ''
    let codes = Array.isArray(d.codes) ? d.codes.slice() : []
    if (d.kind === 'ereen') {
      if (d.tag) {
        const prev = await self.registration.getNotifications({ tag: d.tag })
        for (const n of prev) {
          const old = (n.data && Array.isArray(n.data.codes)) ? n.data.codes : []
          for (const c of old) if (!codes.includes(c)) codes.push(c)
          n.close()
        }
      }
      if (codes.length) ({ title, body } = ereenText(lang, codes, d.label))
    } else if (d.kind === 'arrived' && typeof d.n === 'number' && d.phone) {
      ({ title, body } = arrivedText(lang, d))
    }
    await self.registration.showNotification(title, {
      body,
      tag: d.tag || undefined,
      renotify: !!d.tag,
      icon: '/api/cargo-icon',
      badge: '/icon-192.png',
      data: { url: d.url || '/orders', codes },
    })
  })())
})

// Мэдэгдэл дээр дарахад нээлттэй цонх байвал тэрийг, үгүй бол шинээр нээнэ
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const target = new URL((e.notification.data && e.notification.data.url) || '/orders', self.location.origin).href
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus()
        if ('navigate' in w) await w.navigate(target).catch(() => {})
        return
      }
    }
    await self.clients.openWindow(target)
  })())
})
