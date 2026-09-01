// Хэрэглэгчийн талын 3 хэлний dictionary (Orders + AI widget).
// MN нь эх сурвалж — EN/CN-д дутуу түлхүүр автоматаар монгол руу унана (эвдрэхгүй).

export type UserLang = 'mn' | 'en' | 'cn'

const MN = {
  // Nav / profile
  navTheme: 'Дэлгэц',
  navFaq: 'Түгээмэл асуулт',
  navSearch: 'Нэр дугааргүй',
  navProfile: 'Тохиргоо',
  navLogout: 'Гарах',
  faqTooltip: 'Асуулт хариулт',
  namelessTooltip: 'Эзэнгүй ачаа хайх',
  namelessTitle: 'Эзэнгүй ачаа',
  namelessSearchBtn: 'Хайх',
  namelessEmpty: 'Тохирох ачаа олдсонгүй.',
  namelessHint: 'Энд өөрийн ачааг олвол утасны дугаараа мэдэгдэж холбуулахын тулд компанидаа хандана уу.',
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
  viewList: 'Жагсаалт',
  viewByDate: 'Өдрөөр',
  groupNoItems: 'Энэ өдөр бараа байхгүй.',

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

  // Үнэ бодогч
  calcTitle: 'Үнэ бодох',
  calcHint: 'Ачааныхаа хэмжээ болон жинг оруулж тээврийн үнийг урьдчилан тооцоолоорой. Кубын болон жингийн үнийн өндөр нь баримтлагдана.',
  calcLength: 'Урт',
  calcWidth: 'Өргөн',
  calcHeight: 'Өндөр',
  calcWeight: 'Жин',
  calcCubicPrice: 'Кубээр',
  calcWeightPrice: 'Жингээр',
  calcResult: 'Тооцоолсон үнэ',
  calcByCubic: 'Кубын үнээр бодогдлоо',
  calcByWeight: 'Жингийн үнээр бодогдлоо',
  calcDisclaimer: 'Энэ бол ойролцоо тооцоо — эцсийн үнэ каргоноос баталгаажна.',
  calcFillBoth: 'Илүү ойролцоо үнэ тооцоолохыг хүсвэл хэмжээ болон жин хоёуланг нь бөглөнө үү.',
  calcTooLarge: 'Тооцоолсон үнэ хэт өндөр байна — оруулсан хэмжээ/жингээ шалгаад, зөв бол карготой холбогдож үнийн санал солилцоно уу.',
  calcNotConfigured: 'Карго үнийн тооцооллоо тохируулаагүй байна — үнийн мэдээллийг каргоноос лавлана уу.',
  calcTierAbove: '{n} кг-аас дээш: {p}',
  calcTierApplied: 'Шатлалтай үнэ хэрэглэгдлээ',

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
  navTheme: 'Display',
  navFaq: 'FAQ',
  navSearch: 'Unclaimed',
  navProfile: 'Settings',
  navLogout: 'Log out',
  faqTooltip: 'FAQ',
  namelessTooltip: 'Search unclaimed cargo',
  namelessTitle: 'Unclaimed cargo',
  namelessSearchBtn: 'Search',
  namelessEmpty: 'No matching cargo found.',
  namelessHint: 'Found your package here? Contact us with your phone number to link it to your account.',
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
  viewList: 'List',
  viewByDate: 'By day',
  groupNoItems: 'No items on this day.',

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

  calcTitle: 'Price calculator',
  calcHint: 'Enter your package dimensions and weight to estimate the shipping fee. The higher of the volume-based and weight-based price applies.',
  calcLength: 'Length',
  calcWidth: 'Width',
  calcHeight: 'Height',
  calcWeight: 'Weight',
  calcCubicPrice: 'By volume',
  calcWeightPrice: 'By weight',
  calcResult: 'Estimated price',
  calcByCubic: 'Volume price applied',
  calcByWeight: 'Weight price applied',
  calcDisclaimer: 'This is an estimate — the final price is confirmed by the cargo company.',
  calcFillBoth: 'For a more accurate estimate, fill in both the dimensions and the weight.',
  calcTooLarge: 'The estimated price is very large — double-check your inputs, and if correct, contact the cargo company for a quote.',
  calcNotConfigured: 'The cargo company has not configured pricing yet — please ask them for rates.',
  calcTierAbove: 'above {n} kg: {p}',
  calcTierApplied: 'Tiered price applied',

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
  navTheme: '显示',
  navFaq: '常见问题',
  navSearch: '无主货物',
  navProfile: '设置',
  navLogout: '退出',
  faqTooltip: '常见问题',
  namelessTooltip: '查找无主货物',
  namelessTitle: '无主货物',
  namelessSearchBtn: '搜索',
  namelessEmpty: '未找到匹配的货物。',
  namelessHint: '如果在此找到您的货物，请联系我们并提供电话号码以关联到您的账户。',
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
  viewList: '列表',
  viewByDate: '按日期',
  groupNoItems: '这一天没有货物。',

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

  calcTitle: '运费计算器',
  calcHint: '输入货物的尺寸和重量，估算运费。按体积和按重量计算的价格中较高者为准。',
  calcLength: '长',
  calcWidth: '宽',
  calcHeight: '高',
  calcWeight: '重量',
  calcCubicPrice: '按体积',
  calcWeightPrice: '按重量',
  calcResult: '预估运费',
  calcByCubic: '按体积计价',
  calcByWeight: '按重量计价',
  calcDisclaimer: '此为估算价格 — 最终价格以货运公司确认为准。',
  calcFillBoth: '如需更准确的估价，请同时填写尺寸和重量。',
  calcTooLarge: '预估价格过高 — 请核对输入，如无误请联系货运公司获取报价。',
  calcNotConfigured: '货运公司尚未设置价格 — 请向其咨询运费。',
  calcTierAbove: '{n} kg以上：{p}',
  calcTierApplied: '已按阶梯价计算',

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
  // Каргогийн өөрийн тохируулсан нэр зөвхөн монгол хэлэнд — EN/CN үед орчуулсан default
  const useCustom = lang === 'mn'
  const arrived = (useCustom && opts.arrivedLabel) || (opts.batchMode ? d.arrivedBatch : d.arrived)
  const ereen = (useCustom && opts.ereemLabel) || d.ereen
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
