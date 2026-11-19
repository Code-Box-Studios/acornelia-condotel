import type {CommandContext} from '@/domain/db/types'
import type {MayaGateway} from '@/integrations/maya/types'
import {requireRefundPolicy,refundStaff} from './policy'
import {reconcilePaymentRefunds} from './reconcile'
/**
 * Staff-triggered merchant read for one collection. It imports refunds made in the Maya
 * dashboard and, when the read is complete, refreshes the check that repayment authorization needs.
 */
export async function checkPaymentRefunds(ctx:CommandContext,paymentId:string,gateway:MayaGateway){
 refundStaff(ctx)
 await ctx.uow.run(ctx.actor,tx=>requireRefundPolicy(tx,ctx))
 return reconcilePaymentRefunds({...ctx,actor:{kind:'system',purpose:'payments'}},paymentId,gateway)
}
