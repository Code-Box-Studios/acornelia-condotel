import { z } from 'zod'
import type { Money } from './types'
const moneySchema = z.object({ minor: z.string().regex(/^(0|[1-9]\d*)$/), currency: z.string().regex(/^[A-Z]{3}$/) }).strict()
export function parseMoney(input: unknown): Money { return moneySchema.parse(input) }
export function addMoney(left: Money, right: Money): Money {
  const a = parseMoney(left), b = parseMoney(right)
  if (a.currency !== b.currency) throw new Error('Currency mismatch')
  return { minor: (BigInt(a.minor) + BigInt(b.minor)).toString(), currency: a.currency }
}
export function formatMoney(value: Money): string {
  const {minor,currency} = parseMoney(value)
  const amount=BigInt(minor)
  return `${currency === 'PHP' ? '₱' : `${currency} `}${(amount/100n).toLocaleString('en-US')}.${(amount%100n).toString().padStart(2,'0')}`
}
