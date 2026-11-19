import type {DbTx} from '@/domain/db/types'
/**
 * Ends every Payload session and pending native reset/verification for one auth account and
 * advances its security revision, so tokens and claims bound to the old revision stop working.
 */
export async function endAccountAccess(tx:DbTx,collection:'customers'|'staff-users',id:string,changes:Record<string,unknown>={}):Promise<number>{
 const account=await tx.payload.findByID({collection,id,depth:0,req:tx.req,overrideAccess:true,showHiddenFields:true}) as {securityRevision?:number|null}
 const revision=(account.securityRevision??1)+1
 // Auth fields are protected from ordinary updates; this trusted command path owns their revocation.
 await tx.payload.update({collection,id,data:{...changes,securityRevision:revision,sessions:[],resetPasswordToken:null,resetPasswordExpiration:null,...(collection==='customers'?{_verificationToken:null}:{})},req:tx.req,overrideAccess:true})
 return revision
}
