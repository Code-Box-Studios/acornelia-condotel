export type Id = string
export type PropertyDate = string
export type Instant = string
export type Money = { minor: string; currency: string }
export type Occupancy = { adults: number; children: number }
export type Principal =
  | { kind: 'anonymous' }
  | { kind: 'customer'; collection: 'customers'; id: Id }
  | { kind: 'staff'; collection: 'staff-users'; id: Id; role: 'staff' | 'developer' }
  | { kind: 'system'; purpose: 'payments' | 'work' | 'email' | 'recovery' }
export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; code: E }
export interface Clock { now(): Instant; today(timezone: string): PropertyDate }
