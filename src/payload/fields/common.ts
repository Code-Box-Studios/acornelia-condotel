import type { Field } from 'payload'
export const text=(name:string, required=true): Field=>({name,type:'text',required})
export const date=(name:string, required=true): Field=>({name,type:'date',required})
export const json=(name:string, required=true): Field=>({name,type:'json',required})
export const select=(name:string, options:string[], defaultValue?:string): Field=>({name,type:'select',options,required:true,...(defaultValue?{defaultValue}:{})})
export const moneyFields: Field[]=[
  {name:'amountMinor',type:'text',required:true,validate:(value:unknown)=>typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value)||'Use exact nonnegative integer minor units'},
  {name:'currency',type:'text',required:true,validate:(value:unknown)=>typeof value==='string'&&/^[A-Z]{3}$/.test(value)||'Use a three-letter currency'},
]
