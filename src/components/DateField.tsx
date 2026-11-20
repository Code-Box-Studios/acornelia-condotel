'use client'
import {useId,useState,type ComponentProps} from 'react'
import {CalendarDays} from 'lucide-react'
import {cn} from '@/lib/utils'
import {Button} from '@/components/ui/button'
import {Calendar} from '@/components/ui/calendar'
import {Label} from '@/components/ui/label'
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover'
import {fieldDate,fromIsoDate,spokenDate,toIsoDate} from '@/lib/calendar-dates'

/**
 * The button that opens a date field's calendar. It looks like the other fields (44 px high, 8 px corners, 16 px text on
 * phones) and its accessible name is the field label followed by the chosen date, through `aria-labelledby`. Its field
 * wrapper is a size container: in a field narrower than 9.5rem (two columns on a small phone) the icon gives its room to the
 * date, so "May 28, 2027" still fits at 16 px on a 320 px screen.
 */
export function DateTrigger({className,valueId,date,placeholder='Select date',...props}:ComponentProps<'button'>&{valueId:string;date?:Date;placeholder?:string}){
  return <button type="button" aria-haspopup="dialog" {...props} data-slot="date-trigger" className={cn('flex h-11 w-full min-w-0 items-center gap-2.5 rounded-md border border-input bg-background px-3.5 text-left text-base font-normal text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-expanded:border-ring aria-expanded:ring-[3px] aria-expanded:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm @max-[9.5rem]:gap-0 @max-[9.5rem]:px-2.5',className)}>
    <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground @max-[9.5rem]:hidden"/>
    <span id={valueId} className={cn('truncate',!date&&'text-muted-foreground')}>{date?fieldDate(date):placeholder}</span>
  </button>
}

/**
 * A single date chosen from the shared calendar. The form receives a plain YYYY-MM-DD value through a hidden input, or an
 * empty value when nothing is chosen, exactly as the browser's own date input submitted it. Optional filters can be cleared.
 */
export function DateField({label,name,defaultValue,clearable=false,className}:{label:string;name:string;defaultValue?:string;clearable?:boolean;className?:string}){
  const id=useId(),[value,setValue]=useState(()=>fromIsoDate(defaultValue)),[open,setOpen]=useState(false),[month,setMonth]=useState<Date|undefined>(value)
  return <div className={cn('@container grid min-w-0 gap-1.5',className)}>
    <Label id={id+'-label'} htmlFor={id}>{label}</Label>
    <Popover open={open} onOpenChange={next=>{if(next)setMonth(value??new Date());setOpen(next)}}>
      <PopoverTrigger asChild><DateTrigger id={id} aria-labelledby={`${id}-label ${id}-value`} valueId={id+'-value'} date={value}/></PopoverTrigger>
      <PopoverContent align="start" collisionPadding={16} className="w-auto p-0" aria-labelledby={id+'-label'} onOpenAutoFocus={event=>event.preventDefault()}>
        <Calendar mode="single" selected={value} onSelect={day=>{if(day||clearable)setValue(day);setOpen(false)}} month={month} onMonthChange={setMonth} showOutsideDays={false} autoFocus labels={{labelDayButton:(date,modifiers)=>spokenDate(date)+(modifiers.selected?', selected':'')+(modifiers.today?', today':'')}}/>
        {clearable&&value&&<div className="border-t p-2"><Button type="button" variant="ghost" size="sm" className="w-full" onClick={()=>{setValue(undefined);setOpen(false)}}>Clear date</Button></div>}
      </PopoverContent>
    </Popover>
    <input type="hidden" name={name} value={value?toIsoDate(value):''}/>
  </div>
}
