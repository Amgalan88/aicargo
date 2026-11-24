// Хуудаснаас туслах руу мэдээ дамжуулах (жш бүртгэлийн алдааг туслах хэлнэ).
// Туслах унтсан, нуугдсан, чимээгүй байсан ч анхааруулга заавал гарна.
export const ASSISTANT_EVENT = 'aicargo-assistant'
export type AssistantSignal = { kind: 'warn' | 'info'; text: string }

export function assistantSay(signal: AssistantSignal) {
  if (typeof window === 'undefined' || !signal.text) return
  window.dispatchEvent(new CustomEvent<AssistantSignal>(ASSISTANT_EVENT, { detail: signal }))
}
