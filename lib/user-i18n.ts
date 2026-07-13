// Хэрэглэгчийн талын 3 хэлний dictionary (Orders + AI widget).
// MN нь эх сурвалж — EN/CN-д дутуу түлхүүр автоматаар монгол руу унана (эвдрэхгүй).

export type UserLang = 'mn' | 'en' | 'cn'

const MN = {
  // Nav / profile
  faqTooltip: 'Асуулт хариулт',
  logoutTooltip: 'Гарах',
  myInfo: 'Миний мэдээлэл',
  name: 'Нэр',
  phone: 'Утас',
  email: 'И-мэйл',
  cargo: 'Карго',
  language: '🌐 Хэл',

  // Page
  myOrders: 'Миний захиалгууд',
  deleteAll: 'Бүгдийг устгах',
  addBtn: '+ Бүртгэх',
  total: 'Нийт',
  items: 'бараа',
  searchPh: 'Трак кодоор хайх...',
  totalItems: 'Нийт {n} бараа',

  // Empty states
  emptyNone: 'Бүртгэлтэй бараа байхгүй байна.',
  emptyGuide: 'Захиалсан барааныхаа трак кодыг бүртгүүлбэл ирэх явцыг нь эндээс хянах боломжтой.',
  emptyCta: '+ Эхний барааг бүртгэх',
  emptyNoMatch: '"{q}" хайлтад тохирох бараа байхгүй.',
  emptyStatus: 'Энэ статуст бараа байхгүй байна.',

  // Cards
  trackCode: 'Трак код',
  cargoPayment: 'Карго төлбөр',
  description: 'Тайлбар',
  adminNote: 'Тэмдэглэл',
  date: 'Огноо',
  batch: 'Багц',
  batchItems: 'ачаа',
  totalPayment: 'Нийт төлбөр',
  batchInside: 'Багц доторх ачаанууд:',
  archiveTooltip: 'Архивлах',
  deleteTooltip: 'Устгах',

  // Delete-all modal
  deleteAllTitle: '⚠ Бүгдийг устгах',
  deleteIrreversible: 'Энэ үйлдлийг буцааж болохгүй. Үргэлжлүүлэхийн тулд УСТГАХ гэж бичнэ үү:',
  deleting: 'Устгаж байна...',
  deleteBtn: 'Устгах',
  cancel: 'Болих',

  // Add drawer
  addTitle: 'Бараа бүртгэх',
  trackCodePh: 'жш: YT2580126073683',
  descriptionPh: 'Барааны тайлбар...',
  saving: 'Хадгалж байна...',
  registerBtn: 'Бүртгэх',
  registeredList: 'Бүртгэгдсэн',

  // AI widget
  aiAssistant: 'AI Туслах',
  aiClose: 'Хаах',
  aiClear: 'Цэвэрлэх',
  aiGreeting: 'Сайн байна уу, {name}! Юу хийж өгөх вэ?',
  aiActionStats: '📦 Миний ачааны байдал',
  aiActionArrived: '✅ Ирсэн ачаа',
  aiActionCompany: '🏢 Компанийн мэдээлэл',
  aiActionRecent: '📋 Сүүлийн ачаануудын жагсаалт',
  aiCommonQs: 'Түгээмэл асуултууд',
  aiInputPh: 'Асуулт бичих...',
  aiEmptyReply: 'Хариулт хоосон байна.',
  aiErrGeneric: 'Алдаа гарлаа. Дахин оролдоно уу.',
  aiErrConn: 'Холболтын алдаа гарлаа.',
}

export type UserDict = typeof MN

const EN: Partial<UserDict> = {
  faqTooltip: 'FAQ',
  logoutTooltip: 'Log out',
  myInfo: 'My info',
  name: 'Name',
  phone: 'Phone',
  email: 'Email',
  cargo: 'Cargo',
  language: '🌐 Language',

  myOrders: 'My orders',
  deleteAll: 'Delete all',
  addBtn: '+ Register',
  total: 'Total',
  items: 'items',
  searchPh: 'Search by track code...',
  totalItems: 'Total {n} items',

  emptyNone: 'No registered items yet.',
  emptyGuide: 'Register your track codes to follow their journey here.',
  emptyCta: '+ Register first item',
  emptyNoMatch: 'Nothing matches "{q}".',
  emptyStatus: 'No items in this status.',

  trackCode: 'Track code',
  cargoPayment: 'Cargo fee',
  description: 'Description',
  adminNote: 'Note',
  date: 'Date',
  batch: 'Batch',
  batchItems: 'items',
  totalPayment: 'Total payment',
  batchInside: 'Items in this batch:',
  archiveTooltip: 'Archive',
  deleteTooltip: 'Delete',

  deleteAllTitle: '⚠ Delete all',
  deleteIrreversible: 'This cannot be undone. Type УСТГАХ to continue:',
  deleting: 'Deleting...',
  deleteBtn: 'Delete',
  cancel: 'Cancel',

  addTitle: 'Register item',
  trackCodePh: 'e.g. YT2580126073683',
  descriptionPh: 'Item description...',
  saving: 'Saving...',
  registerBtn: 'Register',
  registeredList: 'Registered',

  aiAssistant: 'AI Assistant',
  aiClose: 'Close',
  aiClear: 'Clear',
  aiGreeting: 'Hi {name}! How can I help?',
  aiActionStats: '📦 My shipment status',
  aiActionArrived: '✅ Arrived items',
  aiActionCompany: '🏢 Company info',
  aiActionRecent: '📋 Recent shipments',
  aiCommonQs: 'Common questions',
  aiInputPh: 'Type a question...',
  aiEmptyReply: 'Empty reply.',
  aiErrGeneric: 'Something went wrong. Please try again.',
  aiErrConn: 'Connection error.',
}

