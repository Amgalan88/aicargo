// Аудит логийн үйлдлүүд — нэр, ангилал. Client болон server хоёулаа ашиглана.
// routine: өдөр тутмын олон давтагддаг (бүртгэх, олгох) — анхдагчаар нуугдана
// important: тохиргоо, мөнгө, устгал, буцаалт, ажилтан — анхдагчаар харагдана

export type AuditTone = 'blue' | 'green' | 'yellow' | 'red' | 'muted' | 'purple'

export const AUDIT_ACTIONS: Record<string, { label: string; routine?: boolean; tone: AuditTone }> = {
  'shipment:ereen-scan': { label: 'Эрээнд уншуулсан', routine: true, tone: 'blue' },
  'shipment:register-arrived': { label: 'Ирсэн бүртгэсэн', routine: true, tone: 'blue' },
  'shipment:handover': { label: 'Олгосон', routine: true, tone: 'green' },
  'shipment:import': { label: 'Excel импорт', tone: 'blue' },
  'shipment:import-arrived': { label: 'Excel импорт (Ирсэн)', tone: 'blue' },
  'shipment:edit': { label: 'Ачааны үнэ / утас зассан', tone: 'yellow' },
  'shipment:revert-arrived': { label: 'Ирсэн ачааг Эрээнд буцаасан', tone: 'yellow' },
  'shipment:revert-pickup': { label: 'Олгосон ачааг буцаасан', tone: 'yellow' },
  'shipment:user-removed': { label: 'Хэрэглэгч ачаагаа жагсаалтаасаа хассан', tone: 'muted' },
  'shipment:ereen-deleted': { label: 'Эрээний ачаа устгасан', tone: 'red' },
  'shipment:ereen-stale-deleted': { label: 'Удаж байгаа Эрээний ачаа устгасан', tone: 'red' },
  'shipment:ereen-all-deleted': { label: 'Эрээний БҮХ ачаа устгасан', tone: 'red' },
  'settings:update': { label: 'Тохиргоо өөрчилсөн', tone: 'purple' },
  'settings:permission-denied': { label: 'Эрхгүй тохиргоо засах гэж оролдсон', tone: 'red' },
  'staff-admin:create': { label: 'Ажилтан admin нэмсэн', tone: 'purple' },
  'staff-admin:permissions': { label: 'Ажилтны эрх өөрчилсөн', tone: 'purple' },
  'staff-admin:reset-password': { label: 'Ажилтны нууц үг сольсон', tone: 'purple' },
  'staff-admin:delete': { label: 'Ажилтан admin устгасан', tone: 'red' },
  'ereen-staff:create': { label: 'Эрээний ажилтан нэмсэн', tone: 'purple' },
  'ereen-staff:reset-password': { label: 'Эрээний ажилтны нууц үг сольсон', tone: 'purple' },
  'ereen-staff:delete': { label: 'Эрээний ажилтан устгасан', tone: 'red' },
  'link-order:quote': { label: 'Линк захиалгад үнэ илгээсэн', tone: 'blue' },
  'link-order:paid': { label: 'Линк захиалгын төлбөр орсон', tone: 'green' },
  'link-order:ordered': { label: 'Линк захиалга захиалсан', tone: 'green' },
  'link-order:track': { label: 'Линк захиалгын трак код', tone: 'blue' },
  'link-order:cancel': { label: 'Линк захиалга цуцалсан', tone: 'red' },
  'link-order:reopen': { label: 'Линк захиалга сэргээсэн', tone: 'yellow' },
  'banner:create': { label: 'Мэдэгдэл (баннер) нийтэлсэн', tone: 'blue' },
  'banner:delete': { label: 'Мэдэгдэл (баннер) устгасан', tone: 'muted' },
  'user:phone-verified': { label: 'Утсаа баталгаажуулсан', routine: true, tone: 'green' },
  'user:phone-changed': { label: 'Утасны дугаараа сольсон', tone: 'yellow' },
  'billing:renewed': { label: 'Вэбсайтын төлбөр сунгагдсан', tone: 'green' },
}

export const ROUTINE_ACTIONS = Object.entries(AUDIT_ACTIONS).filter(([, v]) => v.routine).map(([k]) => k)

export function auditLabel(action: string): string {
  return AUDIT_ACTIONS[action]?.label ?? action
}
