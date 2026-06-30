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
