import {fenced} from '@/http/fence'
import {NextResponse} from 'next/server'
import {resolvePrincipal} from '@/features/auth/principal'
export const dynamic='force-dynamic'
async function handleGET(request:Request){
  return NextResponse.json({principal:await resolvePrincipal(request)},{headers:{'Cache-Control':'private, no-store','Vary':'Cookie, Authorization'}})
}
export const GET=fenced('authentication',handleGET)
