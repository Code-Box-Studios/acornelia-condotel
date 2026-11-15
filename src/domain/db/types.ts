import type {Payload,PayloadRequest} from 'payload'
import type {Principal} from '../shared/types'
import type {PolicySnapshot} from '../policy/types'
import type {Clock} from '../shared/types'
export type DbTx={payload:Payload;req:PayloadRequest;actor:Principal}
export interface UnitOfWork {run<T>(actor:Principal,work:(tx:DbTx)=>Promise<T>):Promise<T>}
export type CommandContext={actor:Principal;policy:PolicySnapshot;clock:Clock;uow:UnitOfWork;requestId:string;browserKey?:string}