const CN: Partial<UserDict> = {
  faqTooltip: '常见问题',
  logoutTooltip: '退出',
  myInfo: '我的信息',
  name: '姓名',
  phone: '电话',
  email: '邮箱',
  cargo: '货运公司',
  language: '🌐 语言',

  myOrders: '我的订单',
  deleteAll: '全部删除',
  addBtn: '+ 登记',
  total: '共',
  items: '件',
  searchPh: '按单号搜索...',
  totalItems: '共 {n} 件',

  emptyNone: '暂无登记的货物。',
  emptyGuide: '登记您的快递单号，即可在此跟踪货物动态。',
  emptyCta: '+ 登记第一件货物',
  emptyNoMatch: '没有与"{q}"匹配的货物。',
  emptyStatus: '此状态下暂无货物。',

  trackCode: '快递单号',
  cargoPayment: '运费',
  description: '货物说明',
  adminNote: '备注',
  date: '日期',
  batch: '批次',
  batchItems: '件',
  totalPayment: '总费用',
  batchInside: '批次内货物：',
  archiveTooltip: '归档',
  deleteTooltip: '删除',

  deleteAllTitle: '⚠ 全部删除',
  deleteIrreversible: '此操作无法撤销。请输入 УСТГАХ 以继续：',
  deleting: '删除中...',
  deleteBtn: '删除',
  cancel: '取消',

  addTitle: '登记货物',
  trackCodePh: '例：YT2580126073683',
  descriptionPh: '货物说明...',
  saving: '保存中...',
  registerBtn: '登记',
  registeredList: '已登记',

  aiAssistant: 'AI 助手',
  aiClose: '关闭',
  aiClear: '清除',
  aiGreeting: '您好 {name}！有什么可以帮您？',
  aiActionStats: '📦 我的货物状态',
  aiActionArrived: '✅ 已到货物',
  aiActionCompany: '🏢 公司信息',
  aiActionRecent: '📋 最近的货物',
  aiCommonQs: '常见问题',
  aiInputPh: '输入问题...',
  aiEmptyReply: '回复为空。',
  aiErrGeneric: '出错了，请重试。',
  aiErrConn: '连接错误。',
}

export function dict(lang: UserLang): UserDict {
  if (lang === 'en') return { ...MN, ...EN }
  if (lang === 'cn') return { ...MN, ...CN }
  return MN
}

// {n}, {q} гэх мэт хувьсагч орлуулагч
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}

// Статусын default нэрс — каргогийн өөрийн тохируулсан нэр (arrivedLabel/ereemLabel)
// БҮХ хэлэнд давуу эрхтэй хэвээр харагдана.
const STATUS_DEFAULTS: Record<UserLang, { all: string; registered: string; ereen: string; arrived: string; arrivedBatch: string; picked: string }> = {
  mn: { all: 'Бүгд', registered: 'Бүртгүүлсэн', ereen: 'Эрээнд ирсэн', arrived: 'Ирсэн', arrivedBatch: 'УБ руу ачигдсан', picked: 'Авсан' },
  en: { all: 'All', registered: 'Registered', ereen: 'In Ereen', arrived: 'Arrived', arrivedBatch: 'Shipped to UB', picked: 'Picked up' },
  cn: { all: '全部', registered: '已登记', ereen: '已到二连', arrived: '已到达', arrivedBatch: '已发往UB', picked: '已取' },
}

// Хэл солихын өмнөх баталгаажуулалт — зорилтот хэл дээрээ асууна
export const LANG_CONFIRM: Record<UserLang, string> = {
  mn: 'Хэлийг Монгол болгох уу?',
  en: 'Switch language to English?',
  cn: '切换为中文？',
}

export function statusLabels(
  lang: UserLang,
  opts: { arrivedLabel?: string | null; ereemLabel?: string | null; batchMode?: boolean }
): { map: Record<string, string>; all: string } {
  const d = STATUS_DEFAULTS[lang]
  const arrived = opts.arrivedLabel || (opts.batchMode ? d.arrivedBatch : d.arrived)
  const ereen = opts.ereemLabel || d.ereen
  return {
    all: d.all,
    map: {
      REGISTERED: d.registered,
      EREEN_ARRIVED: ereen,
      ARRIVED: arrived,
      PICKED_UP: d.picked,
    },
  }
}
