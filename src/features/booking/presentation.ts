import type {Money} from '@/domain/shared/types'
export function formatBookingMoney(value:Money){
  if(!/^(0|[1-9]\d*)$/.test(value.minor))return 'Amount being checked'
  const minor=BigInt(value.minor),whole=minor/100n,cents=(minor%100n).toString().padStart(2,'0')
  return `${value.currency==='PHP'?'₱':value.currency+' '}${whole.toLocaleString('en-PH')}.${cents}`
}
export function formatBookingDeadline(value:string,timezone:string){try{return new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:timezone}).format(new Date(value))}catch{return value}}
