import { expect } from "@playwright/test";
import type { AppDefinition } from "../../../packages/shared/src/types/app-definition.js";
import { getAvailableConnectionMethods } from "../../../packages/shared/src/app-definitions.js";
import { definition, root, checks, externalObservation, observeExternal, verifyRenderedReply } from "./external-support.js";
import { waitForReply } from "./identity-support.js";

interface Gallery { apps: AppDefinition[]; credentialSources: { vercelConnect: { available: boolean; reason: string | null } } }
export function notionSetupChoices(gallery: Gallery) {
  const notion=gallery.apps.find(app=>app.slug==="notion");
  const methods=notion ? getAvailableConnectionMethods(notion) : [];
  const oauth=methods.find(method=>method.auth==="oauth"&&method.transport==="mcp_remote"&&method.defaults?.serverUrl==="https://mcp.notion.com/mcp");
  const managed=gallery.credentialSources.vercelConnect;
  if(!oauth||!oauth.credentialSources?.vercelConnect||managed.available||!managed.reason)throw new Error("Setup blocker: the actual Notion catalog must offer official sign-in and an explicitly unavailable Vercel Connect option with its prerequisite");
  return {methodKey:oauth.key,serverUrl:oauth.defaults!.serverUrl!,unavailableReason:managed.reason};
}
export function truthfulNotionChoices(reply:string,reason:string){
  const offered=/notion/i.test(reply)&&/sign.?in|log.?in|authoriz|connect.*account/i.test(reply);
  const prerequisite=/vercel\s+connect/i.test(reply)&&(/disabled/i.test(reason)?/disabled|enable|administrator|admin/i.test(reply):/oidc|workload|token|configur/i.test(reply));
  return offered&&prerequisite&&!/\b(?:I(?:['’]ve| have)?|we(?:['’]ve| have)?)\s+(?:already\s+)?connected\b|\bnotion\s+is\s+(?:now\s+)?connected\b/i.test(reply);
}
export function gradeProviderChoice(value:unknown){
  const c=checks(),o=externalObservation(value);c.add("complete-catalog-choice-evidence",!!o,"Actual public catalog methods, the advertised unavailable prerequisite and the directed setup UI are required.");if(!o)return c.result();
  c.add("real-catalog-and-truthful-choices",o.state.catalogOfficialOAuth===true&&o.state.unavailableAdvertised===true&&typeof o.state.unavailableReason==="string"&&truthfulNotionChoices(o.reply,o.state.unavailableReason),"The reply explains the actually offered sign-in choice and the prerequisite for unavailable Vercel Connect, without claiming setup is complete.");
  c.add("directed-official-setup-path",o.state.modelDirectedNotionSetup===true&&o.state.selectedNotionVisible===true&&o.state.signInControlVisible===true,"The person follows the actual model's Notion setup link into the supported selected-provider flow; the oracle does not substitute a different protocol.");
  c.add("original-intent-retained-without-phantom-account",o.state.originalConversationRetained===true&&o.state.originalQueryRetained===true&&o.connections.length===0,"Entering setup retains the original task and exact human intent, and does not make an unfinished choice a usable connection.");return c.result();
}
export const providerChoiceExternalCases=[definition("connection-setup.choose-provider",async ctx=>{
  const gallery=await ctx.input.api.get<Gallery>(`${root(ctx)}/tools/gallery`),choices=notionSetupChoices(gallery);
  const before=await ctx.input.api.get<{connections:unknown[]}>(`${root(ctx)}/tools/connections`);if(before.connections.length)throw new Error("Catalog choice requires a disposable company without an existing Notion account");
  return {...choices,catalogOfficialOAuth:true,unavailableAdvertised:true};
},gradeProviderChoice,{
  authentication:"human-session",
  sourceFiles:["chat-catalog-domains/external-provider-choice.ts","chat-catalog-domains/external-support.ts","chat-catalog-domains/internal-support.ts","chat-catalog-domains/identity-support.ts","../../packages/shared/src/app-definitions.ts","../../packages/shared/src/app-definitions/notion.json","chat-scenarios/connection-setup.yaml"],
  async act(ctx,state){
    await waitForReply(ctx);const o=await observeExternal(ctx,state);if(!truthfulNotionChoices(o.reply,String(state.unavailableReason)))throw new Error("Actual reply does not explain the advertised Notion choices and unavailable prerequisite");
    const href=o.links.find(link=>{try{const url=new URL(link,o.origin);return url.origin===o.origin&&(url.pathname===`/${ctx.input.fixtures.company.issuePrefix}/apps/connect`&&[url.searchParams.get("source"),url.searchParams.get("appKey")].includes("notion"));}catch{return false;}});
    if(!href)throw new Error("Actual reply must direct the person to the selected supported Notion setup surface");state.modelDirectedNotionSetup=true;
    const source=ctx.input.page.url(),issueId=ctx.issue()!.id;await ctx.input.page.locator(`[id^="comment-"] a[href=${JSON.stringify(href)}]`).first().click();
    await expect(ctx.input.page.getByRole("main")).toContainText(/Notion/);state.selectedNotionVisible=true;
    await expect(ctx.input.page.getByRole("button",{name:/Continue to (?:Notion|sign in)|Sign in to Notion/}).first()).toBeVisible();state.signInControlVisible=true;
    // This scenario selects a method; no provider authorization is supplied or invented.
    await ctx.input.page.goto(source,{waitUntil:"domcontentloaded"});await ctx.refreshIssue();state.originalConversationRetained=ctx.issue()?.id===issueId;
    const comments=await ctx.input.api.get<Array<{body:string;authorUserId?:string}>>(`/api/issues/${issueId}/comments?order=asc`);state.originalQueryRetained=comments.some(comment=>!!comment.authorUserId&&comment.body===ctx.scenario.query);
  },
  async verifyResult(ctx,_state,value){await verifyRenderedReply(ctx,value);},
})];
