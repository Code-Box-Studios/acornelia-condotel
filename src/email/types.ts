export type Sender={address:string;name:string}
export type TransactionalMessage={id:string;kind:'booking'|'booking-view'|'auth'|'claim'|'staff-reset'|'enquiry'|'payment-issue';from:Sender;to:string[];cc:string[];subject:string;html:string;text:string}
export type DeliveryResult={kind:'accepted';providerMessageId:string}|{kind:'refused';reason:'temporary'|'permanent'}|{kind:'unknown';reason:'timeout'|'transport'|'partial'}
/** Acceptance means the SMTP server accepted all recipients, not that an inbox received mail. */
export interface TransactionalMailer{send(message:TransactionalMessage,signal?:AbortSignal):Promise<DeliveryResult>}
export type BookingMailSnapshot={code:string;recipient:string;name:string;room:string;arrival:string;departure:string;adults:number;children:number;total:{minor:string;currency:string};timezone:string}
