import {formatMoney} from '@/domain/shared/money'
import type {Money} from '@/domain/shared/types'
export const stayLabels:Record<string,string>={expected:'Expected','in-house':'In house',departed:'Departed','no-show':'No-show',unconfirmed:'Awaiting payment','not-staying':'Not staying'}
export const statusLabels:Record<string,string>={held:'Held',confirmed:'Confirmed',completed:'Completed',cancelled:'Cancelled',expired:'Expired'}
export function money(value:Money|null|undefined){return value?formatMoney(value):'—'}
export function moneyList(values:Money[]){return values.length?values.map(formatMoney).join(' · '):'—'}
export function when(value:string|null|undefined,timezone='Asia/Manila'){return value?new Intl.DateTimeFormat('en-PH',{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—'}
export type BadgeTone='default'|'secondary'|'destructive'|'success'|'warning'|'info'|'outline'
export const statusTones:Record<string,BadgeTone>={held:'warning',confirmed:'success',completed:'secondary',cancelled:'destructive',expired:'outline'}
export const stayTones:Record<string,BadgeTone>={expected:'info','in-house':'success',departed:'secondary','no-show':'warning',unconfirmed:'warning','not-staying':'outline'}
