import {NextResponse,type NextRequest} from 'next/server'
import {recordGatewayRefusal} from '@/domain/audit/events'
function privateResponse(response:NextResponse,referrerPolicy='no-referrer'):NextResponse{
  response.headers.set('Cache-Control','private, no-store, max-age=0')
  response.headers.set('Referrer-Policy',referrerPolicy)
  response.headers.set('Vary','Cookie, Authorization')
  return response
}
async function refuse(status:number,message:string,reason:'bootstrap'|'origin'|'disabled'|'invalid'='disabled'){
  await recordGatewayRefusal(reason)
  return privateResponse(NextResponse.json({error:message},{status}))
}
export function proxy(request:NextRequest){
  let path:string
  try{path=decodeURIComponent(request.nextUrl.pathname).replace(/\/+$/,'')}catch{return refuse(400,'Invalid request','invalid')}
  // Payload's first-register endpoint bypasses ordinary create access when no user exists.
  if(/^\/api\/(staff-users|customers)\/first-register$/.test(path))return refuse(403,'Account creation is unavailable here','bootstrap')
  if(/^\/api\/customers\/(login|logout|forgot-password|reset-password|refresh-token|verify(?:\/.*)?)$/.test(path))return refuse(403,'Use the customer account form','disabled')
  if(path==='/admin/create-first-user')return refuse(403,'Staff access requires the property operator','bootstrap')
  // Authenticated provider notifications are still stored during quarantine; processing stays fenced.
  if(process.env.APP_OPERATION_MODE!=='normal'&&path!=='/api/webhooks/maya')return refuse(503,'This service is temporarily unavailable')
  if(/^\/api\/(staff-users|customers)\/forgot-password$/.test(path)&&!process.env.EMAIL_TRANSPORT)return refuse(503,'Account recovery is temporarily unavailable')
  if(path==='/api/graphql')return refuse(403,'This service is unavailable')
  if(process.env.APP_ENV==='production'&&process.env.CUSTOMER_AUTH_METHOD!=='email-password'&&(path.startsWith('/api/customers')||path.startsWith('/api/customer/')||path.startsWith('/account')))return refuse(503,'Customer access is temporarily unavailable')
  const isMutation=!['GET','HEAD','OPTIONS'].includes(request.method)
  const externalWebhook=path==='/api/webhooks/maya'
  const authenticatedRunner=path==='/api/internal/work'
  if(isMutation&&!externalWebhook&&!authenticatedRunner){
    const origin=request.headers.get('origin')
    if(!process.env.APP_URL||origin!==new URL(process.env.APP_URL).origin)return refuse(403,'Request origin is not allowed','origin')
  }
  // Same-origin form navigation needs a non-null Origin for the CSRF check.
  // No referrer is sent to external payment destinations; handoff also sets no-referrer.
  return privateResponse(NextResponse.next(),path==='/book/payment'?'same-origin':'no-referrer')
}
export const config={matcher:['/api/:path*','/admin/:path*','/account/:path*','/booking/:path*','/staff/:path*','/book/:path*','/updates/preview/:path*']}
