// Нүүр хуудасны зураг. Замыг эндээс солино — бүгд public/landing/*.webp.
// source / license нь PR тайлбарт давхар бичигдэнэ.

export type LandingPhoto = {
  src: string
  width: number
  height: number
  alt: string
  /** object-fit: cover байрлал */
  objectPosition?: string
  source: string
  license: string
  licenseUrl: string
}

const PEXELS = {
  license: 'Pexels License',
  licenseUrl: 'https://www.pexels.com/license/',
}

const UNSPLASH = {
  license: 'Unsplash License',
  licenseUrl: 'https://unsplash.com/license',
}

export const LANDING_IMAGES = {
  hero: {
    src: '/landing/hero.webp',
    width: 1920,
    height: 1280,
    alt: 'Уулын замаар явж буй ачааны машин',
    objectPosition: '68% center',
    source: 'https://www.pexels.com/photo/93398/',
    ...PEXELS,
  },
  steps: {
    china: {
      src: '/landing/step-china.webp',
      width: 1200,
      height: 800,
      alt: 'Чингэлэг ачсан хөлөг онгоц боомт дээр',
      objectPosition: 'center',
      source: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec',
      ...UNSPLASH,
    },
    pack: {
      src: '/landing/step-pack.webp',
      width: 1000,
      height: 666,
      alt: 'Хайрцгийг туузаар баглаж буй хүн',
      objectPosition: 'center',
      source: 'https://www.pexels.com/photo/4246120/',
      ...PEXELS,
    },
    truck: {
      src: '/landing/step-truck.webp',
      width: 1200,
      height: 800,
      alt: 'Нээлттэй хурдны замаар явж буй ачааны машин',
      objectPosition: '32% center',
      source: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7',
      ...UNSPLASH,
    },
    register: {
      src: '/landing/step-register.webp',
      width: 1000,
      height: 666,
      alt: 'Агуулахад таблет барьсан ажилтан',
      objectPosition: 'center',
      source: 'https://www.pexels.com/photo/4484078/',
      ...PEXELS,
    },
    pickup: {
      src: '/landing/step-pickup.webp',
      width: 1000,
      height: 1250,
      alt: 'Илгээмж гардуулж буй гар',
      objectPosition: 'center',
      source: 'https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55',
      ...UNSPLASH,
    },
  },
  masonry: {
    admin: {
      src: '/landing/masonry-tall.webp',
      width: 1100,
      height: 1466,
      alt: 'Өндөр тавиуртай агуулахын коридор',
      objectPosition: 'center',
      source: 'https://images.unsplash.com/photo-1553413077-190dd305871c',
      ...UNSPLASH,
    },
    user: {
      src: '/landing/masonry-user.webp',
      width: 1200,
      height: 800,
      alt: 'Хайрцаг буулгаж, утсаар шалгаж буй хүмүүс',
      objectPosition: 'center',
      source: 'https://www.pexels.com/photo/6169668/',
      ...PEXELS,
    },
    wide: {
      src: '/landing/masonry-wide.webp',
      width: 1400,
      height: 786,
      alt: 'Боомтын чингэлгийн талбай дээрээс',
      objectPosition: 'center',
      source: 'https://www.pexels.com/photo/1427107/',
      ...PEXELS,
    },
  },
} satisfies {
  hero: LandingPhoto
  steps: Record<'china' | 'pack' | 'truck' | 'register' | 'pickup', LandingPhoto>
  masonry: Record<'admin' | 'user' | 'wide', LandingPhoto>
}
