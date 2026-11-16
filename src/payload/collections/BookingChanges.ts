import type {CollectionConfig} from 'payload'
import {commandOnly} from '../access/internal'
export const BookingChanges:CollectionConfig={slug:'booking-changes',access:commandOnly,admin:{useAsTitle:'commandKey'},fields:[
 {name:'commandKey',type:'text',required:true,unique:true},{name:'fingerprint',type:'text',required:true},
 {name:'booking',type:'relationship',relationTo:'bookings',required:true,index:true},{name:'staff',type:'relationship',relationTo:'staff-users',required:true,index:true},
 {name:'kind',type:'select',options:['stay','cancellation'],required:true},
 {name:'state',type:'select',options:['awaiting-payment','completed','failed','abandoned'],required:true},
 {name:'baseRevision',type:'number',min:1,required:true},{name:'targetRevision',type:'number',min:2,required:true},
 {name:'quote',type:'relationship',relationTo:'quotes',index:true},{name:'paymentAttempt',type:'relationship',relationTo:'payment-attempts',index:true},
 {name:'originalQuote',type:'json',required:true},{name:'acceptedQuote',type:'json',required:true},{name:'originalAllocation',type:'json',required:true},
 {name:'deltaMinor',type:'text',required:true},{name:'currency',type:'text',required:true},
 {name:'agreementReference',type:'text',required:true},{name:'reason',type:'text',required:true},
 {name:'completedAt',type:'date'},{name:'abandonedAt',type:'date'},{name:'reasonCode',type:'text'},
]}
