export type ClaimError='expired'|'used'|'conflict'|'insufficient-evidence'
export type ClaimEvidence={purpose:'booking-claim';approvalId:string;token:string}
export type HistoricalProof={method:'staff-reviewed-original-evidence';reviewReference:string}
export type IssueClaimInput={bookingId:string;customerId:string;proof:HistoricalProof}
