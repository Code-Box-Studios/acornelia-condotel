// Checks recorded acceptance evidence against the requirements register (Task 28).
// Usage: pnpm verify:acceptance --revision <commit> --environment <name>
//        pnpm verify:acceptance record --revision <commit> --environment <name> --date <YYYY-MM-DD> --vitest <report.json> --playwright <report.json>
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {parseArgs} from 'node:util'
import {z} from 'zod'
export type Requirement={id:number;label:string;files:string[];keys:string[]}
export type Blocker={blocker:string;responsible:string;status:string}
export type EvidenceRow={date:string;revision:string;environment:string;evidence:string;result:string;detail:string}
export type AcceptanceResult={ok:boolean;problems:string[];requirementIds:number[]}
export type Outcome={file:string;result:'passed'|'failed';detail:string}
/** Automated results may come from these isolated test environments as well as from the selected environment. */
export const isolatedEnvironments=['ci-isolated','local-isolated']
const revisionPattern=/^[0-9a-f]{7,40}$/,environmentPattern=/^[a-z][a-z0-9-]{1,39}$/,datePattern=/^\d{4}-\d{2}-\d{2}$/
function tableUnder(lines:string[],heading:string){
 const start=lines.findIndex(line=>line.trim()==='## '+heading)
 if(start<0)throw new Error('Missing section: '+heading)
 const next=lines.findIndex((line,index)=>index>start&&line.startsWith('## ')),end=next<0?lines.length:next,table:number[]=[]
 for(let index=start+1;index<end;index++){if(lines[index].trim().startsWith('|'))table.push(index);else if(table.length)break}
 if(table.length<2)throw new Error('Missing table under: '+heading)
 return {separator:table[1],rows:table.slice(2)}
}
const cells=(line:string)=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(cell=>cell.trim())
const codes=(cell='')=>[...cell.matchAll(/`([^`]+)`/g)].map(match=>match[1])
function rowsUnder(markdown:string,heading:string){const lines=markdown.split('\n');return tableUnder(lines,heading).rows.map(index=>cells(lines[index]))}
function evidenceRow(cellsOfRow:string[]):EvidenceRow{const [date='',revision='',environment='',evidence='',result='',detail='']=cellsOfRow;return {date,revision,environment,evidence:codes(evidence)[0]??evidence,result,detail}}
export function readRegister(markdown:string):{requirements:Requirement[];keys:Set<string>;blockers:Blocker[]}{
 const requirements=rowsUnder(markdown,'Requirements').map(([id='',label='',files,keys])=>({id:Number(id),label,files:codes(files),keys:codes(keys)}))
 const keys=new Set(rowsUnder(markdown,'Further evidence').flatMap(([key])=>codes(key).slice(0,1)))
 const blockers=rowsUnder(markdown,'Release blockers').map(([blocker='',responsible='',status=''])=>({blocker,responsible,status}))
 return {requirements,keys,blockers}
}
export function readEvidence(markdown:string):EvidenceRow[]{return rowsUnder(markdown,'Results').map(evidenceRow)}
const sameRevision=(a:string,b:string)=>revisionPattern.test(a)&&revisionPattern.test(b)&&(a.startsWith(b)||b.startsWith(a))
/** Passes only when every requirement has its evidence for the selected revision and every release blocker is resolved. */
export function verifyAcceptance(documents:{requirements:string;evidence:string},options:{revision:string;environment:string;fileExists:(file:string)=>boolean}):AcceptanceResult{
 const problems:string[]=[],{requirements,keys,blockers}=readRegister(documents.requirements),rows=readEvidence(documents.evidence),ids=requirements.map(requirement=>requirement.id)
 if(!revisionPattern.test(options.revision))problems.push('The selected revision must be a commit hash of 7 to 40 lowercase hexadecimal characters')
 if(!environmentPattern.test(options.environment))problems.push('The selected environment name is invalid')
 for(let id=1;id<=38;id++){const count=ids.filter(value=>value===id).length;if(count!==1)problems.push(`Requirement ${id} appears ${count} times`)}
 for(const id of ids)if(!Number.isInteger(id)||id<1||id>38)problems.push(`Requirement ID ${id} is not one of 1 to 38`)
 const files=new Set(requirements.flatMap(requirement=>requirement.files))
 for(const row of rows){
  if(!datePattern.test(row.date))problems.push(`Evidence ${row.evidence} has an invalid date "${row.date}"`)
  if(!revisionPattern.test(row.revision))problems.push(`Evidence ${row.evidence} has a malformed revision "${row.revision}"`)
  if(!['passed','failed'].includes(row.result))problems.push(`Evidence ${row.evidence} has an unsupported result "${row.result}"`)
  if(!files.has(row.evidence)&&!keys.has(row.evidence))problems.push(`Evidence ${row.evidence} is not named by the register`)
 }
 // The last matching row decides, so a later failure on the same revision withdraws an earlier pass.
 const passed=(name:string,environments:string[])=>rows.filter(row=>row.evidence===name&&environments.includes(row.environment)&&sameRevision(row.revision,options.revision)).at(-1)?.result==='passed'
 const at=`${options.revision.slice(0,12)} in ${options.environment}`
 for(const requirement of requirements){
  if(!requirement.files.length)problems.push(`Requirement ${requirement.id} names no automated evidence`)
  for(const file of requirement.files){
   if(!options.fileExists(file))problems.push(`Requirement ${requirement.id}: ${file} does not exist`)
   else if(!passed(file,[...isolatedEnvironments,options.environment]))problems.push(`Requirement ${requirement.id}: no passing result for ${file} at ${at}`)
  }
  for(const key of requirement.keys){
   if(!keys.has(key))problems.push(`Requirement ${requirement.id}: unknown further evidence ${key}`)
   else if(!passed(key,[options.environment]))problems.push(`Requirement ${requirement.id}: no passing ${key} result at ${at}`)
  }
 }
 for(const blocker of blockers)if(!/^resolved \d{4}-\d{2}-\d{2} by \S/.test(blocker.status))problems.push(`Release blocker open: ${blocker.blocker}`)
 return {ok:problems.length===0,problems,requirementIds:ids}
}
export function acceptanceExitCode(result:AcceptanceResult):number{return result.ok?0:1}
type Counts={passed:number;failed:number;flaky:number;skipped:number}
type PlaywrightSuite={file:string;specs?:{tests:{status:string}[]}[];suites?:PlaywrightSuite[]}
const playwrightSuite:z.ZodType<PlaywrightSuite>=z.lazy(()=>z.object({file:z.string(),specs:z.array(z.object({tests:z.array(z.object({status:z.string()}))})).optional(),suites:z.array(playwrightSuite).optional()}))
/** Expands vitest and Playwright JSON reports into one outcome per test file; a file passes only when it ran a test and none failed or passed on retry. */
export function automatedOutcomes(vitest:unknown,playwright:unknown,root:string):Outcome[]{
 const counts=new Map<string,Counts>()
 const fileOf=(absolute:string)=>{const relative=path.relative(root,absolute).split(path.sep).join('/');if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('A reported test file is outside the repository');return relative}
 const entry=(file:string)=>{const found=counts.get(file)??{passed:0,failed:0,flaky:0,skipped:0};counts.set(file,found);return found}
 for(const suite of z.object({testResults:z.array(z.object({name:z.string(),status:z.string().optional(),assertionResults:z.array(z.object({status:z.string()}))}))}).parse(vitest).testResults){
  const counted=entry(fileOf(suite.name))
  for(const test of suite.assertionResults)counted[test.status==='passed'?'passed':test.status==='failed'?'failed':'skipped']++
  // A file that failed to load reports no failed assertions.
  if(suite.status==='failed'&&!suite.assertionResults.some(test=>test.status==='failed'))counted.failed++
 }
 const report=z.object({config:z.object({rootDir:z.string()}),suites:z.array(playwrightSuite)}).parse(playwright)
 const walk=(suite:PlaywrightSuite,counted:Counts):void=>{
  for(const spec of suite.specs??[])for(const test of spec.tests)counted[test.status==='expected'?'passed':test.status==='flaky'?'flaky':test.status==='skipped'?'skipped':'failed']++
  for(const child of suite.suites??[])walk(child,counted)
 }
 for(const suite of report.suites)walk(suite,entry(fileOf(path.join(report.config.rootDir,suite.file))))
 return [...counts].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([file,count])=>({file,result:count.passed>0&&!count.failed&&!count.flaky?'passed':'failed',detail:[`${count.passed} passed`,...(count.failed?[`${count.failed} failed`]:[]),...(count.flaky?[`${count.flaky} flaky`]:[]),...(count.skipped?[`${count.skipped} skipped`]:[])].join(', ')}))
}
/** Keeps outcomes for test files the register names; other files stay in CI, not in acceptance evidence. */
export function registeredOutcomes(outcomes:Outcome[],requirements:string):{recorded:Outcome[];missing:string[]}{
 const named=[...new Set(readRegister(requirements).requirements.flatMap(requirement=>requirement.files))].sort()
 return {recorded:outcomes.filter(outcome=>named.includes(outcome.file)),missing:named.filter(file=>!outcomes.some(outcome=>outcome.file===file))}
}
/** Replaces earlier automated rows for the same revision and environment; further-evidence rows are kept. */
export function recordOutcomes(markdown:string,input:{date:string;revision:string;environment:string;outcomes:Outcome[]}):string{
 if(!datePattern.test(input.date)||!revisionPattern.test(input.revision)||!environmentPattern.test(input.environment))throw new Error('Recording needs a date, a commit revision and an environment name')
 const lines=markdown.split('\n'),table=tableUnder(lines,'Results')
 const kept=table.rows.map(index=>lines[index]).filter(line=>{const row=evidenceRow(cells(line));return !(row.evidence.startsWith('tests/')&&row.environment===input.environment&&sameRevision(row.revision,input.revision))})
 const added=input.outcomes.map(outcome=>`| ${input.date} | ${input.revision.slice(0,12)} | ${input.environment} | \`${outcome.file}\` | ${outcome.result} | ${outcome.detail} |`)
 return [...lines.slice(0,table.separator+1),...kept,...added,...lines.slice((table.rows.at(-1)??table.separator)+1)].join('\n')
}
function main(argv:string[]):number{
 const record=argv[0]==='record',{values}=parseArgs({args:record?argv.slice(1):argv,options:{revision:{type:'string'},environment:{type:'string'},date:{type:'string'},vitest:{type:'string'},playwright:{type:'string'}},strict:true})
 const root=process.cwd(),evidencePath=path.join(root,'docs/acceptance/evidence.md')
 if(record){
  if(!values.vitest||!values.playwright)throw new Error('Recording needs --vitest and --playwright JSON reports')
  const reported=automatedOutcomes(JSON.parse(readFileSync(values.vitest,'utf8')),JSON.parse(readFileSync(values.playwright,'utf8')),root)
  const {recorded:outcomes,missing}=registeredOutcomes(reported,readFileSync(path.join(root,'docs/acceptance/requirements.md'),'utf8'))
  writeFileSync(evidencePath,recordOutcomes(readFileSync(evidencePath,'utf8'),{date:values.date??new Date().toISOString().slice(0,10),revision:values.revision??'',environment:values.environment??'',outcomes}))
  console.log(`Recorded ${outcomes.length} register test files: ${outcomes.filter(outcome=>outcome.result==='passed').length} passed, ${outcomes.filter(outcome=>outcome.result==='failed').length} failed.`)
  for(const file of missing)console.log('- Not in the reports: '+file)
  return missing.length?1:0
 }
 const revision=values.revision??'',environment=values.environment??''
 const result=verifyAcceptance({requirements:readFileSync(path.join(root,'docs/acceptance/requirements.md'),'utf8'),evidence:readFileSync(evidencePath,'utf8')},{revision,environment,fileExists:file=>existsSync(path.join(root,file))})
 console.log(result.ok?`Acceptance evidence is complete for ${revision} in ${environment}.`:`Acceptance is not complete for ${revision} in ${environment}: ${result.problems.length} problems.`)
 for(const problem of result.problems)console.log('- '+problem)
 return acceptanceExitCode(result)
}
if(process.argv[1]?.endsWith('verify-acceptance.ts')){try{process.exitCode=main(process.argv.slice(2))}catch(error){console.error(error instanceof Error?error.message:'Acceptance check failed');process.exitCode=1}}
