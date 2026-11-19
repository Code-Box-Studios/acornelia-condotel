'use client'
import {useState} from 'react'
import {ActionForm} from '@/admin/shared/ActionForm'
/** Room blocks keep the inventory module's own developer and policy checks. */
export function BlockActions({rooms,blocks}:{rooms:{id:string;label:string}[];blocks:{id:string;label:string}[]}){
 const [message,setMessage]=useState('')
 return <section className="staff-panel" aria-labelledby="blocks-heading"><h2 id="blocks-heading">Maintenance and owner blocks</h2>{message&&<p role="status" className="staff-message">{message}</p>}
  <ActionForm endpoint="/api/operations/blocks" fixed={{action:'create'}} onSuccess={setMessage} submitLabel="Block room" successMessage="Room blocked" fields={[{name:'roomId',label:'Room',kind:'select',required:true,options:rooms.map(room=>({value:room.id,label:room.label}))},{name:'arrival',label:'First blocked night',kind:'date',required:true},{name:'departure',label:'Available again',kind:'date',required:true},{name:'reason',label:'Reason',kind:'text',required:true,maxLength:1200}]}/>
  {blocks.length>0&&<ul className="staff-queue">{blocks.map(block=><li key={block.id}><p>{block.label}</p><ActionForm endpoint="/api/operations/blocks" fixed={{action:'release',blockId:block.id}} onSuccess={setMessage} tone="quiet" submitLabel="Release block" successMessage="Block released"/></li>)}</ul>}
 </section>
}
