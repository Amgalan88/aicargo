import SignupCargoClient from './SignupCargoClient'

export const revalidate = 0
export const metadata = { title: 'Шинэ карго нээх — Aicargo', robots: { index: true } }

export default function SignupCargoPage() {
  return <SignupCargoClient />
}
