import {ZodError,z} from 'zod'
import {getDatabase} from '@/domain/db/payload'
import {requestContext} from '@/features/auth/context'
import {registerCustomer,requestCustomerRecovery,activateCustomer,resetCustomerPassword} from '@/features/auth/actions'
import {loginCustomer,logoutCustomer} from '@/features/auth/login'
import {readBoundedJson} from '@/http/body'
import {readDraftSession,setDraftCookies,clearDraftCookies} from '@/features/booking/draft-http'
import {resumeCheckoutDraft,saveCheckoutDraft} from '@/features/booking/draft'
function response(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})}
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
  const {action}=await params
  try{
    const ctx=await requestContext(request),payload=await getDatabase()
    if(action==='logout'){
      const result=response({state:'signed-out'});result.headers.append('Set-Cookie',await logoutCustomer(payload,request.headers));clearDraftCookies(result.headers);return result
    }
    const input=await readBoundedJson(request)
    if(action==='register')return response(await registerCustomer(ctx,input as {name:string;email:string}),202)
    if(action==='recover'){const parsed=z.object({email:z.string()}).strict().parse(input);return response(await requestCustomerRecovery(ctx,parsed.email),202)}
    if(action==='activate'){const parsed=z.object({token:z.string(),name:z.string(),password:z.string()}).strict().parse(input);await activateCustomer(ctx,parsed.token,{name:parsed.name,password:parsed.password});return response({state:'activated'})}
    if(action==='reset'){const parsed=z.object({token:z.string(),password:z.string()}).strict().parse(input);await resetCustomerPassword(ctx,parsed.token,parsed.password);return response({state:'reset'})}
    if(action==='login'){
      const authenticated=await loginCustomer(ctx,payload,input,request.headers),result=response({principal:authenticated.principal})
      result.headers.append('Set-Cookie',authenticated.cookie)
      const session=readDraftSession(request,{...ctx,actor:authenticated.principal})
      if(session?.ref){
        try{const draft=await resumeCheckoutDraft(session.ref,authenticated.principal,session);const ref=await saveCheckoutDraft(draft,{...session,expectedVersion:draft.version});setDraftCookies(result.headers,session,ref)}catch{clearDraftCookies(result.headers)}
      }
      return result
    }
    return response({error:'This action is unavailable'},404)
  }catch(error){
    const message=error instanceof Error?error.message:''
    if(message==='Email or password is incorrect')return response({error:message},401)
    if(error instanceof ZodError||error instanceof SyntaxError||message==='This link is invalid or has expired')return response({error:action==='login'?'Email or password is incorrect':action==='activate'||action==='reset'?'This link is invalid or has expired. Request a new link.':'Review the form fields and try again.'},400)
    return response({error:'Customer access is temporarily unavailable. Please try again shortly.'},503)
  }
}
