import {existsSync,readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
import {acceptanceExitCode,automatedOutcomes,readRegister,recordOutcomes,verifyAcceptance} from '../../scripts/verify-acceptance'
const revision='abcdef1234567890abcdef1234567890abcdef12'
const table=(heading:string,header:string,rows:string[])=>['## '+heading,'',header,'| '+header.split('|').slice(1,-1).map(()=>'---').join(' | ')+' |',...rows,''].join('\n')
function register(options:{ids?:number[];blocker?:string}={}){
 const ids=options.ids??Array.from({length:38},(_,index)=>index+1)
 return ['# Register','',
  table('Requirements','| ID | Requirement | Automated evidence | Further evidence |',ids.map(id=>`| ${id} | Requirement ${id} | \`${id%2?'tests/e2e/b.spec.ts':'tests/unit/a.test.ts'}\` | ${id===9?'`staff-uat`':'—'} |`)),
  table('Further evidence','| Key | What counts |',['| `staff-uat` | A staff session. |']),
  table('Release blockers','| Blocker | Responsible | Status |',[`| Client acceptance | Owner | ${options.blocker??'resolved 2026-12-01 by Owner'} |`]),
 ].join('\n')
}
const evidence=(rows:string[])=>['# Evidence','',table('Results','| Date | Revision | Environment | Evidence | Result | Detail |',rows),'## Notes','','Kept as written.',''].join('\n')
const complete=[
 '| 2026-12-01 | abcdef123456 | local-isolated | `tests/unit/a.test.ts` | passed | 3 passed |',
 '| 2026-12-01 | abcdef123456 | preview | `tests/e2e/b.spec.ts` | passed | 2 passed |',
 '| 2026-12-02 | abcdef123456 | preview | `staff-uat` | passed | UAT session 1 |',
]
const exists=(file:string)=>['tests/unit/a.test.ts','tests/e2e/b.spec.ts'].includes(file)
const check=(requirements:string,rows:string[],options:{revision?:string;environment?:string}={})=>verifyAcceptance({requirements,evidence:evidence(rows)},{revision:options.revision??revision,environment:options.environment??'preview',fileExists:exists})
describe('acceptance evidence checker',()=>{
 it('requires evidence for every unchanged acceptance ID',()=>{
  const documents={requirements:readFileSync('docs/acceptance/requirements.md','utf8'),evidence:readFileSync('docs/acceptance/evidence.md','utf8')}
  const requirementIds=readRegister(documents.requirements).requirements.map(requirement=>requirement.id)
  expect(requirementIds).toEqual(Array.from({length:38},(_,i)=>i+1))
  const exitCodeWithMissingEvidence=acceptanceExitCode(verifyAcceptance(documents,{revision:'0123456789ab',environment:'preview',fileExists:existsSync}))
  expect(exitCodeWithMissingEvidence).not.toBe(0)
 })
 it('passes only with complete evidence for the selected revision and environment',()=>{
  expect(check(register(),complete)).toEqual({ok:true,problems:[],requirementIds:Array.from({length:38},(_,i)=>i+1)})
  expect(acceptanceExitCode(check(register(),complete))).toBe(0)
  const otherRevision=check(register(),complete,{revision:'1234567890abcdef1234567890abcdef12345678'})
  expect(otherRevision.ok).toBe(false);expect(otherRevision.problems.join('\n')).toContain('tests/unit/a.test.ts')
  // Further evidence and hosted automated results count only in the selected environment.
  const production=check(register(),complete,{environment:'production'})
  expect(production.problems).toEqual(expect.arrayContaining([expect.stringContaining('staff-uat'),expect.stringContaining('tests/e2e/b.spec.ts')]))
  expect(production.problems.join('\n')).not.toContain('tests/unit/a.test.ts')
  expect(check(register({ids:Array.from({length:37},(_,i)=>i+1)}),complete).problems).toContain('Requirement 38 appears 0 times')
  expect(check(register({ids:[...Array.from({length:38},(_,i)=>i+1),7]}),complete).problems).toContain('Requirement 7 appears 2 times')
  expect(check(register(),complete,{revision:'HEAD'}).ok).toBe(false)
 })
 it('refuses open blockers, unsupported evidence and a later failure for the same revision',()=>{
  expect(check(register({blocker:'open'}),complete).problems).toContain('Release blocker open: Client acceptance')
  expect(check(register({blocker:'resolved'}),complete).problems).toContain('Release blocker open: Client acceptance')
  for(const row of [
   '| 2026-12-01 | abcdef123456 | preview | `tests/unknown.test.ts` | passed | 1 passed |',
   '| 2026-12-01 | abcdef123456 | preview | `staff-uat` | skipped | not run |',
   '| 2026-12-01 | HEAD | preview | `staff-uat` | passed | session |',
   '| yesterday | abcdef123456 | preview | `staff-uat` | passed | session |',
  ])expect(check(register(),[...complete,row]).ok).toBe(false)
  const laterFailure=check(register(),[...complete,'| 2026-12-03 | abcdef123456 | preview | `staff-uat` | failed | Defect 4 |'])
  expect(laterFailure.problems).toEqual([expect.stringContaining('staff-uat')])
 })
 it('records one outcome per test file from vitest and playwright reports',()=>{
  const root='/work/acornelia'
  const vitest={testResults:[
   {name:root+'/tests/unit/a.test.ts',assertionResults:[{status:'passed'},{status:'passed'},{status:'skipped'}]},
   {name:root+'/tests/integration/c.test.ts',assertionResults:[{status:'passed'},{status:'failed'}]},
   {name:root+'/tests/integration/d.test.ts',assertionResults:[{status:'skipped'},{status:'todo'}]},
  ]}
  const playwright={config:{rootDir:root+'/tests/e2e'},suites:[
   {file:'b.spec.ts',specs:[{tests:[{status:'expected'},{status:'expected'}]}],suites:[{file:'b.spec.ts',specs:[{tests:[{status:'flaky'}]}]}]},
   {file:'e.spec.ts',specs:[{tests:[{status:'expected'},{status:'skipped'}]},{tests:[{status:'unexpected'}]}]},
  ]}
  expect(automatedOutcomes(vitest,playwright,root)).toEqual([
   {file:'tests/e2e/b.spec.ts',result:'failed',detail:'2 passed, 1 flaky'},
   {file:'tests/e2e/e.spec.ts',result:'failed',detail:'1 passed, 1 failed, 1 skipped'},
   {file:'tests/integration/c.test.ts',result:'failed',detail:'1 passed, 1 failed'},
   {file:'tests/integration/d.test.ts',result:'failed',detail:'0 passed, 2 skipped'},
   {file:'tests/unit/a.test.ts',result:'passed',detail:'2 passed, 1 skipped'},
  ])
 })
 it('replaces earlier automated rows for the same revision and environment when recording',()=>{
  const before=evidence([
   '| 2026-11-30 | abcdef123456 | local-isolated | `tests/unit/a.test.ts` | failed | 1 failed |',
   '| 2026-11-30 | abcdef123456 | local-isolated | `staff-uat` | passed | kept: not automated |',
   '| 2026-11-30 | 999999999999 | local-isolated | `tests/unit/a.test.ts` | passed | kept: other revision |',
   '| 2026-11-30 | abcdef123456 | preview | `tests/unit/a.test.ts` | passed | kept: other environment |',
  ])
  const after=recordOutcomes(before,{date:'2026-12-01',revision,environment:'local-isolated',outcomes:[{file:'tests/unit/a.test.ts',result:'passed',detail:'3 passed'}]})
  expect(after).toBe(evidence([
   '| 2026-11-30 | abcdef123456 | local-isolated | `staff-uat` | passed | kept: not automated |',
   '| 2026-11-30 | 999999999999 | local-isolated | `tests/unit/a.test.ts` | passed | kept: other revision |',
   '| 2026-11-30 | abcdef123456 | preview | `tests/unit/a.test.ts` | passed | kept: other environment |',
   '| 2026-12-01 | abcdef123456 | local-isolated | `tests/unit/a.test.ts` | passed | 3 passed |',
  ]))
 })
})
