import {z,ZodError} from 'zod'
import {requestContext} from '@/features/auth/context'
import {readDraftSession,setDraftCookies} from '@/features/booking/draft-http'
import {saveCheckoutDraft,type CheckoutDraft} from '@/features/booking/draft'
import {readBoundedJson} from '@/http/body'
export async function POST(request:Request){
  try{
    const ctx=await requestContext(request),session=readDraftSession(request,ctx,true)!
    const body=z.object({draft:z.unknown(),expectedVersion:z.number().int().min(1).optional()}).strict().parse(await readBoundedJson(request))
    if(body.expectedVersion===undefined)session.ref=undefined
    const ref=await saveCheckoutDraft(body.draft as CheckoutDraft,{...session,expectedVersion:body.expectedVersion})
    const response=Response.json({version:ref.version},{headers:{'Cache-Control':'private, no-store'}})
    setDraftCookies(response.headers,session,ref)
    return response
  }catch(error){
    const message=error instanceof Error?error.message:''
    if(message.includes('changed in another tab'))return Response.json({error:message},{status:409})
    return Response.json({error:error instanceof ZodError?'Review the entered details.':'Your saved selection is unavailable. Choose your dates again.'},{status:400})
  }
}
