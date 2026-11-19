import type {CollectionConfig} from 'payload'
import {commandDeveloperOnly} from '../access/internal'
/** Append-only front-desk history. Each kind is recorded at most once per booking. */
export const StayEvents:CollectionConfig={slug:'stay-events',access:commandDeveloperOnly,admin:{hidden:true},indexes:[{fields:['booking','kind'],unique:true}],fields:[
 {name:'commandKey',type:'text',required:true,unique:true},{name:'fingerprint',type:'text',required:true},
 {name:'booking',type:'relationship',relationTo:'bookings',required:true,index:true},
 {name:'kind',type:'select',options:['checked-in','checked-out','no-show'],required:true},
 {name:'propertyDate',type:'text',required:true},{name:'bookingRevision',type:'number',required:true,min:1},
 {name:'staff',type:'relationship',relationTo:'staff-users',required:true,index:true},
 {name:'occurredAt',type:'date',required:true},
]}
