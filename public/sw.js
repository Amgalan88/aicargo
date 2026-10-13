const CACHE = 'aicargo-v2'

self.addEventListener('install', e => {
  self.skipWaiting()
})

// Хуучин кэш (хувийн API хариу агуулж болзошгүй) устгана
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
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
// Эрээнд ирсэн мэдэгдэл дараалан ирвэл овоолохгүй — өмнөхтэй нь нэгтгэж "N ачаа" болгоно
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: 'Мэдэгдэл', body: e.data ? e.data.text() : '' } }
  e.waitUntil((async () => {
    let title = d.title || 'Мэдэгдэл'
    let body = d.body || ''
    let codes = Array.isArray(d.codes) ? d.codes : []
    if (d.kind === 'ereen' && d.tag) {
      const prev = await self.registration.getNotifications({ tag: d.tag })
      for (const n of prev) {
        const old = (n.data && Array.isArray(n.data.codes)) ? n.data.codes : []
        for (const c of old) if (!codes.includes(c)) codes.push(c)
        n.close()
      }
      if (codes.length > 1) {
        title = String(title).replace(/^📦\s*(\d+\s*ачаа|Ачаа)/, `📦 ${codes.length} ачаа`)
        body = codes.slice(0, 3).join(', ') + (codes.length > 3 ? ` +${codes.length - 3}` : '')
      }
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
