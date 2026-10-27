import type { ChatCatalogContext,ChatSlackIngressReceipt } from "../chat-catalog-contract.js";
import type { ChatConversation,ChatEndpoint,ChatEndpointResource } from "../../../packages/shared/src/types/chat-channels.js";
import { selectedExternalBinding,selectedExternalCredential } from "./external-fixtures.js";
import { slackProvider,assertSlackFixture,slackCompanionFields } from "./external-slack-provider.js";
import { startSlackRelay } from "./external-slack-relay.js";
import { pollUntil } from "../api.js";
import { root } from "./external-support.js";
export { slackCompanionFields };
interface Principal {principalId:string;externalDetail:string;paperclipUserId:string|null;status:string}
export interface SlackMessage {ts:string;thread_ts?:string;user?:string;bot_id?:string;text?:string;files?:Array<{id:string;permalink?:string;url_private_download?:string;size?:number}>}
/** Preserve the selected app's actual scopes/events; only point its existing
 * callback surfaces at this attempt's signed product webhook. */
export function slackCallbackManifest(original:Record<string,unknown>,webhook:string){
 const url=new URL(webhook);if(url.protocol!=="https:"||!/^\/api\/chat-webhooks\/[a-zA-Z0-9_-]+\/slack$/.test(url.pathname)||url.search||url.hash||url.username||url.password)throw new Error("Disposable Slack callback is not the actual supported HTTPS product route");
 const manifest=structuredClone(original) as Record<string,any>;manifest.settings??={};manifest.settings.event_subscriptions??={};
 if(!Array.isArray(manifest.settings.event_subscriptions.bot_events)||!manifest.settings.event_subscriptions.bot_events.some((event:string)=>["message.channels","message.groups"].includes(event)))throw new Error("Setup blocker: allowlisted Slack app must already have authorized message event subscriptions; fixture will not silently widen scopes");
 manifest.settings.event_subscriptions.request_url=webhook;
 manifest.settings.interactivity={...manifest.settings.interactivity,is_enabled:true,request_url:webhook};
 for(const command of manifest.features?.slash_commands??[])command.url=webhook;
 return manifest;
}
export async function prepareSlackFixture(ctx:ChatCatalogContext){
 const binding=selectedExternalBinding(ctx);assertSlackFixture(binding);const p=binding.prerequisites;
 if(!ctx.input.privateSecrets)throw new Error("Slack fixture requires private credential redaction");
 const port=Number(p.webhookRelayPort);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error("Setup blocker: dedicated webhookRelayPort for the isolated HTTPS tunnel is required");
 const priorExperiments=await ctx.input.api.get<{enableChatConnectors?:boolean}>("/api/instance/settings/experimental");
 const provider=slackProvider(ctx,binding);let endpoint:ChatEndpoint|undefined,relay:Awaited<ReturnType<typeof startSlackRelay>>|undefined,originalManifest:Record<string,unknown>|undefined,manifestChanged=false;
 const createdThreads:string[]=[],createdFiles:string[]=[];
 async function cleanup(){
  try{if(endpoint)await ctx.input.api.post(`/api/chat-endpoints/${endpoint.id}/setup`,{action:"remove"});}
  finally{try{if(manifestChanged&&originalManifest)await provider.call("configuration","apps.manifest.update",{app_id:p.appId,manifest:originalManifest});}finally{try{await provider.cleanupOwned();}finally{try{await relay?.close();}finally{await ctx.input.api.patch("/api/instance/settings/experimental",{enableChatConnectors:priorExperiments.enableChatConnectors===true});}}}}
 }
 try{
  await ctx.input.api.patch("/api/instance/settings/experimental",{enableChatConnectors:true});
  endpoint=await ctx.input.api.post<ChatEndpoint>(`${root(ctx)}/chat-endpoints`,{provider:"slack",assignedAgentId:ctx.input.fixtures.agent.id,name:"Disposable catalog Slack",slackSetupMethod:"manual"});
  const webhook=endpoint.setup.webhookUrl;if(!webhook||new URL(webhook).origin!==new URL(p.registeredWebhookOrigin!).origin)throw new Error("Setup blocker: actual server PAPERCLIP_CHAT_WEBHOOK_PUBLIC_URL must match designated registeredWebhookOrigin before any Slack operation");
  relay=await startSlackRelay({port,endpointPublicId:endpoint.publicId,baseURL:ctx.input.api.baseURL,signingSecret:selectedExternalCredential(ctx,binding,"signingSecretEnv"),workspaceId:p.workspaceId!,senderUserId:p.senderUserId!,channelId:p.channelId!});
  const sender=await provider.call<{ok:true;team_id:string;user_id:string;bot_id?:string}>("sender","auth.test",{}),bot=await provider.call<{ok:true;team_id:string;user_id:string;bot_id?:string}>("bot","auth.test",{});
  if(sender.team_id!==p.workspaceId||sender.user_id!==p.senderUserId||sender.bot_id||bot.team_id!==p.workspaceId||bot.user_id!==p.botUserId||!bot.bot_id)throw new Error("Setup blocker: selected Slack credentials do not identify the designated disposable workspace/human/bot");
  const app=await provider.call<{ok:true;bot:{app_id:string}}>("bot","bots.info",{bot:bot.bot_id});if(app.bot?.app_id!==p.appId)throw new Error("Setup blocker: actual Slack bot token belongs to a different app than the allowlisted disposable app");
  const human=await provider.call<{ok:true;user:{id:string;team_id:string;name:string;is_bot?:boolean;deleted?:boolean}}>("bot","users.info",{user:p.senderUserId});if(human.user.id!==p.senderUserId||human.user.team_id!==p.workspaceId||human.user.is_bot||human.user.deleted||!human.user.name)throw new Error("Setup blocker: designated Slack sender is not the selected active human");
  endpoint=await ctx.input.api.postSensitive<ChatEndpoint>(`/api/chat-endpoints/${endpoint.id}/setup`,{action:"configure",credentials:{botToken:selectedExternalCredential(ctx,binding,"botTokenEnv"),signingSecret:selectedExternalCredential(ctx,binding,"signingSecretEnv")}});
  const exported=await provider.call<{ok:true;manifest:Record<string,unknown>}>("configuration","apps.manifest.export",{app_id:p.appId});originalManifest=exported.manifest;
  if(!originalManifest||typeof originalManifest!=="object")throw new Error("Setup blocker: disposable Slack app manifest could not be independently read");
  const manifest=slackCallbackManifest(originalManifest,webhook);
  manifestChanged=true;await provider.call("configuration","apps.manifest.update",{app_id:p.appId,manifest});
  endpoint=await pollUntil({label:"actual Slack signed callback verification",deadlineAt:Date.now()+60000,load:()=>ctx.input.api.get<ChatEndpoint>(`/api/chat-endpoints/${endpoint!.id}`),accept:row=>!!row.setup.webhookVerifiedAt});
  endpoint=await ctx.input.api.post<ChatEndpoint>(`/api/chat-endpoints/${endpoint.id}/setup`,{action:"verify"});
  await ctx.input.api.patch(`/api/chat-endpoints/${endpoint.id}`,{requireAtMention:false,allowGroupChats:true,allowUnlinkedPeople:false});
  const resources=await ctx.input.api.get<ChatEndpointResource[]>(`/api/chat-endpoints/${endpoint.id}/resources`);if(!resources.some(row=>row.providerResourceId===p.channelId&&row.availability==="available"))throw new Error("Setup blocker: app bot is not an actual member of the allowlisted disposable Slack channel");
  await ctx.input.api.putSensitive(`/api/chat-endpoints/${endpoint.id}/resources`,{resources:resources.map(row=>({id:row.id,enabled:row.providerResourceId===p.channelId}))});
  async function postRoot(text:string){const result=await provider.call<{ok:true;channel:string;ts:string;message:{user:string;text:string}}>("sender","chat.postMessage",{channel:p.channelId,text,unfurl_links:false,unfurl_media:false});if(result.channel!==p.channelId||result.message?.user!==p.senderUserId||!/^\d+\.\d{6}$/.test(result.ts))throw new Error("Actual Slack root did not bind the designated human/channel");createdThreads.push(result.ts);return result.ts;}
  const threadId=await postRoot(`Disposable launch discussion ${ctx.input.nonce}`);
  const principals=await pollUntil({label:"actual unlinked Slack sender discovery",deadlineAt:Date.now()+60000,load:()=>ctx.input.api.get<Principal[]>(`/api/chat-endpoints/${endpoint!.id}/principals`),accept:rows=>rows.some(row=>row.externalDetail===`@${human.user.name}`)});
  const principal=principals.filter(row=>row.externalDetail===`@${human.user.name}`);if(principal.length!==1||principal[0]!.status==="linked")throw new Error("Setup blocker: the genuine Slack human must have one unlinked discovered identity in the new endpoint");
  const intent=await ctx.input.api.postSensitive<{confirmationUrl:string}>(`/api/chat-endpoints/${endpoint.id}/principals/${principal[0]!.principalId}/link-intent`,{expiresInSeconds:600}),url=new URL(intent.confirmationUrl,ctx.input.api.baseURL),token=url.searchParams.get("token");if(url.pathname!=="/chat-identity/confirm"||!token)throw new Error("Actual Slack identity link returned an unsupported confirmation surface");ctx.input.privateSecrets.push(token);
  // Fixture setup uses the same supported signed-in confirmation route as the
  // human UI, through the noninstrumented sensitive transport. The bearer link
  // never enters a Test browser URL/trace; this is labelled operator API setup.
  await ctx.input.api.postSensitive("/api/chat-identity-links/confirm",{token});
  const linked=(await ctx.input.api.get<Principal[]>(`/api/chat-endpoints/${endpoint.id}/principals`)).filter(row=>row.principalId===principal[0]!.principalId&&row.status==="linked");if(linked.length!==1||!linked[0]!.paperclipUserId)throw new Error("Actual signed-in person did not complete the selected Slack identity link");
  endpoint=await ctx.input.api.post<ChatEndpoint>(`/api/chat-endpoints/${endpoint.id}/finish`,{});if(endpoint.status!=="active")throw new Error("Setup blocker: supported Slack finish did not activate the actual endpoint");
  return {binding,provider,relay,endpoint,threadId,createdThreads,createdFiles,linkedPaperclipUserId:linked[0]!.paperclipUserId,
   async createDistractor(text:string){return postRoot(text);},
   async readThread(rootTs:string){if(!createdThreads.includes(rootTs))throw new Error("Slack egress read escaped an owned thread");const result=await provider.call<{ok:true;messages:SlackMessage[];has_more?:boolean}>("bot","conversations.replies",{channel:p.channelId,ts:rootTs,limit:100});if(result.has_more||!Array.isArray(result.messages))throw new Error("Slack thread exceeds bounded fixture observation");return result.messages;},
   async resolveIngress(query:string,messageId:string,providerCalls:number,rootTs=threadId):Promise<ChatSlackIngressReceipt>{
    if(!createdThreads.includes(rootTs))throw new Error("Slack ingress resolution escaped an owned actual root");
    const conversations=await pollUntil({label:"actual Slack canonical source persistence",deadlineAt:Date.now()+60000,load:()=>ctx.input.api.get<ChatConversation[]>(`/api/chat-endpoints/${endpoint!.id}/conversations`),accept:rows=>rows.some(row=>row.externalThreadId===`slack:${p.channelId}:${rootTs}`)}),conversation=conversations.find(row=>row.externalThreadId===`slack:${p.channelId}:${rootTs}`)!;
    const comments=await ctx.input.api.get<Array<{id:string;body:string;authorUserId:string;metadata?:{sourceChannel?:string}}>>(`/api/issues/${conversation.issueId}/comments?order=asc`),humanComments=comments.filter(row=>row.body===query&&row.authorUserId===linked[0]!.paperclipUserId&&row.metadata?.sourceChannel==="slack");
    if(!humanComments.length)throw new Error("Canonical Slack input did not persist under the linked human identity");return {query,endpointId:endpoint!.id,conversationId:conversation.id,issueId:conversation.issueId,humanCommentId:humanComments.at(-1)!.id,linkedPaperclipUserId:linked[0]!.paperclipUserId!,providerCalls,provider:{workspaceId:p.workspaceId!,channelId:p.channelId!,senderUserId:p.senderUserId!,threadId:rootTs,canonicalMessageId:messageId}};
   },cleanup};
 }catch(error){await cleanup();throw error;}
}
