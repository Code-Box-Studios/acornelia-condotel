import {describe,it} from 'vitest'
// Durable photo storage is not selected yet (Decision 10). Add real upload and delivery checks with the chosen provider.
describe('durable media storage',()=>{
 it.todo('stores an uploaded room photo in the selected storage and still serves it after a redeploy')
 it.todo('keeps unpublished photos private on the selected storage')
})
