import { NextRequest } from 'next/server'
import { requireCargoAdmin } from '@/lib/contract-auth'
import { PartyAccess, getContractView } from '@/lib/contract-actions'

type Params = { params: Promise<{ id: string }> }

// Каргогийн админ хэсгээс гэрээг зөвхөн харна. Төлбөр мэдэгдэх, цуцлах зэрэг үйлдлийг
// гэрээ байгуулсан хүн гэрээний холбоосоор (хүн бүрт ижил нэг хуудас) хийнэ.
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireCargoAdmin(req, false)
  if (auth.error) return auth.error
  const { user } = auth
  const a: PartyAccess = {
    where: { id: Number((await params).id) || -1, cargoId: user.cargoId },
    actor: { id: user.userId, name: user.name },
    canManage: false,
    email: null,
    signerName: user.name,
    viaLink: false,
  }
  return getContractView(a)
}
