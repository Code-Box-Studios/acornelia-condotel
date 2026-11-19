import {fenced} from '@/http/fence'
import {NextResponse} from 'next/server'
import {ZodError} from 'zod'
import {requestContext} from '@/features/auth/context'
import {readAudit} from '@/domain/audit/read'
import {recordRefusedAttempt,recordEvent} from '@/domain/audit/events'
import {getDatabase} from '@/domain/db/payload'
export const dynamic='force-dynamic'
const headers={'Cache-Control':'private, no-store','Vary':'Cookie, Authorization'}
function cell(value:unknown):string{
  let text=typeof value==='object'?JSON.stringify(value):String(value??'')
  if(/^[=+@\-\t\r]/.test(text))text="'"+text
  return '"'+text.replaceAll('"','""')+'"'
}
async function handleGET(request:Request){
  const ctx=await requestContext(request)
  if(ctx.actor.kind!=='staff'||ctx.actor.role!=='developer'){
    await recordRefusedAttempt(await getDatabase(),ctx.actor,{action:new URL(request.url).searchParams.get('format')==='csv'?'audit:export-refused':'audit:read-refused',recordType:'audit-entries',outcome:'refused'})
    return NextResponse.json({error:'Permission denied'},{status:403,headers})
  }
  const params=new URL(request.url).searchParams
  try{
    const result=await readAudit(ctx,{
      limit:params.has('limit')?Number(params.get('limit')):undefined,cursor:params.get('cursor')||undefined,
      action:params.get('action')||undefined,recordType:params.get('recordType')||undefined,
    })
    if(params.get('format')==='csv'){
      const columns=['createdAt','actor','action','recordType','recordId','outcome','safeChanges'] as const
      const csv=[columns.join(','),...result.items.map(row=>columns.map(key=>cell(row[key])).join(','))].join('\r\n')+'\r\n'
      await recordEvent(await getDatabase(),ctx.actor,{action:'audit:export',recordType:'audit-entries',outcome:'success'})
      return new Response(csv,{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="acornelia-action-log-page.csv"',...(result.nextCursor?{'X-Next-Cursor':result.nextCursor}:{})}})
    }
    return NextResponse.json(result,{headers})
  }catch(error){
    if(error instanceof ZodError||error instanceof SyntaxError)return NextResponse.json({error:'Invalid log filters'},{status:400,headers})
    return NextResponse.json({error:'Action logs are temporarily unavailable'},{status:503,headers})
  }
}
export const GET=fenced('authentication',handleGET)
