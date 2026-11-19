import type {CollectionConfig} from 'payload'
import {commandOnly} from '../access/internal'
/** Append-only record of the recovery generations this database has accepted. The newest row is current. */
export const RecoveryFences:CollectionConfig={slug:'recovery-fences',access:commandOnly,admin:{hidden:true},fields:[
 {name:'generation',type:'text',required:true,unique:true},{name:'previousGeneration',type:'text'},
 {name:'operator',type:'text',required:true},{name:'authorizedAt',type:'date',required:true,index:true},
 {name:'permit',type:'json',required:true},
]}
