// Олгох мөрийн засвар. Эхлээд хаалттай. Огнооны бүлэг нээх/хаах нь засвар нээхгүй.

export type HandoverEdit = { id: number; code: string; price: string } | null

export function initialHandoverEdit(): HandoverEdit {
  return null
}

export function isRowEditing(edit: HandoverEdit, id: number): boolean {
  return edit != null && edit.id === id
}

export function openHandoverEdit(row: { id: number; trackCode: string; adminPrice: number | null }): HandoverEdit {
  return {
    id: row.id,
    code: row.trackCode,
    price: row.adminPrice != null ? String(Number(row.adminPrice)) : '',
  }
}

/** Collapse, expand, or a fresh search must not leave an editor open. */
export function closeHandoverEdit(): HandoverEdit {
  return null
}

/** Summary groups phone-less rows under '—'. Show a warning label instead of the dash. */
export function handoverPhoneGroupLabel(phone: string | null | undefined): { label: string; phoneLess: boolean } {
  if (phone == null || phone.trim() === '' || phone.trim() === '—') return { label: 'Утасгүй ачаа', phoneLess: true }
  return { label: phone, phoneLess: false }
}
