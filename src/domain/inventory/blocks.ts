import {z} from 'zod'
import type {CommandContext} from '@/domain/db/types'
import {dateToStorage,nightsBetween} from '@/domain/shared/dates'
import {appendAudit} from '@/domain/audit/append'
import {relationshipId} from '@/features/customer/bookings'
import {allocate,release} from './allocate'
import {requireInventoryPolicy} from './policy'
import type {OpeningInventoryRow,OpeningPreview} from './types'
function operator(ctx:CommandContext,operation:'blocks'|'openingPreview'){
  if(ctx.actor.kind!=='staff'||ctx.actor.role!=='developer')throw new Error('Inventory operations require an authorized operator')
  const policy=z.object({blocks:z.boolean(),openingPreview:z.boolean()}).strict().parse(requireInventoryPolicy(ctx.policy,'inventory-operations'))
  if(!policy[operation])throw new Error('Inventory operation is not approved')
}
const blockSchema=z.object({roomId:z.uuid(),arrival:z.string(),departure:z.string(),reason:z.string().trim().min(1).max(1200)}).strict()
export async function createRoomBlock(ctx:CommandContext,input:{roomId:string;arrival:string;departure:string;reason:string}):Promise<{id:string}>{
  operator(ctx,'blocks');const parsed=blockSchema.parse(input);nightsBetween(parsed.arrival,parsed.departure)
  return ctx.uow.run(ctx.actor,async tx=>{
    const allocation=await allocate(tx,{purpose:'block',roomId:parsed.roomId,arrival:parsed.arrival,departure:parsed.departure})
    const row=await tx.payload.create({collection:'room-blocks',data:{room:parsed.roomId,allocation:allocation.id,arrival:allocation.arrival,departure:allocation.departure,reason:parsed.reason,state:'active'},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'inventory:block-created',recordType:'room-blocks',recordId:row.id,outcome:'success',safeChanges:{roomId:parsed.roomId,arrival:parsed.arrival,departure:parsed.departure}})
    return {id:row.id}
  })
}
export async function releaseRoomBlock(ctx:CommandContext,id:string):Promise<void>{
  operator(ctx,'blocks');z.uuid().parse(id)
  await ctx.uow.run(ctx.actor,async tx=>{
    const row=await tx.payload.findByID({collection:'room-blocks',id,depth:0,req:tx.req,overrideAccess:false})
    if(row.state==='released')return
    await release(tx,relationshipId(row.allocation)!)
    await tx.payload.update({collection:'room-blocks',id,data:{state:'released',releasedAt:ctx.clock.now()},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'inventory:block-released',recordType:'room-blocks',recordId:id,outcome:'success'})
  })
}
const openingRow=z.object({roomId:z.uuid(),arrival:z.string(),departure:z.string(),kind:z.enum(['booking','block']),externalReference:z.string().trim().min(1).max(120)}).strict()
export async function previewOpeningInventory(ctx:CommandContext,input:OpeningInventoryRow[]):Promise<OpeningPreview>{
  operator(ctx,'openingPreview');z.array(z.unknown()).max(500).parse(input)
  return ctx.uow.run(ctx.actor,async tx=>{
    const issues:OpeningPreview['issues']=[],references=new Set<string>(),valid:z.infer<typeof openingRow>[]=[]
    for(const [index,value] of input.entries()){
      const parsed=openingRow.safeParse(value)
      if(!parsed.success){issues.push({row:index,code:'invalid'});continue}
      const row=parsed.data
      try{nightsBetween(row.arrival,row.departure)}catch{issues.push({row:index,code:'invalid'});continue}
      if(references.has(row.externalReference))issues.push({row:index,code:'duplicate-reference'})
      references.add(row.externalReference)
      const room=(await tx.payload.find({collection:'rooms',where:{id:{equals:row.roomId}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
      if(!room||!room.roomType){issues.push({row:index,code:'unknown-room'});continue}
      const occupied=await tx.payload.find({collection:'allocations',where:{and:[{room:{equals:row.roomId}},{released:{equals:false}},{arrival:{less_than:dateToStorage(row.departure)}},{departure:{greater_than:dateToStorage(row.arrival)}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})
      if(occupied.docs.length||valid.some(previous=>previous.roomId===row.roomId&&previous.arrival<row.departure&&previous.departure>row.arrival))issues.push({row:index,code:'overlap'})
      valid.push(row)
    }
    await appendAudit(tx,{action:'inventory:import-previewed',recordType:'rooms',outcome:'success',safeChanges:{reasonCode:issues.length?'conflicts-found':'validated'}})
    return {valid:issues.length===0,issues}
  })
}
