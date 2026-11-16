import {configuredMailer} from '@/email/transport'
import {emailHandler} from '@/email/deliver'
import type {CommandContext} from '@/domain/db/types'
import type {WorkHandlers} from '@/domain/work/types'
import {checkoutPreflight,dispatchCheckout} from '@/domain/payments/create-checkout'
import {paymentObservationHandler} from '@/domain/payments/observation-work'
import {reconcileWork} from '@/domain/payments/reconcile'
import {expiryHandler} from '@/domain/payments/expire'
import {configuredMayaGateway} from './maya/configured'
import {configuredWorkHandlers} from './work-runner'
export function workHandlersFor(ctx:CommandContext):WorkHandlers{
  const handlers:WorkHandlers={...configuredWorkHandlers},gateway=configuredMayaGateway(ctx.policy),readGateway=configuredMayaGateway(ctx.policy,{requireCheckout:false})
  if(gateway)handlers['create-checkout']={preflight:checkoutPreflight,execute:(context,lease,signal)=>dispatchCheckout(context,lease,gateway,signal)}
  if(readGateway){
    handlers['payment-observation']=paymentObservationHandler(readGateway)
    handlers['reconcile-payment']={execute:(context,lease,signal)=>reconcileWork(context,lease,readGateway,signal)}
    handlers['expire-hold']=expiryHandler(readGateway)
  }
  const mailer=configuredMailer(ctx.policy)
  if(mailer){handlers.email=emailHandler(mailer);handlers.enquiry=emailHandler(mailer)}
  return handlers
}
