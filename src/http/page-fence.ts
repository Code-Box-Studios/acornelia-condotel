import {getDatabase} from '@/domain/db/payload'
import {assertOperationAllowed,type OperationClass} from '@/config/operation-mode'
import {currentFence} from '@/domain/recovery/fence'
/** Server-rendered pages and server functions refuse to run, before any session check, while the fence is closed. */
export async function assertPageFence(operation:OperationClass='authentication'):Promise<void>{assertOperationAllowed(operation,await currentFence(await getDatabase()))}
