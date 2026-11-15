import type {CommandContext} from '@/domain/db/types'
import type {WorkHandlers} from '@/domain/work/types'
import {dispatchCheckout} from '@/domain/payments/create-checkout'
import {paymentObservationHandler} from '@/domain/payments/observation-work'
import {configuredMayaGateway} from './maya/configured'
import {configuredWorkHandlers} from './work-runner'
export function workHandlersFor(ctx:CommandContext):WorkHandlers{
  const handlers:WorkHandlers={...configuredWorkHandlers},gateway=configuredMayaGateway(ctx.policy)
  if(gateway){
    handlers['create-checkout']={execute:(context,lease,signal)=>dispatchCheckout(context,lease,gateway,signal)}
    handlers['payment-observation']=paymentObservationHandler(gateway)
  }
  return handlers
}
