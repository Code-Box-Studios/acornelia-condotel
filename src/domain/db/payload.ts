import {getPayload} from 'payload'
import config from '@payload-config'
export async function getDatabase(){return getPayload({config})}
