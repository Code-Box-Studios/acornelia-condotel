export type PaymentObservation={inboxId:string}
export type PaymentApplyResult={state:'confirmed'|'recorded'|'issue'|'duplicate';bookingId?:string;transactionId?:string;issueId?:string}
