import {staffPageContext} from '@/features/staff/page-context'
import {readPaymentQueue,type PaymentQueue} from '@/domain/operations/read'
import {OperationsAccessError} from '@/domain/operations/policy'
import {StaffShell,StaffUnavailable} from '@/admin/shared/StaffShell'
import {PaymentQueueActions} from '@/admin/payments/PaymentQueueActions'
export const metadata={title:'Payments — staff',robots:{index:false,follow:false}}
export default async function StaffPayments(){
 const ctx=await staffPageContext();let queue:PaymentQueue
 try{queue=await readPaymentQueue(ctx)}catch(error){return <StaffShell title="Payments" description="Money exceptions and refund follow-up." current="/staff/payments"><StaffUnavailable denied={error instanceof OperationsAccessError}/></StaffShell>}
 return <StaffShell title="Payments" description="Money exceptions and refund follow-up. Recording a decision here never moves money by itself." current="/staff/payments"><PaymentQueueActions queue={queue}/></StaffShell>
}
