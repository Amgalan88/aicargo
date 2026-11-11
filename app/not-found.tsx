import Link from 'next/link'

// Next-ийн англи «404 This page could not be found»-ийн оронд
export default function NotFound() {
  return (
    <main className="sys-page" data-testid="not-found">
      <p className="sys-page-code">404</p>
      <h1 className="sys-page-title">Хуудас олдсонгүй</h1>
      <p className="sys-page-text">Хаяг буруу эсвэл хуудас устсан байж магадгүй.</p>
      <Link href="/" className="btn">Нүүр рүү</Link>
    </main>
  )
}
