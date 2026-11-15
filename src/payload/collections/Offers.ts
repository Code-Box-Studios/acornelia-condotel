import type {CollectionConfig} from 'payload'
import {commandOnly} from '../access/internal'
export const Offers:CollectionConfig={slug:'offers',admin:{group:'Booking configuration',useAsTitle:'name'},access:commandOnly,fields:[
  {name:'name',type:'text',required:true},{name:'active',type:'checkbox',required:true,defaultValue:false},
  {name:'currentVersion',type:'relationship',relationTo:'offer-versions'},
  {name:'usageRevision',type:'number',required:true,defaultValue:0,min:0},
]}
