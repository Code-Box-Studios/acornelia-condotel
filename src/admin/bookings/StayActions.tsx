'use client'
import {useRef,useState} from 'react'
import {useRouter} from 'next/navigation'
import type {StayActionKind} from '@/domain/operations/read'
const labels:Record<StayActionKind,string>={'check-in':'Check in','check-out':'Check out','no-show':'Record no-show'}
const done:Record<StayActionKind,string>={'check-in':'Checked in','check-out':'Checked out','no-show':'No-show recorded'}
/** Front-desk buttons offered by the server for today's property date. The server re-checks every press. */
export function StayActions({bookingId,revision,actions}:{bookingId:string;revision:number;actions:StayActionKind[]}){
 const router=useRouter(),keys=useRef<Partial<Record<StayActionKind,string>>>({}),[busy,setBusy]=useState<StayActionKind|null>(null),[status,setStatus]=useState(''),[error,setError]=useState('')
 async function run(action:StayActionKind){
  setBusy(action);setError('');setStatus('')
  try{
   const commandKey=keys.current[action]??crypto.randomUUID();keys.current[action]=commandKey
   const response=await fetch('/api/operations/stay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commandKey,bookingId,expectedRevision:revision,action})}),result=await response.json().catch(()=>({}))
   if(!response.ok)throw new Error(typeof result.error==='string'?result.error:'The stay action could not be recorded.')
   delete keys.current[action];setStatus(done[action]);router.refresh()
  }catch(cause){setError(cause instanceof Error?cause.message:'The stay action could not be recorded.')}
  finally{setBusy(null)}
 }
 return <section className="staff-panel" aria-labelledby="front-desk-heading"><h2 id="front-desk-heading">Front desk</h2>
  {actions.length?<div className="staff-buttons">{actions.map(action=><button key={action} className={action==='no-show'?'button button-quiet':'button'} type="button" disabled={!!busy} onClick={()=>void run(action)}>{busy===action?'Saving…':labels[action]}</button>)}</div>:<p>No front-desk action is available for this booking today.</p>}
  {status&&<p role="status">{status}</p>}{error&&<p role="alert" className="form-error">{error}</p>}
 </section>
}
