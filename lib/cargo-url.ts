// Өөр каргоны хаяг: одоогийн хостын эхний хэсгийг (slug) солино.
// demo.aicargo.mn → shine.aicargo.mn · aicargo.mn → shine.aicargo.mn · demo.aicargo.localhost:3107 → shine.aicargo.localhost:3107
export function cargoHostUrl(slug: string, host: string, path = '/admin'): string {
  const [hostname, port] = host.split(':')
  const parts = hostname.split('.')
  const local = hostname === 'localhost' || hostname.endsWith('.localhost')
  // Субдомэйнгүй (aicargo.mn, www.aicargo.mn, aicargo.localhost) бол бүхэлд нь суурь болгоно
  const base = parts.length >= 3 && parts[0] !== 'www' ? parts.slice(1).join('.') : parts[0] === 'www' ? parts.slice(1).join('.') : hostname
  return `${local ? 'http' : 'https'}://${slug}.${base}${port ? ':' + port : ''}${path}`
}
