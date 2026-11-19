// Run with APP_OPERATION_MODE=reconcile after restoring a backup: reads Maya for open attempts and collections.
import './load-env'
import {recoveryContext} from './context'
import {reconcileRestoredState} from '../../src/domain/recovery/reconcile'
import {recoveryReadGateway} from '../../src/integrations/maya/configured'
async function main(){
 const {payload,ctx}=await recoveryContext()
 try{
  const gateway=recoveryReadGateway(ctx.policy)
  if(!gateway)throw new Error('Set APP_OPERATION_MODE=reconcile and the approved Maya read configuration')
  console.log(JSON.stringify(await reconcileRestoredState(ctx,gateway)))
 }finally{await payload.destroy()}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Reconciliation failed');process.exit(1)})
