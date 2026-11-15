import type { CollectionConfig } from 'payload'
import { commandOnly } from '../access/internal'
import {developerOnly} from '../access/identity'
export const Rooms: CollectionConfig={
  slug:'rooms',access:{...commandOnly,create:developerOnly,update:developerOnly},admin:{useAsTitle:'label'},
  fields:[{name:'label',type:'text',required:true,unique:true},{name:'roomType',type:'relationship',relationTo:'room-types',index:true},{name:'onSale',type:'checkbox',defaultValue:false}],
}
