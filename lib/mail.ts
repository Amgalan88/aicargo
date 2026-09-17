import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.MAIL_FROM || 'Aicargo <onboarding@resend.dev>'

export async function sendOtpEmail(email: string, code: string) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Нууц үг сэргээх код',
    text: `Таны нууц үг сэргээх код: ${code}\n\nЭнэ код 10 минутын дараа хүчингүй болно.\n\nТа өөрөө хүсэлт гаргаагүй бол энэ имэйлийг үл тоомсорлоно уу.\n\n— Aicargo`,
    html: `<p>Таны нууц үг сэргээх код:</p>
<p style="font-size:2rem;font-weight:800;letter-spacing:6px;">${code}</p>
<p style="color:#888;font-size:0.85rem;">Энэ код <strong>10 минутын</strong> дараа хүчингүй болно.</p>
<p style="color:#888;font-size:0.8rem;">Та өөрөө хүсэлт гаргаагүй бол энэ имэйлийг үл тоомсорлоно уу.</p>`,
  })
}

export async function sendCargoSignupOtpEmail(email: string, code: string, cargoName: string) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `"${cargoName}" карго нээх баталгаажуулах код`,
    text: `Таны "${cargoName}" карго нээх баталгаажуулах код: ${code}\n\nЭнэ код 10 минутын дараа хүчингүй болно.\n\nТа өөрөө хүсэлт гаргаагүй бол энэ имэйлийг үл тоомсорлоно уу.\n\n— Aicargo`,
    html: `<p>Таны <strong>"${cargoName}"</strong> карго нээх баталгаажуулах код:</p>
<p style="font-size:2rem;font-weight:800;letter-spacing:6px;">${code}</p>
<p style="color:#888;font-size:0.85rem;">Энэ код <strong>10 минутын</strong> дараа хүчингүй болно.</p>
<p style="color:#888;font-size:0.8rem;">Та өөрөө хүсэлт гаргаагүй бол энэ имэйлийг үл тоомсорлоно уу.</p>`,
  })
}

export async function sendMoveOtpEmail(email: string, code: string, cargoName: string) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `"${cargoName}" компанид шилжих баталгаажуулах код`,
    text: `Таны бүртгэлийг "${cargoName}" компанид шилжүүлэх баталгаажуулах код: ${code}\n\nЭнэ код 10 минутын дараа хүчингүй болно.\n\nТа өөрөө хүсэлт гаргаагүй бол энэ имэйлийг үл тоомсорлож, нууц үгээ солиход зөвлөж байна.\n\n— Aicargo`,
    html: `<p>Таны бүртгэлийг <strong>"${cargoName}"</strong> компанид шилжүүлэх баталгаажуулах код:</p>
<p style="font-size:2rem;font-weight:800;letter-spacing:6px;">${code}</p>
<p style="color:#888;font-size:0.85rem;">Энэ код <strong>10 минутын</strong> дараа хүчингүй болно.</p>
<p style="color:#888;font-size:0.8rem;">Та өөрөө хүсэлт гаргаагүй бол энэ имэйлийг үл тоомсорлож, нууц үгээ солиход зөвлөж байна.</p>`,
  })
}

export async function sendNotificationEmail(
  email: string,
  _name: string,
  phone: string,
  cargoCount: number,
  totalAmount: number,
  closingTime: string,
  cargoName = 'Cargo'
) {
  const plain = `Сайн байна уу? Танд энэ өдрийн мэнд хүргэе!

Таны ${phone} дугаар дээр ${cargoCount} ачаа ирсэн байна.
Нийт үнийн дүн ${totalAmount.toLocaleString()} төгрөг.

${cargoName} өнөөдөр ${closingTime} цаг хүртэл ажиллаж байна.

— ${cargoName}`

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Таны ${cargoCount} ачаа ирлээ`,
    text: plain,
    html: `<p>Сайн байна уу? Танд энэ өдрийн мэнд хүргэе!</p>
<p>Таны <strong>${phone}</strong> дугаар дээр <strong>${cargoCount} ачаа</strong> ирсэн байна.<br>
Нийт үнийн дүн <strong>₮${totalAmount.toLocaleString()}</strong> төгрөг.</p>
<p>${cargoName} өнөөдөр <strong>${closingTime}</strong> цаг хүртэл ажиллаж байна.</p>
<p style="color:#888;font-size:0.85rem;">— ${cargoName}</p>`,
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export async function sendContractEmail(to: string[], subject: string, lines: string[]) {
  await resend.emails.send({
    from: FROM,
    to,
    subject,
    text: `${lines.join('\n')}\n\n— Aicargo`,
    html: `${lines.map(l => /^https?:\/\//.test(l)
      ? `<p><a href="${escapeHtml(l)}">${escapeHtml(l)}</a></p>`
      : `<p>${escapeHtml(l)}</p>`).join('')}<p style="color:#888;font-size:0.8rem;">— Aicargo</p>`,
  })
}

const STATUS_MN: Record<string, string> = {
  DRAFT: 'Ноорог', AWAITING_PAYMENT: 'Төлбөр хүлээгдэж байна', PAYMENT_REVIEW: 'Төлбөр шалгаж байна',
  ACTIVE: 'Хүчинтэй', TERMINATION_PENDING: 'Цуцлагдаж байна',
}

// Нэвтрэлтгүй гэрээний нууц холбоос(ууд)
export async function sendGuestContractLinks(email: string, items: { warehouseName: string; contractNo: string; status: string; link: string }[]) {
  const text = items.map(i => `• ${i.warehouseName} — ${i.contractNo} (${STATUS_MN[i.status] ?? i.status})\n  ${i.link}`).join('\n\n')
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: items.length === 1 ? `"${items[0].warehouseName}" агуулахтай байгуулах гэрээ` : 'Таны агуулахын гэрээнүүд',
    text: `Сайн байна уу,

Эрээний агуулахтай байгуулах цахим гэрээгээ доорх холбоосоор нээнэ үү:

${text}

Энэ холбоос зөвхөн танд зориулагдсан тул бусадтай хуваалцахгүй байна уу. Та өөрөө хүсэлт гаргаагүй бол энэ имэйлийг үл тоомсорлоно уу.

— Aicargo`,
    html: `<p>Сайн байна уу,</p><p>Эрээний агуулахтай байгуулах цахим гэрээгээ доорх холбоосоор нээнэ үү:</p>${items.map(i => `
<p style="margin:14px 0;"><strong>${escapeHtml(i.warehouseName)}</strong> — ${escapeHtml(i.contractNo)} <span style="color:#888;">(${escapeHtml(STATUS_MN[i.status] ?? i.status)})</span><br>
<a href="${escapeHtml(i.link)}" style="display:inline-block;margin-top:6px;background:#c96442;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none;font-weight:600;">Гэрээ нээх</a></p>`).join('')}
<p style="color:#888;font-size:0.8rem;">Энэ холбоос зөвхөн танд зориулагдсан тул бусадтай хуваалцахгүй байна уу. Та өөрөө хүсэлт гаргаагүй бол энэ имэйлийг үл тоомсорлоно уу.</p>`,
  })
}
