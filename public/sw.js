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
