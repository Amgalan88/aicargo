// Бүртгэлгүй хүний гэрээний холбоосыг энэ хөтөчид хадгална — дахин ороход "үргэлжлүүлэх" боломж
const KEY = 'aicargo.guestContracts'

export interface SavedGuestContract {
  token: string
  warehouseId: number
  warehouseName: string
  contractNo: string
  savedAt: number
}

export function loadGuestContracts(): SavedGuestContract[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function saveGuestContract(item: SavedGuestContract) {
  try {
    const rest = loadGuestContracts().filter(x => x.token !== item.token)
    localStorage.setItem(KEY, JSON.stringify([item, ...rest].slice(0, 20)))
  } catch { /* хадгалах боломжгүй хөтөч */ }
}

export function forgetGuestContract(token: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadGuestContracts().filter(x => x.token !== token)))
  } catch { /* ignore */ }
}
