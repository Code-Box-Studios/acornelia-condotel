import {NextResponse,type NextRequest} from 'next/server'
function privateResponse(response:NextResponse):NextResponse{
  response.headers.set('Cache-Control','private, no-store, max-age=0')
  response.headers.set('Vary','Cookie, Authorization')
  return response
}
function refuse(status:number,message:string){return privateResponse(NextResponse.json({error:message},{status}))}
export function proxy(request:NextRequest){
  let path:string
  try{path=decodeURIComponent(request.nextUrl.pathname).replace(/\/+$/,'')}catch{return refuse(400,'Invalid request')}
  // Payload's first-register endpoint bypasses ordinary create access when no user exists.
  if(/^\/api\/(staff-users|customers)\/first-register$/.test(path))return refuse(403,'Account creation is unavailable here')
  if(path==='/admin/create-first-user')return refuse(403,'Staff access requires the property operator')
  if(process.env.APP_OPERATION_MODE!=='normal')return refuse(503,'This service is temporarily unavailable')
  if(/^\/api\/(staff-users|customers)\/forgot-password$/.test(path)&&!process.env.EMAIL_TRANSPORT)return refuse(503,'Account recovery is temporarily unavailable')
  if(path==='/api/graphql')return refuse(403,'This service is unavailable')
  if(process.env.APP_ENV==='production'&&process.env.CUSTOMER_AUTH_METHOD!=='email-password'&&(path.startsWith('/api/customers')||path.startsWith('/account')))return refuse(503,'Customer access is temporarily unavailable')
  const isMutation=!['GET','HEAD','OPTIONS'].includes(request.method)
  const externalWebhook=path==='/api/webhooks/maya'
  const authenticatedRunner=path==='/api/internal/work'
  if(isMutation&&!externalWebhook&&!authenticatedRunner){
    const origin=request.headers.get('origin')
    if(!process.env.APP_URL||origin!==new URL(process.env.APP_URL).origin)return refuse(403,'Request origin is not allowed')
  }
  return privateResponse(NextResponse.next())
}
export const config={matcher:['/api/:path*','/admin/:path*','/account/:path*','/booking/:path*','/book/:path*']}
