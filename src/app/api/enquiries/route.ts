import {fenced} from '@/http/fence'
import {ZodError} from 'zod'
import {requestContext} from '@/features/auth/context'
import {submitEnquiry,type EnquiryInput} from '@/content/posts'
import {readBoundedJson} from '@/http/body'
const headers={'Cache-Control':'private, no-store'}
async function handlePOST(request:Request){
  try{const input=await readBoundedJson(request),ctx=await requestContext(request),id=await submitEnquiry(ctx,input as EnquiryInput);return Response.json({id,state:'received'},{status:201,headers})}
  catch(error){
    const message=error instanceof Error?error.message:''
    if(message==='Please wait before sending another enquiry')return Response.json({error:message},{status:429,headers})
    if(message==='Enquiry reference conflict')return Response.json({error:'This enquiry reference has already been used. Refresh the form to send a new enquiry.'},{status:409,headers})
    if(error instanceof ZodError||error instanceof SyntaxError||['JSON request required','Request body required','Request body too large'].includes(message))return Response.json({error:'Review the form fields and try again.'},{status:400,headers})
    return Response.json({error:'Enquiries are temporarily unavailable. Please try again shortly.'},{status:503,headers})
  }
}
export const POST=fenced('business-write',handlePOST)
