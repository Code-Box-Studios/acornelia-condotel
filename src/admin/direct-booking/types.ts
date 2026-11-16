import type {Money} from '@/domain/shared/types'
export type DirectSummary={id:string;code:string|null;status:string;source:string;arrival:string;departure:string;total:Money|null;roomLabel:string|null;hasRecordedCollection:boolean;recordedAmount:Money|null}
