import type {AuditEntry} from '@/payload-types'
export type AuditInput={action:string;recordType:string;recordId?:string;outcome:'success'|'refused'|'failed'|'unknown';safeChanges?:Record<string,unknown>}
export type AuditFilter={limit?:number;cursor?:string;action?:string;recordType?:string}
export type AuditPage={items:AuditEntry[];nextCursor:string|null}
