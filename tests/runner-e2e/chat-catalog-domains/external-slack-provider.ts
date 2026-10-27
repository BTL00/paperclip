import type { ChatCatalogContext } from "../chat-catalog-contract.js";
import type { ChatConversation,ChatEndpoint,ExternalChannelBindingSummary } from "../../../packages/shared/src/types/chat-channels.js";
import { selectedExternalCredential,type ProviderBinding } from "./external-fixtures.js";

export const slackCompanionFields=["workspaceId","channelId","senderUserId","botUserId","appId","registeredWebhookOrigin","botTokenEnv","senderTokenEnv","signingSecretEnv","configurationTokenEnv"] as const;
const methods={bot:new Set(["auth.test","conversations.info","conversations.replies","conversations.history","chat.postMessage","files.info"]),sender:new Set(["auth.test","chat.postMessage","files.getUploadURLExternal","files.completeUploadExternal"]),configuration:new Set(["apps.manifest.export","apps.manifest.update"])};
export function assertSlackFixture(binding:ProviderBinding){
 const p=binding.prerequisites;
 for(const field of slackCompanionFields)if(!p[field])throw new Error(`Setup blocker: Slack ${field} reference is required`);
 for(const [field,pattern] of [["workspaceId",/^T[A-Z0-9]+$/],["channelId",/^[CG][A-Z0-9]+$/],["senderUserId",/^[UW][A-Z0-9]+$/],["botUserId",/^[UW][A-Z0-9]+$/],["appId",/^A[A-Z0-9]+$/]] as const){if(!pattern.test(p[field]!)||!binding.resourceIds.includes(p[field]!))throw new Error(`Setup blocker: Slack ${field} is not an explicitly allowlisted disposable provider resource`);}
 const origin=new URL(p.registeredWebhookOrigin!);if(origin.protocol!=="https:"||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=="/")throw new Error("Setup blocker: Slack requires an explicitly designated HTTPS webhook origin for this isolated attempt");
 if(p.botUserId===p.senderUserId)throw new Error("Setup blocker: canonical Slack sender must be the real linked human, not the app bot");
}
export function assertSlackCall(binding:ProviderBinding,kind:keyof typeof methods,method:string,parameters:Record<string,unknown>){
 assertSlackFixture(binding);if(!methods[kind].has(method))throw new Error("Slack fixture method exceeds its finite provider contract");
 const p=binding.prerequisites;
 if("channel" in parameters&&parameters.channel!==p.channelId)throw new Error("Slack fixture call escaped its allowed channel");
 if("channel_id" in parameters&&parameters.channel_id!==p.channelId)throw new Error("Slack fixture upload escaped its allowed channel");
 if("app_id" in parameters&&parameters.app_id!==p.appId)throw new Error("Slack fixture call escaped its allowed disposable app");
 if((method==="apps.manifest.export"||method==="apps.manifest.update")&&parameters.app_id!==p.appId)throw new Error("Slack manifest operation requires the exact owned app");
 if(method==="chat.postMessage"&&parameters.channel!==p.channelId)throw new Error("Slack canonical input requires the exact allowed channel");
}
/** Official Slack HTTP only. No fixture call occurs during import/calibration. */
export function slackProvider(ctx:ChatCatalogContext,binding:ProviderBinding,fetcher:typeof fetch=fetch){
 assertSlackFixture(binding);let calls=0;const receipts:Array<{kind:string;method:string;ok:boolean}>=[];
 return {receipts,async call<T extends Record<string,unknown>>(kind:keyof typeof methods,method:string,parameters:Record<string,unknown>,signal?:AbortSignal):Promise<T>{
  assertSlackCall(binding,kind,method,parameters);if(++calls>40)throw new Error("Slack fixture exceeded its declared bounded provider calls");
  const token=selectedExternalCredential(ctx,binding,kind==="bot"?"botTokenEnv":kind==="sender"?"senderTokenEnv":"configurationTokenEnv");
  const response=await fetcher(`https://slack.com/api/${method}`,{method:"POST",redirect:"error",signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000),headers:{authorization:`Bearer ${token}`,"content-type":"application/json; charset=utf-8"},body:JSON.stringify(parameters)});
  if(!response.ok){receipts.push({kind,method,ok:false});await response.body?.cancel();throw new Error(`Slack fixture ${method} returned HTTP ${response.status}; private response withheld`);}
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>2*1024*1024)throw new Error("Slack fixture response exceeds bounded metadata size");
  let result:T;try{result=JSON.parse(bytes.toString("utf8")) as T;}catch{throw new Error("Slack fixture returned invalid metadata; response withheld");}
  receipts.push({kind,method,ok:result.ok===true});if(result.ok!==true)throw new Error(`Slack fixture ${method} was not accepted; provider error details withheld`);return result;
 }};
}
export interface SlackIngressReceipt {providerCalls:number;query:string;endpointId:string;conversationId:string;issueId:string;humanCommentId:string;linkedPaperclipUserId:string;provider:{workspaceId:string;channelId:string;threadId:string;canonicalMessageId:string;senderUserId:string}}
/** Source-qualified public DTO checks; externalThreadId is the SDK encoded key. */
export function slackIngressMatches(input:{receipt:SlackIngressReceipt;endpoint:ChatEndpoint;conversation:ChatConversation;binding:ExternalChannelBindingSummary;comment:{id:string;body:string;authorUserId:string|null;metadata?:{sourceChannel?:string}};canonicalQuery:string;companyId:string;agentId:string}){
 const {receipt:r,endpoint:e,conversation:c,binding:b,comment}=input;
 return Number.isSafeInteger(r.providerCalls)&&r.providerCalls>=1&&r.providerCalls<=20&&r.query===input.canonicalQuery&&e.id===r.endpointId&&e.companyId===input.companyId&&e.assignedAgentId===input.agentId&&e.provider==="slack"&&e.providerAccountId===r.provider.workspaceId
  &&c.id===r.conversationId&&c.endpointId===e.id&&c.companyId===input.companyId&&c.issueId===r.issueId&&c.externalThreadId===`slack:${r.provider.channelId}:${r.provider.threadId}`
  &&c.externalConversationId===`slack:${r.provider.channelId}`
  &&b.endpointId===e.id&&b.conversationId===c.id&&b.provider==="slack"&&b.assignedAgentLocked===true
  &&comment.id===r.humanCommentId&&comment.body===input.canonicalQuery&&comment.authorUserId===r.linkedPaperclipUserId&&comment.metadata?.sourceChannel==="slack"
  &&/^\d+\.\d{6}$/.test(r.provider.threadId)&&/^\d+\.\d{6}$/.test(r.provider.canonicalMessageId)&&r.provider.senderUserId!==e.botExternalId;
}
