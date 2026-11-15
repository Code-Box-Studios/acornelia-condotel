import type {Money} from '@/domain/shared/types'
export type MayaEnvironment='sandbox'|'production'
export type CheckoutAttempt={id:string;bookingId:string;merchantReference:string;amount:Money;revision:number;deadline:string;synthetic:boolean}
export type ProviderPayment={id:string;environment:MayaEnvironment;reference:string;amount:Money;status:string;method:string|null;paidAt:string|null;canVoid:boolean;canRefund:boolean}
export type ProviderMoneyRequest={operationId:string;paymentId:string;reference:string;amount:Money;reason:'guest-cancellation'|'stay-change'|'duplicate-payment'|'late-payment'|'manual-review'}
export type ProviderRefusal='configuration'|'invalid-input'|'unsupported-method'|'provider-authentication'|'ineligible'|'reconciliation-required'
export type CreateCheckoutResult=
  |{kind:'created';environment:MayaEnvironment;checkoutId:string;checkoutUrl:string}
  |{kind:'refused';reason:ProviderRefusal}
  |{kind:'unknown';environment:MayaEnvironment;reference:string}
export type ProviderMoneyResult=
  |{kind:'verified';environment:MayaEnvironment;id:string;paymentId:string;status:'SUCCESS'|'FAILED';amount:Money}
  |{kind:'refused';reason:ProviderRefusal}
  |{kind:'unknown';environment:MayaEnvironment;paymentId:string;operationId:string}
export interface MayaGateway {
  createCheckout(attempt:CheckoutAttempt,signal?:AbortSignal):Promise<CreateCheckoutResult>
  retrievePayment(id:string,signal?:AbortSignal):Promise<ProviderPayment>
  findPaymentsByReference(reference:string,signal?:AbortSignal):Promise<ProviderPayment[]>
  voidPayment(request:ProviderMoneyRequest,signal?:AbortSignal):Promise<ProviderMoneyResult>
  refundPayment(request:ProviderMoneyRequest,signal?:AbortSignal):Promise<ProviderMoneyResult>
}
export type MayaConfig={environment:MayaEnvironment;appEnv:'development'|'test'|'preview'|'production';appUrl:string;publicKey:string;secretKey:string;timeoutMs:number;capabilities:{environment:MayaEnvironment;approvalReference:string;checkoutEnabled:boolean;kountEnabled:boolean;voidEnabled:boolean;refundEnabled:boolean;partialRefunds:boolean;moneyMethods:string[];maxAmountMinor:string}}
export type MayaDependencies={fetch:typeof fetch;now:()=>string}
