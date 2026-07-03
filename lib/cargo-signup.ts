// Шинэ карго бүртгэлийн хамтын дүрмүүд

export const RESERVED_SLUGS = new Set([
  'www', 'api', 'admin', 'super', 'app', 'mail', 'ftp', 'blog', 'help',
  'support', 'dashboard', 'login', 'register', 'signup', 'test', 'dev',
  'staging', 'aicargo', 'cargo', 'static', 'assets', 'cdn', 'docs', 'status',
])

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/

export function validateSlug(slug: string): string | null {
  if (!SLUG_RE.test(slug)) {
    return 'Subdomain 3-30 тэмдэгт, зөвхөн латин жижиг үсэг, тоо, дундуур зураас (-) байна'
  }
  if (RESERVED_SLUGS.has(slug)) {
    return 'Энэ subdomain хориглогдсон байна'
  }
  return null
}

export const TRIAL_DAYS = 30
