// Брэндбүүкийн загварууд — супер админ каргод асаана (Cargo.brandTheme).
// Асаасан каргоны субдомэйн бүхэлдээ (хэрэглэгч, нэвтрэх, админ) <html data-brand="…">-тэй болж,
// globals.css-ийн тухайн брэндийн өнгө, фонт, толгойн маршрутын шугамыг авна.
//   mgl — „Эрээнээс MGL карго“ брэндбүүк 2.0: тэнгэр хөх #002D72, хул шар #FF8200, сүүн цагаан #F6EFE3, Geologica
export const BRAND_THEMES = ['mgl'] as const
export type BrandTheme = (typeof BRAND_THEMES)[number]

export const isBrandTheme = (v: unknown): v is BrandTheme => BRAND_THEMES.includes(v as BrandTheme)
