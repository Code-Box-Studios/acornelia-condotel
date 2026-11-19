// Usage: APP_OPERATION_MODE=reconcile APP_RECOVERY_GENERATION=<new> RECOVERY_OPERATOR_KEY=<secret> pnpm tsx scripts/recovery/authorize-resumption.ts evidence.json
// The evidence file holds generation, operator, backupTakenAt, restoredAt, providerReconciliation, postBackupReview,
// measuredRecoveryMinutes and approvedTargetMinutes. The key never enters the database or the evidence file.
import './load-env'
import {readFileSync} from 'node:fs'
import {recoveryContext} from './context'
import {authorizeResumption,signResumptionEvidence,type ResumptionEvidence} from '../../src/domain/recovery/resume'
async function main(){
 const file=process.argv[2]
 if(!file)throw new Error('Pass the evidence JSON file')
 const evidence=JSON.parse(readFileSync(file,'utf8')) as ResumptionEvidence,key=process.env.RECOVERY_OPERATOR_KEY
 if(!key)throw new Error('Set RECOVERY_OPERATOR_KEY from the protected operator store')
 const {payload,ctx}=await recoveryContext()
 try{console.log(JSON.stringify(await authorizeResumption(ctx,{...evidence,signature:signResumptionEvidence(evidence,key)})))}finally{await payload.destroy()}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Resumption was not authorized');process.exit(1)})
