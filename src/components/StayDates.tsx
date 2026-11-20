'use client'
import {useId,useRef,useState,type RefObject} from 'react'
import {cn} from '@/lib/utils'
import {Calendar} from '@/components/ui/calendar'
import {Label} from '@/components/ui/label'
import {Popover,PopoverAnchor,PopoverContent} from '@/components/ui/popover'
import {DateTrigger} from '@/components/DateField'
import {fieldDate,fromIsoDate,nightsBetweenDates,spokenDate,stayRange,toIsoDate} from '@/lib/calendar-dates'

type Step='arrival'|'departure'
export interface StayDatesValue {arrival:string;departure:string}
const same=(day:Date,other:Date|undefined)=>!!other&&toIsoDate(day)===toIsoDate(other)

/**
 * Check-in and check-out fields that share one range calendar (design language C-04). Either field opens the calendar
 * under the check-in field. The first pick sets check-in and the calendar stays open for check-out; a day on or before
 * check-in starts the stay again, so the dates never reverse. The nights between are highlighted and counted, and the
 * check-out day is not a night. Days before `today`, the property date, cannot be chosen. Each field submits a plain
 * YYYY-MM-DD value through a hidden input, or an empty value until it is chosen.
 */
export function StayDates({today,labels=['Check in','Check out'],names=['arrival','departure'],defaultValue,onChange,fieldClassName}:{today:string;labels?:[string,string];names?:[string,string];defaultValue?:Partial<StayDatesValue>;onChange?:(value:StayDatesValue)=>void;fieldClassName?:string}){
  const id=useId(),first=fromIsoDate(today)
  const [arrival,setArrival]=useState(()=>fromIsoDate(defaultValue?.arrival)),[departure,setDeparture]=useState(()=>fromIsoDate(defaultValue?.departure))
  const [open,setOpen]=useState(false),[opener,setOpener]=useState<Step>('arrival'),[step,setStep]=useState<Step>('arrival'),[months,setMonths]=useState(1),[month,setMonth]=useState<Date|undefined>()
  const arrivalTrigger=useRef<HTMLButtonElement>(null),departureTrigger=useRef<HTMLButtonElement>(null),focusAfter=useRef<Step|null>(null)
  function change(nextArrival:Date|undefined,nextDeparture:Date|undefined){
    setArrival(nextArrival);setDeparture(nextDeparture)
    onChange?.({arrival:nextArrival?toIsoDate(nextArrival):'',departure:nextDeparture?toIsoDate(nextDeparture):''})
  }
  function close(focus:Step){focusAfter.current=focus;setOpen(false)}
  function show(field:Step){
    if(open&&opener===field){close(field);return}
    setOpener(field);setStep(field==='departure'&&arrival?'departure':'arrival')
    setMonths(window.matchMedia('(min-width: 48rem)').matches?2:1);setMonth(arrival??first??new Date())
    focusAfter.current=field;setOpen(true)
  }
  function pick(day:Date){
    if(step==='departure'&&arrival&&day>arrival){change(arrival,day);close('departure');return}
    if(step==='departure'){change(day,undefined);return}
    const kept=departure&&departure>day?departure:undefined
    change(day,kept)
    if(kept)close('arrival');else setStep('departure')
  }
  const nights=arrival&&departure?nightsBetweenDates(arrival,departure):0
  const summary=arrival&&departure?`${stayRange(arrival,departure)} · ${nights} ${nights===1?'night':'nights'}`:arrival&&step==='departure'?`${labels[0]} ${fieldDate(arrival)} · select ${labels[1].toLowerCase()}`:`Select ${labels[0].toLowerCase()}`
  const field=(target:Step,index:0|1,ref:RefObject<HTMLButtonElement|null>,value:Date|undefined)=><div className={cn('@container grid min-w-0 gap-1.5',fieldClassName)}>
    <Label id={`${id}-${target}-label`} htmlFor={`${id}-${target}`}>{labels[index]}</Label>
    <DateTrigger ref={ref} id={`${id}-${target}`} aria-labelledby={`${id}-${target}-label ${id}-${target}-value`} aria-expanded={open&&opener===target} aria-controls={open?id+'-calendar':undefined} valueId={`${id}-${target}-value`} date={value} onClick={()=>show(target)}/>
    <input type="hidden" name={names[index]} value={value?toIsoDate(value):''}/>
  </div>
  return <Popover open={open} onOpenChange={next=>{if(!next)setOpen(false)}}>
    <PopoverAnchor virtualRef={arrivalTrigger as RefObject<HTMLButtonElement>}/>
    {field('arrival',0,arrivalTrigger,arrival)}
    {field('departure',1,departureTrigger,departure)}
    <PopoverContent id={id+'-calendar'} align="start" collisionPadding={16} className="w-auto p-0" aria-label={`Choose ${labels[step==='arrival'?0:1].toLowerCase()} date`}
      onOpenAutoFocus={event=>event.preventDefault()}
      onCloseAutoFocus={event=>{event.preventDefault();const target=focusAfter.current;focusAfter.current=null;if(target)(target==='arrival'?arrivalTrigger:departureTrigger).current?.focus()}}
      onInteractOutside={event=>{const target=event.target as Node|null;if(target&&(arrivalTrigger.current?.contains(target)||departureTrigger.current?.contains(target)))event.preventDefault();else focusAfter.current=null}}>
      <Calendar mode="range" selected={arrival?{from:arrival,to:departure}:undefined} onSelect={(_range,day)=>pick(day)} disabled={first?{before:first}:undefined} startMonth={first} numberOfMonths={months} month={month} onMonthChange={setMonth} showOutsideDays={false} autoFocus
        labels={{labelDayButton:(date,modifiers)=>spokenDate(date)+(same(date,arrival)?', '+labels[0].toLowerCase():same(date,departure)?', '+labels[1].toLowerCase():modifiers.range_middle?', included night':'')+(modifiers.today?', today':'')}}/>
      <p role="status" data-slot="calendar-summary" className="border-t px-4 py-3 text-sm text-muted-foreground">{summary}</p>
    </PopoverContent>
  </Popover>
}
