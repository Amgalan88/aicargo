// Заавар видеонууд — YouTube ID-г нь энд нэмнэ (жш: https://youtu.be/AbC123xyz → 'AbC123xyz').
// ID-гүй видео харагдахгүй; аль нэг хэсэгт нэг ч видео байхгүй бол "Заавар видео" товч өөрөө нуугдана.

export interface Tutorial {
  id: string
  title: string
  desc: string
  youtube?: string
}

export const USER_TUTORIALS: Tutorial[] = [
  { id: 'u-register', title: 'Бүртгүүлэх, нэвтрэх', desc: 'Утасны дугаараар бүртгэл үүсгэж нэвтрэх' },
  { id: 'u-address', title: 'Эрээний хаягаа хуулах', desc: 'Хаягийг хуулж Taobao, Pinduoduo-д оруулах' },
  { id: 'u-track', title: 'Трак код бүртгэх, ачаа хянах', desc: 'Трак кодоо оруулж ачаа хаана явааг харах' },
  { id: 'u-notify', title: 'Мэдэгдэл асаах, апп суулгах', desc: 'Ачаа ирэхэд утсанд мэдэгдэл авах' },
  { id: 'u-links', title: 'Линкээр захиалах', desc: 'Барааны линк илгээж каргогоор захиалуулах' },
]

export const ADMIN_TUTORIALS: Tutorial[] = [
  { id: 'a-ereen', title: 'Эрээнд уншуулах, Excel импорт', desc: 'Эрээнд ирсэн ачааг бүртгэх 2 арга' },
  { id: 'a-arrived', title: '"Ирсэн" бүртгэх, үнэ оруулах', desc: 'Монголд ирсэн ачааг үнэтэй нь бүртгэх' },
  { id: 'a-handover', title: 'Ачаа олгох', desc: 'Хэрэглэгчийн утсаар хайж ачааг олгох' },
  { id: 'a-settings', title: 'Тохиргоо', desc: 'Лого, Эрээний хаяг, данс, тариф тохируулах' },
  { id: 'a-staff', title: 'Ажилтан нэмэх, аудит лог', desc: 'Ажилтанд эрх өгч, хэн юу хийснийг харах' },
  { id: 'a-links', title: 'Линк захиалга, мэдэгдэл', desc: 'Линк захиалгад үнэ илгээх, мэдэгдэл хэрхэн очдог' },
]

export const withVideo = (list: Tutorial[]) => list.filter(t => !!t.youtube)
