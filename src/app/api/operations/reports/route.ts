import {fenced} from '@/http/fence'
import {requestContext} from '@/features/auth/context'
import {exportReportCsv,runReport} from '@/domain/operations/reports'
import {staffDenied,staffFailure,staffJson} from '@/admin/shared/http'
async function handleGET(request:Request){
 try{
  const ctx=await requestContext(request);if(ctx.actor.kind!=='staff')return staffDenied()
  const params=new URL(request.url).searchParams,query={from:params.get('from')??'',to:params.get('to')??''}
  if(params.get('format')!=='csv')return staffJson(await runReport(ctx,query))
  const csv=await exportReportCsv(ctx,query)
  return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="acornelia-report-${query.from}-to-${query.to}.csv"`,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}})
 }catch(error){return staffFailure(error)}
}
export const GET=fenced('authentication',handleGET)
