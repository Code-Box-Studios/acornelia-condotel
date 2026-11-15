import {createPublicKey} from 'node:crypto'
import {parseEnvironment} from '@/config/env'
import type {MayaSignatureConfig} from './signature'
export function configuredMayaSignature():MayaSignatureConfig|null{
  try{
    const environment=parseEnvironment(process.env),keyEnvironment=process.env.MAYA_WEBHOOK_KEY_ENVIRONMENT
    if(keyEnvironment!==environment.mayaEnvironment)return null
    const publicKeys=[process.env.MAYA_WEBHOOK_PUBLIC_KEY_1,process.env.MAYA_WEBHOOK_PUBLIC_KEY_2].map(value=>{if(!value)throw new Error('Webhook keys required');const pem=value.replaceAll('\\n','\n'),key=createPublicKey(pem);if(key.asymmetricKeyType!=='rsa'||(key.asymmetricKeyDetails?.modulusLength??0)<2048)throw new Error('Invalid webhook key');return pem})
    const toleranceMs=Number(process.env.MAYA_WEBHOOK_TOLERANCE_MS||300000)
    if(new Set(publicKeys.map(pem=>createPublicKey(pem).export({format:'der',type:'spki'}).toString('hex'))).size!==2||!Number.isInteger(toleranceMs)||toleranceMs<1000||toleranceMs>300000)return null
    return {environment:environment.mayaEnvironment,keyEnvironment,publicKeys,toleranceMs}
  }catch{return null}
}
