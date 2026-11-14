import type {PayloadEmailAdapter} from 'payload'
/** Fail closed instead of Payload's default console transport, which can print private links. */
export const unconfiguredEmailAdapter:PayloadEmailAdapter=()=>({
  name:'unconfigured',defaultFromAddress:'noreply@acornelia.invalid',defaultFromName:'Acornelia',
  sendEmail:async()=>{throw new Error('Transactional email transport is not configured')},
})
