'use client'
import {useId,useRef,useState} from 'react'
import {useRouter} from 'next/navigation'
import {Button} from '@/components/ui/button'
import {Alert,AlertDescription} from '@/components/ui/alert'
import {Input} from '@/components/ui/input'
import {NativeSelect,NativeSelectOption} from '@/components/ui/native-select'
import {Textarea} from '@/components/ui/textarea'
export type ActionField={name:string;label:string;kind:'text'|'textarea'|'select'|'date'|'money';options?:{value:string;label:string}[];required?:boolean;maxLength?:number;hint?:string;defaultValue?:string}
type Props={endpoint:string;envelope?:string;fields?:ActionField[];fixed?:Record<string,unknown>;submitLabel:string;successMessage:string;idempotent?:boolean;onSuccess?:(message:string)=>void;className?:string;tone?:'primary'|'quiet'}
/** Converts a peso amount with at most two decimals into exact minor units. */
export function minorFromMajor(value:string){const parts=/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value.trim());if(!parts)throw new Error('Enter an amount with up to two decimal places.');return (BigInt(parts[1])*100n+BigInt((parts[2]||'').padEnd(2,'0'))).toString()}
function newKey(){return crypto.randomUUID()}
/**
 * Posts one controlled staff action. The command key survives a lost response so a retry
 * replays the same server command; it is replaced only after a confirmed result.
 */
export function ActionForm({endpoint,envelope,fields=[],fixed={},submitLabel,successMessage,idempotent=false,onSuccess,className,tone='primary'}:Props){
 const router=useRouter(),id=useId(),key=useRef<string>(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('')
 async function submit(form:HTMLFormElement){
  setBusy(true);setError('');setStatus('')
  try{
   const data=new FormData(form),values:Record<string,unknown>={...fixed}
   for(const field of fields){const raw=String(data.get(field.name)??'').trim();if(!raw&&!field.required)continue;values[field.name]=field.kind==='money'?{minor:minorFromMajor(raw),currency:'PHP'}:raw}
   if(idempotent){if(!key.current)key.current=newKey();values.commandKey=key.current}
   const body=envelope?{action:envelope,input:values}:values
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json().catch(()=>({}))
   if(!response.ok)throw new Error(typeof result.error==='string'?result.error:'The action could not be completed.')
   key.current='';form.reset()
   if(onSuccess)onSuccess(successMessage);else setStatus(successMessage)
   router.refresh()
  }catch(cause){setError(cause instanceof Error?cause.message:'The action could not be completed.')}
  finally{setBusy(false)}
 }
 return <form className={'staff-action '+(className??'')} aria-busy={busy} onSubmit={event=>{event.preventDefault();void submit(event.currentTarget)}}>
  {fields.map(field=>{const control=id+field.name,hint=field.hint?control+'-hint':undefined
   return <div key={field.name} className="staff-field"><label htmlFor={control}>{field.label}</label>
    {field.kind==='textarea'?<Textarea id={control} name={field.name} required={field.required} maxLength={field.maxLength} defaultValue={field.defaultValue} rows={3} aria-describedby={hint}/>
    :field.kind==='select'?<NativeSelect id={control} name={field.name} required={field.required} defaultValue={field.defaultValue??''} aria-describedby={hint}><NativeSelectOption value="" disabled>Choose…</NativeSelectOption>{field.options?.map(option=><NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}</NativeSelect>
    :<Input id={control} name={field.name} type={field.kind==='date'?'date':'text'} inputMode={field.kind==='money'?'decimal':undefined} required={field.required} maxLength={field.maxLength} defaultValue={field.defaultValue} aria-describedby={hint}/>}
    {field.hint&&<small id={hint}>{field.hint}</small>}</div>})}
  <Button variant={tone==='primary'?'default':'outline'} type="submit" disabled={busy}>{busy?'Saving…':submitLabel}</Button>
  {status&&<p role="status">{status}</p>}{error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
 </form>
}
