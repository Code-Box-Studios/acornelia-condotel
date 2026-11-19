import {z} from 'zod'
/**
 * Classes of work the external recovery fence can allow. The fence lives outside the database
 * (environment), so a restored database cannot re-open itself.
 */
export type OperationClass='public-read'|'provider-intake'|'recovery'|'authentication'|'private-link'|'business-write'|'worker'|'outbound-money'|'outbound-email'
export type Fence={mode:'quarantine'|'reconcile'|'normal';expectedGeneration:string;databaseGeneration:string|null}
export class OperationFenced extends Error{constructor(public operation:OperationClass){super('This service is temporarily unavailable')}}
const generation=z.string().regex(/^[A-Za-z0-9._-]{1,80}$/)
/** Missing configuration fails closed: quarantine mode and generation '1'. */
export function fenceFrom(env:Record<string,string|undefined>,databaseGeneration:string|null):Fence{
 return {mode:z.enum(['quarantine','reconcile','normal']).parse(env.APP_OPERATION_MODE||'quarantine'),expectedGeneration:generation.parse(env.APP_RECOVERY_GENERATION||'1'),databaseGeneration}
}
const always:OperationClass[]=['public-read','provider-intake']
export function operationAllowed(operation:OperationClass,fence:Fence):boolean{
 if(always.includes(operation))return true
 if(fence.mode==='reconcile')return operation==='recovery'
 // Normal service needs the database to have accepted the external generation; a restored copy has not.
 return fence.mode==='normal'&&fence.databaseGeneration!==null&&fence.databaseGeneration===fence.expectedGeneration&&operation!=='recovery'
}
export function assertOperationAllowed(operation:OperationClass,fence:Fence):void{if(!operationAllowed(operation,fence))throw new OperationFenced(operation)}
/** System evidence work: normal service, or the recovery operator during the reconcile stage. */
export function systemModeAllowed(purpose:string):boolean{const mode=fenceFrom(process.env,null).mode;return mode==='normal'||mode==='reconcile'&&purpose==='recovery'}
