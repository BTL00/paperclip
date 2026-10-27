import { describe,expect,it } from "vitest";
import { getConnectableAppDefinition } from "../../../packages/shared/src/app-definitions.js";
import { gradeProviderChoice,notionSetupChoices,truthfulNotionChoices } from "./external-provider-choice.js";
const reason="Vercel Connect setup is disabled on this Paperclip instance.";
function valid(){return {scenarioId:"connection-setup.choose-provider",companyId:"company",leadId:"ceo",reply:"Use Notion sign-in for the easiest connection. Vercel Connect is disabled here; ask the administrator to enable it before choosing that option.",phaseReplies:[],runs:[],connections:[],profiles:[],secrets:[],endpoints:[],interactions:[],activity:[],links:[],humanQueries:[],state:{catalogOfficialOAuth:true,unavailableAdvertised:true,unavailableReason:reason,modelDirectedNotionSetup:true,selectedNotionVisible:true,signInControlVisible:true,originalConversationRetained:true,originalQueryRetained:true}};}
describe("current Notion catalog setup choices",()=>{
 it("derives offered and unavailable choices from real catalog shape without any account",()=>{
  const gallery={apps:[getConnectableAppDefinition("notion")!],credentialSources:{vercelConnect:{available:false,reason}}};
  expect(notionSetupChoices(gallery)).toMatchObject({methodKey:"mcp-oauth",serverUrl:"https://mcp.notion.com/mcp",unavailableReason:reason});
  expect(()=>notionSetupChoices({...gallery,credentialSources:{vercelConnect:{available:true,reason:null}}})).toThrow(/Setup blocker/);
  expect(()=>notionSetupChoices({...gallery,apps:[]})).toThrow(/Setup blocker/);
 });
 it("accepts current user-facing choices and the selected real setup path",()=>expect(gradeProviderChoice(valid()).passed).toBe(true));
 it("rejects missing prerequisites, wrong setup, lost task and premature connection",()=>{
  for(const mutate of [
   (o:ReturnType<typeof valid>)=>{o.reply="Notion sign-in and Vercel Connect both work immediately.";},
   (o:ReturnType<typeof valid>)=>{o.reply="I've connected Notion. Vercel Connect is disabled; ask an administrator.";},
   (o:ReturnType<typeof valid>)=>{o.state.modelDirectedNotionSetup=false;},
   (o:ReturnType<typeof valid>)=>{o.state.originalConversationRetained=false;},
   (o:ReturnType<typeof valid>)=>{o.state.signInControlVisible=false;},
  ]){const o=valid();mutate(o);expect(gradeProviderChoice(o).passed).toBe(false);}
  expect(truthfulNotionChoices("Sign in to Notion. Vercel Connect needs workload OIDC configured first.","Vercel Connect needs workload OIDC or PAPERCLIP_VERCEL_CONNECT_ACCESS_TOKEN.")).toBe(true);
  expect(gradeProviderChoice(undefined).passed).toBe(false);
 });
});
