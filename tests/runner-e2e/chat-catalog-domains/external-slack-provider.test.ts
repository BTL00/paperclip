import { describe,expect,it } from "vitest";
import type { ChatConversation,ChatEndpoint,ExternalChannelBindingSummary } from "../../../packages/shared/src/types/chat-channels.js";
import { assertSlackCall,assertSlackFixture,slackIngressMatches,type SlackIngressReceipt } from "./external-slack-provider.js";
function binding(){return {disposable:true as const,resourceIds:["TWORKSPACE","CCHANNEL","USENDER","UBOT","AAPP"],credentialEnv:["PAPERCLIP_CHAT_EVAL_SLACK_BOT","PAPERCLIP_CHAT_EVAL_SLACK_SENDER","PAPERCLIP_CHAT_EVAL_SLACK_SIGNING","PAPERCLIP_CHAT_EVAL_SLACK_CONFIG"],prerequisites:{workspaceId:"TWORKSPACE",channelId:"CCHANNEL",senderUserId:"USENDER",botUserId:"UBOT",appId:"AAPP",registeredWebhookOrigin:"https://isolated.example.test",botTokenEnv:"PAPERCLIP_CHAT_EVAL_SLACK_BOT",senderTokenEnv:"PAPERCLIP_CHAT_EVAL_SLACK_SENDER",signingSecretEnv:"PAPERCLIP_CHAT_EVAL_SLACK_SIGNING",configurationTokenEnv:"PAPERCLIP_CHAT_EVAL_SLACK_CONFIG"}};}
function ingress(){const receipt:SlackIngressReceipt={providerCalls:1,query:"Exact canonical query.",endpointId:"endpoint",conversationId:"conversation",issueId:"issue",humanCommentId:"comment",linkedPaperclipUserId:"human",provider:{workspaceId:"TWORKSPACE",channelId:"CCHANNEL",threadId:"1793050000.123456",canonicalMessageId:"1793050001.123456",senderUserId:"USENDER"}};return {receipt,endpoint:{id:"endpoint",companyId:"company",assignedAgentId:"ceo",provider:"slack",providerAccountId:"TWORKSPACE",botExternalId:"UBOT"} as ChatEndpoint,conversation:{id:"conversation",endpointId:"endpoint",companyId:"company",issueId:"issue",externalConversationId:"slack:CCHANNEL",externalThreadId:"slack:CCHANNEL:1793050000.123456"} as ChatConversation,binding:{endpointId:"endpoint",conversationId:"conversation",provider:"slack",assignedAgentLocked:true} as ExternalChannelBindingSummary,comment:{id:"comment",body:"Exact canonical query.",authorUserId:"human",metadata:{sourceChannel:"slack"}},canonicalQuery:"Exact canonical query.",companyId:"company",agentId:"ceo"};}
describe("finite real Slack companion prerequisites and source binding",()=>{
 it("requires each explicit disposable provider resource and a distinct actual human sender",()=>{
  expect(()=>assertSlackFixture(binding())).not.toThrow();const other=binding();other.resourceIds=other.resourceIds.filter(id=>id!=="USENDER");expect(()=>assertSlackFixture(other)).toThrow(/allowlisted/);
  const bot=binding();bot.prerequisites.senderUserId="UBOT";expect(()=>assertSlackFixture(bot)).toThrow(/real linked human/);
 });
 it("refuses arbitrary Slack methods, another app/channel and unscoped post requests",()=>{
  expect(()=>assertSlackCall(binding(),"sender","chat.postMessage",{channel:"CCHANNEL",text:"Exact original query"})).not.toThrow();
  for(const action of [()=>assertSlackCall(binding(),"sender","users.list",{}),()=>assertSlackCall(binding(),"sender","chat.postMessage",{channel:"COTHER"}),()=>assertSlackCall(binding(),"sender","chat.postMessage",{}),()=>assertSlackCall(binding(),"configuration","apps.manifest.update",{app_id:"AOTHER"})])expect(action).toThrow();
 });
 it("accepts exact canonical linked-human source identity across the actual public DTOs",()=>expect(slackIngressMatches(ingress())).toBe(true));
 it("rejects copied company hints, wrong sender/comment, wrong thread, lost canonical bytes and missing dispatch",()=>{
  for(const mutate of [
   (i:ReturnType<typeof ingress>)=>{i.endpoint.companyId="another-company";},
   (i:ReturnType<typeof ingress>)=>{i.receipt.provider.senderUserId="UBOT";},
   (i:ReturnType<typeof ingress>)=>{i.comment.authorUserId="another-human";},
   (i:ReturnType<typeof ingress>)=>{i.comment.body="A rewritten easier query.";},
   (i:ReturnType<typeof ingress>)=>{i.conversation.externalThreadId="slack:CCHANNEL:1793050009.123456";},
   (i:ReturnType<typeof ingress>)=>{i.conversation.externalConversationId="CCHANNEL";},
   (i:ReturnType<typeof ingress>)=>{i.binding.conversationId="another-conversation";},
   (i:ReturnType<typeof ingress>)=>{i.receipt.providerCalls=0;},
  ]){const i=ingress();mutate(i);expect(slackIngressMatches(i)).toBe(false);}
 });
});
