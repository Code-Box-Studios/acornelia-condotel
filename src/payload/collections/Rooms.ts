import type { CollectionConfig } from 'payload'
import { commandOnly } from '../access/internal'
export const Rooms: CollectionConfig={
  slug:'rooms',access:commandOnly,admin:{useAsTitle:'label'},
  fields:[{name:'label',type:'text',required:true,unique:true},{name:'onSale',type:'checkbox',defaultValue:false}],
}
