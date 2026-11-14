import {NextResponse} from 'next/server'
import {resolvePrincipal} from '@/features/auth/principal'
export const dynamic='force-dynamic'
export async function GET(request:Request){
  return NextResponse.json({principal:await resolvePrincipal(request)},{headers:{'Cache-Control':'private, no-store','Vary':'Cookie, Authorization'}})
}
