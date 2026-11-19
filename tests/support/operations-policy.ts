import type {OperationsPolicy} from '@/domain/operations/policy'
export type OperationsOverrides=Partial<Omit<OperationsPolicy,'roles'>>&{roles?:Partial<OperationsPolicy['roles']>}
const all:('staff'|'developer')[]=['staff','developer']
export function syntheticOperationsPolicy(overrides:OperationsOverrides={}):OperationsPolicy{
 const roles={view:all,stay:all,notes:all,issues:all,enquiries:all,reports:all,exports:['developer'] as ('staff'|'developer')[]}
 return {noShowFromHour:20,upcomingDays:7,reportMaxDays:93,...overrides,roles:{...roles,...(overrides.roles??{})}}
}
