import {ZodError} from 'zod'
import {OperationsAccessError,StaffFacingError} from '@/domain/operations/policy'
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}
export function staffJson(value:unknown,status=200){return Response.json(value,{status,headers})}
/** Domain refusals written for staff are shown; database and framework errors stay generic. */
export function staffMessage(error:unknown):string|null{
 if(error instanceof StaffFacingError)return error.message
 if(error instanceof Error&&error.constructor===Error&&error.message.length<=200&&!error.message.includes('\n'))return error.message
 return null
}
export function staffFailure(error:unknown){
 if(error instanceof OperationsAccessError)return staffJson({error:'This action is not approved for your account.'},403)
 if(error instanceof ZodError||error instanceof SyntaxError)return staffJson({error:'Review the entered details and try again.'},400)
 return staffJson({error:staffMessage(error)??'The action could not be completed. Reload the page and check the current record.'},409)
}
export function staffDenied(){return staffJson({error:'Signed-in staff access is required.'},403)}
