import {z} from 'zod'
import type {CheckoutRejection} from './types'
const name=z.string().trim().min(1).max(160).regex(/^[^\u0000-\u001f\u007f]+$/)
export const checkoutInputSchema=z.object({commandKey:z.uuid(),quoteId:z.uuid(),version:z.number().int().positive(),contact:z.object({name,email:z.string().trim().toLowerCase().max(254).pipe(z.email()),phone:z.string().trim().min(1).max(40).regex(/^[^\u0000-\u001f\u007f]+$/).optional()}).strict(),stayingGuest:name.optional()}).strict()
export const checkoutPolicySchema=z.object({payment:z.literal('full'),holdMinutes:z.number().int().min(1).max(120),thirdPartyBookings:z.boolean()}).strict()
export class CheckoutRefused extends Error{constructor(public readonly code:CheckoutRejection){super('Checkout could not be prepared')}}
export function sqlError(error:unknown,depth=0):{code?:string;constraint?:string}{if(!error||typeof error!=='object'||depth>6)return {};const row=error as {code?:string;constraint?:string;cause?:unknown};return row.code?row:sqlError(row.cause,depth+1)}
