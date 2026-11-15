import type {CommandContext,DbTx} from '@/domain/db/types'
export const workKinds=['create-checkout','payment-observation','reconcile-payment','reconcile-refund','expire-hold','email','refund','enquiry'] as const
export type WorkKind=typeof workKinds[number]
export type WorkPayload={inboxId:string}|{attemptId:string}|{bookingId:string}|{refundId:string}|{enquiryId:string}|{category:'auth';messageId:string}|{category:'booking';bookingId:string;revision:number}|{category:'staff';messageId:string}
export type WorkIntent={semanticKey:string;kind:WorkKind;payload:WorkPayload;availableAt:string}
export type WorkLease={id:string;kind:WorkKind;payload:WorkPayload;generation:number;owner:string;expiresAt:string;attempts:number}
export type WorkReason='retryable'|'timeout'|'provider-unavailable'|'transport-unconfigured'|'invalid-work'|'unexpected'|'lease-expired-after-dispatch'|'attempts-exhausted'
/** apply is internal database-only code. Network calls must finish before completion opens a transaction. */
export type WorkResult={state:'done'|'retry'|'uncertain'|'failed';reason?:WorkReason;apply?:(tx:DbTx)=>Promise<void>}
export type WorkHandler={preflight?:(ctx:CommandContext,lease:WorkLease)=>Promise<WorkResult|null>;execute:(ctx:CommandContext,lease:WorkLease,signal:AbortSignal)=>Promise<WorkResult>}
export type WorkHandlers=Partial<Record<WorkKind,WorkHandler>>
