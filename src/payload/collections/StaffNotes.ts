import type {CollectionConfig} from 'payload'
import {commandDeveloperOnly} from '../access/internal'
/** Internal, append-only staff notes on one booking or one enquiry. Never shown to customers or copied into action logs. */
export const StaffNotes:CollectionConfig={slug:'staff-notes',access:commandDeveloperOnly,admin:{hidden:true},fields:[
 {name:'commandKey',type:'text',required:true,unique:true},{name:'fingerprint',type:'text',required:true},
 {name:'booking',type:'relationship',relationTo:'bookings',index:true},{name:'enquiry',type:'relationship',relationTo:'enquiries',index:true},
 {name:'staff',type:'relationship',relationTo:'staff-users',required:true,index:true},
 {name:'text',type:'textarea',required:true,maxLength:2000},{name:'recordedAt',type:'date',required:true},
]}
