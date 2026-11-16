import type {CollectionConfig} from 'payload'
import {serverWrite} from '../access/internal'
export const DirectCommandClosures:CollectionConfig={slug:'direct-command-closures',admin:{hidden:true},access:{create:serverWrite,read:serverWrite,update:()=>false,delete:()=>false},fields:[{name:'commandKey',type:'text',required:true,unique:true},{name:'quote',type:'relationship',relationTo:'quotes',required:true},{name:'staff',type:'relationship',relationTo:'staff-users',required:true},{name:'closedAt',type:'date',required:true}]}
