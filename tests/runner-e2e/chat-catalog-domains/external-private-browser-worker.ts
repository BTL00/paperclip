import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, test, type Cookie } from "@playwright/test";
import { validGrokRoutinePrivateInput, matchesConfiguredGrokRoutine, type GrokRoutinePrivateInput } from "./external-grok-private-contract.js";
interface Request { mode: "secure-key" | "canary" | "gateway-token-rotation" | "company-secret-create" | "personal-secret-create" | "grok-routine-configure"; grok?:GrokRoutinePrivateInput; companyId?:string; personal?:{definitionId:string;userId:string}; gateway?: { id: string; oldTokenId: string; otherToken: string; endpointPath: string; readName: string }; baseURL: string; setupURL: string; providerURL: string; credential: string; cookies: Cookie[]; executablePath?: string; channel?: string }
/** Separate Node process: no Playwright Test worker, API-step listener or artifact
 * recorder exists. This module never enables tracing, video or screenshots. */
async function main() {
  let attached = false; try { test.info(); attached = true; } catch { /* expected outside Test */ }
  if (attached) throw new Error("Private browser worker cannot run inside Playwright Test");
  const input = JSON.parse(await readFile(process.argv[2]!, "utf8")) as Request;
  if (!input.credential || input.credential.length > (input.mode === "grok-routine-configure" ? 16384 : 8192) || !["secure-key", "canary", "gateway-token-rotation", "company-secret-create", "personal-secret-create", "grok-routine-configure"].includes(input.mode)) throw new Error("Invalid private browser request");
  const base = new URL(input.baseURL);
  if (base.hostname !== "127.0.0.1" || base.protocol !== "http:" || new URL(input.setupURL).origin !== base.origin) throw new Error("Private browser target is outside the disposable loopback instance");
  const browser = await chromium.launch({ headless: true, ...(input.executablePath ? { executablePath: input.executablePath } : {}), ...(input.channel ? { channel: input.channel } : {}) });
  try {
    const context = await browser.newContext({ baseURL: base.origin });
    await context.addCookies(input.cookies); const page = await context.newPage(); page.setDefaultTimeout(30_000);
    if (input.mode === "canary") {
      await page.setContent('<input type="password" aria-label="App key" autocomplete="off">');
      const field = page.getByLabel("App key"); await field.fill(input.credential);
      if (await field.inputValue() !== input.credential) throw new Error("Canary entry failed");
      return { processIsolation: true, testRunnerAttached: false, credentialEntered: true, tracingEnabled: false, videoEnabled: false, apiStepRecorder: false };
    }
    if (input.mode === "grok-routine-configure") {
      const grok = input.grok;
      if (!validGrokRoutinePrivateInput(input.companyId, grok, input.setupURL) || !grok) {
        throw new Error("Invalid finite Grok routine operation");
      }
      const endpoint = `/api/companies/${input.companyId}/agents/${grok.agentId}/grok-binding`;
      const beforeResponse = await context.request.get(endpoint);
      if (!beforeResponse.ok()) throw new Error("Existing Grok binding is unavailable");
      const before = await beforeResponse.json() as { enabled?: boolean; canConfigureConnection?: boolean; binding?: { id?: string; connected?: boolean; routine?: { revision?: number; configured?: boolean } } };
      if (!before.enabled || !before.canConfigureConnection || before.binding?.id !== grok.bindingId ||
        before.binding.connected !== true || (before.binding.routine?.revision ?? 0) !== grok.expectedRevision) {
        throw new Error("Genuine connected Grok binding and exact revision are required");
      }
      await page.goto(input.setupURL, { waitUntil: "domcontentloaded" });
      const section = page.getByRole("region", { name: "Grok Bot connection", exact: true });
      await section.waitFor();
      if (before.binding.routine?.configured) {
        await section.getByRole("button", { name: "Replace routine credentials", exact: true }).click();
      }
      const urlField = section.getByLabel("Webhook URL", { exact: true });
      const keyField = section.getByLabel("Webhook key", { exact: true });
      if (await urlField.getAttribute("type") !== "password" || await keyField.getAttribute("type") !== "password") {
        throw new Error("Grok credential fields are not protected");
      }
      await section.getByLabel("Bot name in Grok", { exact: true }).fill(grok.botName);
      await urlField.fill(grok.webhookUrl);
      await keyField.fill(input.credential);
      const savedResponse = page.waitForResponse(response => new URL(response.url()).pathname === `${endpoint}/routine` &&
        response.request().method() === "PUT" && response.ok());
      await section.getByRole("button", { name: "Save routine", exact: true }).click();
      const response = await savedResponse;
      const submitted = response.request().postDataJSON() as { bindingId?: string; expectedRevision?: number; botName?: string; webhookUrl?: string; webhookKey?: string };
      if (submitted.bindingId !== grok.bindingId || submitted.expectedRevision !== grok.expectedRevision ||
        submitted.botName !== grok.botName || submitted.webhookUrl !== grok.webhookUrl || submitted.webhookKey !== input.credential) {
        throw new Error("Grok form did not submit the intended scoped private configuration");
      }
      const saved = await response.json() as { bindingId?: string; configured?: boolean; verified?: boolean; revision?: number };
      if (!matchesConfiguredGrokRoutine(saved, grok.bindingId, grok.expectedRevision)) {
        throw new Error("Grok routine response does not match the configured unverified binding");
      }
      await section.getByRole("button", { name: "Verify connection", exact: true }).waitFor();
      await keyField.waitFor({ state: "detached" });
      const afterResponse = await context.request.get(endpoint);
      if (!afterResponse.ok()) throw new Error("Saved Grok binding could not be independently read");
      const after = await afterResponse.json() as { binding?: { id?: string; connected?: boolean; routine?: { configured?: boolean; revision?: number } } };
      if (after.binding?.id !== grok.bindingId || after.binding.connected !== true ||
        after.binding.routine?.configured !== true || after.binding.routine.revision !== saved.revision) {
        throw new Error("Saved Grok configuration did not persist on the same connected binding");
      }
      const storageClean = await page.evaluate(values => !values.some(value =>
        JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.body.innerText, location.href]).includes(value)),
      [input.credential, grok.webhookUrl]);
      return { processIsolation: true, testRunnerAttached: false, tracingEnabled: false, videoEnabled: false, apiStepRecorder: false,
        bindingId: grok.bindingId, routineConfigured: true, routineUiVisible: true, humanSubmittedSecurely: true, storageClean };
    }
    if(input.mode === "personal-secret-create"){
      const personal=input.personal,setup=new URL(input.setupURL);
      if(!input.companyId||!/^[a-f0-9-]{36}$/i.test(input.companyId)||!personal||!/^[a-f0-9-]{36}$/i.test(personal.definitionId)||!personal.userId||personal.userId.length>160||!setup.pathname.endsWith('/company/settings/secrets')||setup.searchParams.get('definition')!==personal.definitionId)throw new Error('Invalid finite personal secret operation');
      await page.goto(input.setupURL,{waitUntil:'domcontentloaded'});
      const session=await context.request.get('/api/auth/get-session');if(!session.ok()||(await session.json()).user?.id!==personal.userId)throw new Error('Personal secret human identity mismatch');
      const own=await context.request.get(`/api/companies/${input.companyId}/me/user-secrets`);if(!own.ok())throw new Error('Personal definition not readable');
      const entries=await own.json() as Array<{definition:{id:string;key:string;name:string};secret:unknown}>;const entry=entries.find(row=>row.definition.id===personal.definitionId);if(!entry||entry.definition.key!=='PERSONAL_PUBLISHING_KEY'||entry.secret)throw new Error('Personal definition already configured or mismatched');
      await page.getByRole('button',{name:'Set my value',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('heading',{name:/^Set your value/}).waitFor();
      if(!await dialog.getByText('Personal publishing credential',{exact:true}).isVisible())throw new Error('Wrong personal credential form');
      await dialog.getByRole('textbox').fill(input.credential);
      const created=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/companies/${input.companyId}/me/user-secrets`&&response.request().method()==='POST'&&response.status()===201);
      await dialog.getByRole('button',{name:'Save value',exact:true}).click();const secret=await(await created).json() as {id:string;ownerUserId:string;userSecretDefinitionId:string};
      if(!/^[a-f0-9-]{36}$/i.test(secret.id)||secret.ownerUserId!==personal.userId||secret.userSecretDefinitionId!==personal.definitionId)throw new Error('Personal value owner/definition mismatch');await dialog.waitFor({state:'hidden'});
      const storageClean=await page.evaluate(value=>!JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage),document.body.innerText,location.href]).includes(value),input.credential);
      return {processIsolation:true,testRunnerAttached:false,tracingEnabled:false,videoEnabled:false,apiStepRecorder:false,secretId:secret.id,secretUiVisible:true,humanSubmittedSecurely:true,storageClean};
    }
    if(input.mode === "company-secret-create"){
      if(!input.companyId||!/^[a-f0-9-]{36}$/i.test(input.companyId)||!new URL(input.setupURL).pathname.endsWith("/company/settings/secrets"))throw new Error("Invalid finite company secret operation");
      await page.goto(input.setupURL,{waitUntil:"domcontentloaded"});await page.getByRole("button",{name:"New secret",exact:true}).click();
      const dialog=page.getByRole("dialog");await dialog.getByLabel("Name",{exact:true}).fill("Deployment API key");
      await dialog.getByLabel("Provider",{exact:true}).selectOption("local_encrypted");
      await dialog.getByLabel("Value",{exact:true}).fill(input.credential);
      const created=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/companies/${input.companyId}/secrets`&&response.request().method()==="POST"&&response.status()===201);
      await dialog.getByRole("button",{name:"Create secret",exact:true}).click();const secret=await(await created).json() as {id:string};
      if(!/^[a-f0-9-]{36}$/i.test(secret.id))throw new Error("Invalid created secret identity");await dialog.waitFor({state:"hidden"});
      await page.getByText("Deployment API key",{exact:true}).first().waitFor();
      const storageClean=await page.evaluate(secret=>!JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage),document.body.innerText,location.href]).includes(secret),input.credential);
      return {processIsolation:true,testRunnerAttached:false,tracingEnabled:false,videoEnabled:false,apiStepRecorder:false,secretId:secret.id,secretUiVisible:true,humanSubmittedSecurely:true,storageClean};
    }
    if (input.mode === "gateway-token-rotation") {
      const g = input.gateway;
      if (!g || !/^[a-f0-9-]{36}$/i.test(g.id) || !/^[a-f0-9-]{36}$/i.test(g.oldTokenId) || !g.otherToken || g.otherToken.length > 8192 || !g.readName || g.readName.length > 240) throw new Error("Invalid finite gateway rotation request");
      const setup = new URL(input.setupURL), endpoint = new URL(g.endpointPath, base.origin);
      if (!setup.pathname.endsWith(`/apps/gateways/${g.id}/tokens`) || endpoint.origin !== base.origin || !/^\/mcp\/gateways\/[^/]+$|^\/api\/tool-gateway\/gateways\/[^/]+\/mcp$/.test(endpoint.pathname)) throw new Error("Invalid gateway UI/protocol boundary");
      async function discover(token: string) {
        const response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list",params:{}}) });
        const status = response.status; if (!response.ok) { await response.body?.cancel(); return { status, ok: false }; }
        const body = await response.json() as {result?: {tools?: Array<{name: string}>}}; return {status, ok: body.result?.tools?.some(tool => tool.name === g!.readName) === true};
      }
      await page.goto(input.setupURL, {waitUntil:"domcontentloaded"});
      await page.getByRole("button", {name:"Issue token",exact:true}).click();
      await page.getByRole("textbox", {name:/^Token name/}).fill("Replacement test client");
      const issued = page.waitForResponse(response => new URL(response.url()).pathname === `/api/tool-gateway/gateways/${g.id}/tokens` && response.request().method() === "POST" && response.status() === 201);
      await page.locator("form").getByRole("button", {name:"Issue token",exact:true}).click();
      const replacement = await (await issued).json() as {id: string; token: string};
      if (!/^[a-f0-9-]{36}$/i.test(replacement.id) || typeof replacement.token !== "string" || !replacement.token || replacement.token.length > 8192) throw new Error("Invalid one-time token");
      await page.getByText("New token — copy now", {exact:true}).waitFor();
      if (!await page.locator("code").filter({hasText:replacement.token}).count()) throw new Error("One-time token was not visibly delivered");
      const newWorkedBeforeRevocation = (await discover(replacement.token)).ok, oldWorkedUntilRevocation = (await discover(input.credential)).ok;
      if (!newWorkedBeforeRevocation || !oldWorkedUntilRevocation) throw new Error("Replacement must work before retiring old credential");
      await page.getByRole("button", {name:"Dismiss new token",exact:true}).click();
      const oldRow = page.getByRole("row").filter({has:page.getByText("Old test client", {exact:true})});
      if (!await oldRow.isVisible()) await page.getByRole("button", {name:/Token history/}).click();
      await oldRow.getByRole("button", {name:"Revoke",exact:true}).click();
      const dialog = page.getByRole("dialog"); await dialog.getByLabel("Type the token name to confirm", {exact:true}).fill("Old test client");
      const revoked = page.waitForResponse(response => new URL(response.url()).pathname === `/api/tool-gateway/gateway-tokens/${g.oldTokenId}/revoke` && response.request().method() === "POST" && response.ok());
      await dialog.getByRole("button", {name:"Revoke token",exact:true}).click(); await revoked; await dialog.waitFor({state:"hidden"});
      const old = await discover(input.credential), fresh = await discover(replacement.token), other = await discover(g.otherToken);
      await writeFile(path.join(path.dirname(process.argv[2]!), "token.json"), JSON.stringify({id:replacement.id,token:replacement.token}), {mode:0o600});
      return {processIsolation:true,testRunnerAttached:false,tracingEnabled:false,videoEnabled:false,apiStepRecorder:false,newTokenId:replacement.id,tokenUiVisible:true,newWorkedBeforeRevocation,oldWorkedUntilRevocation,oldRevoked:true,newWorksAfter:fresh.ok,oldStatusAfter:old.status,otherWorksAfter:other.ok};
    }
    await page.goto(input.setupURL, { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox", { name: "MCP server URL", exact: true }).fill(input.providerURL); await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Check link", exact: true }).click();
    const key = page.getByLabel("App key", { exact: true }); await key.waitFor({ state: "visible" });
    const passwordInput = await key.getAttribute("type") === "password", autocompleteOff = await key.getAttribute("autocomplete") === "off";
    await key.fill(input.credential);
    const created = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/tools/apps/connect") && response.request().method() === "POST" && response.status() === 201);
    await page.getByRole("button", { name: "Check link", exact: true }).click();
    const connectionId = (await (await created).json() as { connectionId: string }).connectionId;
    if (!/^[a-f0-9-]{36}$/i.test(connectionId)) throw new Error("Secure setup did not return a bounded connection identity");
    await page.getByRole("heading", { name: /is ready\./i }).waitFor({ state: "visible" });
    const storageClean = await page.evaluate(secret => !JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), location.href]).includes(secret), input.credential);
    await page.getByRole("button", { name: "View connection", exact: true }).click(); await key.waitFor({ state: "detached" });
    return { processIsolation: true, testRunnerAttached: false, tracingEnabled: false, videoEnabled: false, apiStepRecorder: false, connectionId, challengeVisible: true, passwordInput, autocompleteOff, humanSubmittedSecurely: true, visibleReady: true, storageClean };
  } finally { await browser.close(); }
}
main().then(receipt => process.stdout.write(JSON.stringify(receipt))).catch(() => { process.stderr.write("Private browser operation failed; diagnostics withheld"); process.exitCode = 1; });
