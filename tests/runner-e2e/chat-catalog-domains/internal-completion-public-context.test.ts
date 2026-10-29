import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { normalizeIssueExecutionPolicy, applyIssueExecutionPolicyTransition } from "../../../server/src/services/issue-execution-policy.js";
import { updateIssueSchema } from "../../../packages/shared/src/validators/issue.js";
import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import { prepareDeliveredHumanReview } from "./internal-task-completion.js";
afterEach(()=>vi.useRealTimers());
function fixture() {
 vi.useFakeTimers();vi.setSystemTime(0);
 const bytes=Buffer.from("<!doctype html><html><body><h1>Acorn Notes</h1><a href='/signup'>Sign up</a></body></html>");
 const policy=normalizeIssueExecutionPolicy({mode:"normal",commentRequired:true,stages:[{id:"11111111-1111-4111-8111-111111111111",type:"review",participants:[{type:"user",userId:"riley"}]}]})!;
 const original={id:"task",companyId:"company",projectId:"project",title:"Website task",description:"Actual implementation",status:"todo",assigneeAgentId:"22222222-2222-4222-8222-222222222222",reviewPolicy:"human_only",executionPolicy:policy};
 let current:Record<string,unknown>={...structuredClone(original),status:"in_review",executionState:null};
 const run={id:"work-run",companyId:"company",agentId:"22222222-2222-4222-8222-222222222222",status:"succeeded",runtimeMode:"native",contextSnapshot:{issueId:"task"},resultJson:{nativeResult:{reportedWorkDisposition:"needs_review"}}};
 const attachment={id:"html",companyId:"company",issueId:"task",createdByAgentId:"22222222-2222-4222-8222-222222222222",originatingRunId:"work-run",originalFilename:"website.html",byteSize:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")};
 const flags={wrongBytes:false,late:false,extraRun:false,mutateTextDuringPatch:false};const order:string[]=[];
 const api={get:vi.fn(async(route:string)=>{order.push(route);return structuredClone(route.endsWith('/attachments')?[attachment]:current);}),getAttachmentContent:vi.fn(async()=>{order.push('download');if(flags.late)vi.setSystemTime(1000);return flags.wrongBytes?Buffer.from('wrong'):bytes;}),patch:vi.fn(async(_route:string,body:unknown)=>{
  order.push('public-review-request');const parsed=updateIssueSchema.parse(body);expect(parsed.status).toBe('in_review');expect(parsed).not.toHaveProperty('executionState');
  const transition=applyIssueExecutionPolicyTransition({issue:current as never,policy,previousPolicy:policy,requestedStatus:parsed.status,requestedAssigneePatch:{},actor:{userId:'owner'},allowBoardOverride:true,reviewRequest:parsed.reviewRequest});current={...current,...transition.patch};if(flags.mutateTextDuringPatch)current.description="unexpected public-request rewrite";return current;
 })};
 const allRuns=vi.fn(async()=>flags.extraRun&&api.patch.mock.calls.length?[run,{...run,id:'extra-reviewer'}]:[run]);
 const ctx={scenario:{id:'tasks.completion-with-gate'},observationDeadlineAt:1000,input:{fixtures:{company:{id:'company'},agent:{id:'ceo'}},api,evidence:vi.fn(async()=>{})},allRuns}as unknown as ChatCatalogContext;
 return{ctx,original,worker:{id:'22222222-2222-4222-8222-222222222222',companyId:'company'},api,run,attachment,flags,order,get current(){return current;},set current(v){current=v;}};
}
it('requests only the actual public human review after independently downloaded native delivery, using the real policy transition',async()=>{
 const f=fixture();const task=await prepareDeliveredHumanReview(f.ctx,f.original,f.worker,'riley');expect(task).toMatchObject({status:'in_review',assigneeAgentId:null,assigneeUserId:'riley',executionState:{status:'pending',currentStageType:'review',currentParticipant:{type:'user',userId:'riley'}}});expect(f.api.patch).toHaveBeenCalledOnce();expect(f.order.indexOf('download')).toBeLessThan(f.order.indexOf('public-review-request'));expect(task.executionPolicy).toEqual(f.original.executionPolicy);
});
it.each(['foreignRun','wrongRunTask','notNeedsReview','agentReviewer','wrongAttachmentActor','foreignAttachment','wrongBytes','late','extraRun'])("rejects %s rather than manufacturing a pending-review context",async invalid=>{
 const f=fixture();if(invalid==='foreignRun')f.run.companyId='other';if(invalid==='wrongRunTask')f.run.contextSnapshot.issueId='other';if(invalid==='notNeedsReview')f.run.resultJson.nativeResult.reportedWorkDisposition='done';if(invalid==='agentReviewer'){const p=structuredClone(f.original.executionPolicy);p.stages[0]!.participants=[{...p.stages[0]!.participants[0]!,type:'agent',agentId:'33333333-3333-4333-8333-333333333333',userId:null}];f.current={...f.current,executionPolicy:p};}if(invalid==='wrongAttachmentActor')f.attachment.createdByAgentId='ceo';if(invalid==='foreignAttachment')f.attachment.companyId='other';if(invalid==='wrongBytes')f.flags.wrongBytes=true;if(invalid==='late')f.flags.late=true;if(invalid==='extraRun')f.flags.extraRun=true;
 await expect(prepareDeliveredHumanReview(f.ctx,f.original,f.worker,'riley')).rejects.toThrow();if(invalid!=='extraRun')expect(f.api.patch).not.toHaveBeenCalled();
});
it('does not replace an existing wrong review stage',async()=>{const f=fixture();f.current={...f.current,executionState:{status:'pending',currentParticipant:{type:'user',userId:'other'}}};await expect(prepareDeliveredHumanReview(f.ctx,f.original,f.worker,'riley')).rejects.toThrow('cannot be replaced');expect(f.api.patch).not.toHaveBeenCalled();});
it('keeps an already genuinely pending human stage without a duplicate request',async()=>{const f=fixture();const transition=applyIssueExecutionPolicyTransition({issue:f.current as never,policy:f.original.executionPolicy,previousPolicy:f.original.executionPolicy,requestedStatus:'in_review',requestedAssigneePatch:{},actor:{userId:'owner'},allowBoardOverride:true});f.current={...f.current,...transition.patch};await prepareDeliveredHumanReview(f.ctx,f.original,f.worker,'riley');expect(f.api.patch).not.toHaveBeenCalled();});

it("keeps legitimate Morgan-authored task metadata before the human review request",async()=>{const f=fixture();f.current={...f.current,title:"Acorn Notes implementation",description:"Morgan added real verification notes to the delivered task."};const saved=await prepareDeliveredHumanReview(f.ctx,f.original,f.worker,'riley');expect(saved).toMatchObject({title:"Acorn Notes implementation",description:"Morgan added real verification notes to the delivered task.",executionState:{status:"pending",currentParticipant:{type:"user",userId:"riley"}}});expect(f.api.patch).toHaveBeenCalledOnce();});
it("rejects task-text mutation caused during the public human review request",async()=>{const f=fixture();f.flags.mutateTextDuringPatch=true;await expect(prepareDeliveredHumanReview(f.ctx,f.original,f.worker,'riley')).rejects.toThrow("did not retain");});
