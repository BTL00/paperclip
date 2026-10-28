import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, lstat, rm, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it } from "vitest";
import { scanSdkDiagnosticOutputs } from "./sdk-build-diagnostic-scan.js";
import { assertSdkDiagnosticInvocation, maybeSdkBuildDiagnostic, prepareSdkDiagnosticCopy, runSdkBuildDiagnostic, runSdkDiagnosticChild, sdkDiagnosticEnvironment, validateSdkDiagnosticScan, SDK_DIAGNOSTIC_FILE } from "./sdk-build-diagnostic.mjs";
const roots: string[]=[]; const hash=(v:Buffer|string)=>createHash("sha256").update(v).digest("hex");
async function temp(){const root=await mkdtemp(path.join(os.tmpdir(),"sdk-diagnostic-synthetic-test-"));roots.push(root);return root;}
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function write(root:string,file:string,bytes:string){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),bytes);}
async function certify(root:string,target:string,content:string){await write(root,target+"/index.js",content);const output=createHash("sha256");output.update(JSON.stringify(["index.js",Buffer.byteLength(content)]));output.update(content);await write(root,target+"/.paperclip-build-complete",JSON.stringify({sources:"a".repeat(64),outputs:output.digest("hex")}));}
it("constructs a closed synthetic environment with owned home/tmp and no inherited secret/config switches",async()=>{
 const root=await temp(),env=sdkDiagnosticEnvironment(root);expect(Object.keys(env).sort()).toEqual(["CODEX_AUTH_JSON","HOME","LANG","LC_ALL","OPENROUTER_API_KEY","PATH","TMPDIR","TZ"]);
 for(const key of ["NODE_OPTIONS","AWS_ACCESS_KEY_ID","AWS_SESSION_TOKEN","GITHUB_TOKEN","ANTHROPIC_API_KEY","PAPERCLIP_E2E_PRIVATE_DIAGNOSTICS_FILE"])expect(env).not.toHaveProperty(key);
 expect(env.HOME).toBe(path.join(root,"home"));expect(env.TMPDIR).toBe(path.join(root,"tmp"));expect(env.OPENROUTER_API_KEY).toContain("synthetic-sdk-diagnostic");
});
it("captures only real child output hashes and waits for a timed-out process group before cleanup",async()=>{
 const root=await temp(),marker="synthetic-private-child-output-1257";
 const actual=await runSdkDiagnosticChild(["-e",`process.stdout.write(${JSON.stringify(marker)});process.stderr.write('synthetic error')`],{cwd:root,env:sdkDiagnosticEnvironment(root)});
 expect(actual).toMatchObject({exitCode:0,processGroupSettled:true,stdoutSha256:hash(marker),stderrSha256:hash("synthetic error")});expect(JSON.stringify(actual)).not.toContain(marker);
 const timeout=await runSdkDiagnosticChild(["-e","setInterval(()=>{},1000)"],{cwd:root,env:sdkDiagnosticEnvironment(root),timeoutMs:30});expect(timeout).toMatchObject({timedOut:true,processGroupSettled:true});
});
it("bounds diagnostic stdout without retaining it",async()=>{
 const root=await temp();const actual=await runSdkDiagnosticChild(["-e","process.stdout.write('x'.repeat(4096));setInterval(()=>{},1000)"],{cwd:root,env:sdkDiagnosticEnvironment(root),outputLimit:128});expect(actual.outputLimitExceeded).toBe(true);expect(actual.processGroupSettled).toBe(true);expect(actual).not.toHaveProperty("stdout");
});
it("scans synthetic certified bytes with the original detectors and leaves them unchanged",async()=>{
 const root=await temp(),sensitive="synthetic-sdk-diagnostic-token-48397526",shape="sk-ABCDEFGHIJKLMNOPQRSTUVWX123456789";
 await certify(root,"packages/shared/dist",`export const kind='identity'; export const key='${shape}';`);await certify(root,"packages/plugins/sdk/dist",`export const key='${sensitive}';`);
 const before=await readFile(path.join(root,"packages/shared/dist/index.js"));const result=await scanSdkDiagnosticOutputs(root);
 expect(result.files.find(f=>f.path==="packages/shared/dist/index.js")?.findings).toEqual(["generic-key-shape","synthetic-nonsecret-json-exact-match"]);expect(result.files.find(f=>f.path==="packages/plugins/sdk/dist/index.js")?.findings).toEqual(["synthetic-credential-exact-match"]);expect(()=>validateSdkDiagnosticScan(result)).not.toThrow();expect(()=>validateSdkDiagnosticScan({...result,privatePreview:sensitive})).toThrow("metadata_invalid");expect(()=>validateSdkDiagnosticScan({...result,files:[{...result.files[0],findings:[sensitive]}]})).toThrow("metadata_invalid");expect(JSON.stringify(result)).not.toContain(sensitive);expect(JSON.stringify(result)).not.toContain(shape);expect(await readFile(path.join(root,"packages/shared/dist/index.js"))).toEqual(before);
 await writeFile(path.join(root,"packages/shared/dist/index.js"),"tampered");await expect(scanSdkDiagnosticOutputs(root)).rejects.toThrow("certificate_invalid");
});
async function syntheticRepository(){
 const root=await temp();
 for(const file of ["package.json","pnpm-lock.yaml","tsconfig.json","tsconfig.base.json","packages/shared/package.json","packages/shared/tsconfig.json","packages/plugins/sdk/package.json","packages/plugins/sdk/tsconfig.json"])await write(root,file,file.endsWith("package.json")?'{"type":"module"}\n':"{}\n");
 await write(root,"packages/shared/src/index.ts","export const syntheticShared = true;\n");await write(root,"packages/plugins/sdk/src/index.ts","export const syntheticSdk = true;\n");
 const helper=`import{mkdir,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';for(const target of ['packages/shared/dist','packages/plugins/sdk/dist']){await mkdir(target,{recursive:true});const data='export const syntheticFixtureOnly=true;';await writeFile(target+'/index.js',data);const hash=createHash('sha256');hash.update(JSON.stringify(['index.js',Buffer.byteLength(data)]));hash.update(data);await writeFile(target+'/.paperclip-build-complete',JSON.stringify({sources:'a'.repeat(64),outputs:hash.digest('hex')}));}await mkdir('node_modules/.cache',{recursive:true});await writeFile('node_modules/.cache/synthetic-owned-cache','owned');`;
 await write(root,"scripts/ensure-plugin-build-deps.mjs",helper);
 for(const base of ["","packages/shared","packages/plugins/sdk"]){await mkdir(path.join(root,base,"node_modules/@paperclipai"),{recursive:true});await symlink(path.join(root,"packages/shared"),path.join(root,base,"node_modules/@paperclipai/shared"));}
 await write(root,"node_modules/typescript/package.json",'{"name":"synthetic-test-compiler-only"}');
 const actual=path.resolve(import.meta.dirname,"../..");await mkdir(path.join(root,"cli"));await symlink(path.join(actual,"cli/node_modules"),path.join(root,"cli/node_modules"));await mkdir(path.join(root,"tests"));await symlink(path.join(actual,"tests/runner-e2e"),path.join(root,"tests/runner-e2e"));
 const git=(...args:string[])=>execFileSync("git",args,{cwd:root,encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();git("init","-q");git("add","package.json","pnpm-lock.yaml","tsconfig.json","tsconfig.base.json","scripts","packages");git("-c","user.name=Synthetic Test","-c","user.email=synthetic@example.invalid","commit","-qm","Synthetic diagnostic controls only");
 const frozenInputs=Object.fromEntries(git("ls-files","--stage").split("\n").map(row=>{const [metadata,file]=row.split("\t");return[file,metadata.split(" ")[1]!];}).filter(([file])=>!file!.includes("/node_modules/")));
 return{root,inputManifest:{schema:"paperclip.sdk-diagnostic-frozen-inputs/v1",frozenRevision:git("rev-parse","HEAD"),inputs:frozenInputs},expected:{shared:git("rev-parse","HEAD:packages/shared/src"),sdk:git("rev-parse","HEAD:packages/plugins/sdk/src"),helper:hash(helper)}};
}
it("keeps temporary workspace links/cache owned and invokes no real SDK build in its synthetic full-flow control",async()=>{
 const {root,expected,inputManifest}=await syntheticRepository(),owned=await temp();await prepareSdkDiagnosticCopy(root,owned,undefined,inputManifest);
 expect((await lstat(path.join(owned,"node_modules"))).isSymbolicLink()).toBe(false);expect((await lstat(path.join(owned,"node_modules/.cache"))).isDirectory()).toBe(true);
 expect(await readFile(path.join(owned,"packages/shared/src/index.ts"),"utf8")).toContain("syntheticShared");
 const receipt=await runSdkBuildDiagnostic(root,{expected,inputManifest});expect(receipt.failureCode).toBeNull();expect(receipt).toMatchObject({status:"completed",cleanupConfirmed:true,runtimeOutputUnchanged:true,caseResult:false,scenarioAttempts:0});expect(receipt.build).toMatchObject({exitCode:0,processGroupSettled:true});expect(receipt.scan?.files.length).toBe(4);
 await expect(lstat(path.join(root,"packages/shared/dist"))).rejects.toThrow();await expect(lstat(path.join(root,"node_modules/.cache/synthetic-owned-cache"))).rejects.toThrow();
 expect(await readFile(path.join(root,SDK_DIAGNOSTIC_FILE),"utf8")).not.toContain("synthetic-owned-cache");
});
it("never invokes the live pinned builder on a mismatched source identity",async()=>{
 const {root}=await syntheticRepository();let invoked=false;const receipt=await runSdkBuildDiagnostic(root,{builder:async()=>{invoked=true;throw Error("not reached");}});expect(invoked).toBe(false);expect(receipt).toMatchObject({status:"failed",failureCode:"source_identity_mismatch"});
});
it("only enters the diagnostic hook for the exact existing build job, not imports, paid cells or a normal local build",async()=>{
 const root=await temp();await write(root,"tests/runner-e2e/sdk-build-diagnostic-request.json",'{"schema":"paperclip.sdk-build-diagnostic-request/v1","buildValidationOnly":true,"noPaidAdmission":true}');let calls=0;const run=async()=>{calls++;return{synthetic:true};};
 for(const env of [{},{GITHUB_ACTIONS:"true",GITHUB_JOB:"run"},{GITHUB_ACTIONS:"false",GITHUB_JOB:"build_runner_artifacts"}])expect(await maybeSdkBuildDiagnostic(root,env,run)).toBeNull();expect(calls).toBe(0);
 expect(await maybeSdkBuildDiagnostic(root,{GITHUB_ACTIONS:"true",GITHUB_JOB:"build_runner_artifacts"},run)).toEqual({synthetic:true});expect(calls).toBe(1);
});

it("fails closed before any live launcher path while keeping the existing catalog graph available",()=>{
 for(const args of [[],["--id","example"],["--matrix-json","--installed-startup-only"],["--list","--target-config","private.json"],["product-journeys","--list"]])expect(()=>assertSdkDiagnosticInvocation(true,args)).toThrow("scenario execution is forbidden");
 for(const args of [["--matrix-json","--id","example"],["--list","--suite","chat-features"]])expect(()=>assertSdkDiagnosticInvocation(true,args)).not.toThrow();
 expect(()=>assertSdkDiagnosticInvocation(false,["--id","example"])).not.toThrow();
});

it.each(["packages/plugins/sdk/src/index.ts","packages/shared/tsconfig.json","packages/shared/src/untracked.ts"])("rejects dirty or unexpected copied %s bytes before any builder",async file=>{
 const {root,expected,inputManifest}=await syntheticRepository();await write(root,file,"synthetic dirty working bytes\n");let invoked=false;const receipt=await runSdkBuildDiagnostic(root,{expected,inputManifest,builder:async()=>{invoked=true;throw Error("must not run");}});expect(invoked).toBe(false);expect(receipt.status).toBe("failed");expect(["source_input_blob_mismatch","source_input_untracked"]).toContain(receipt.failureCode);expect(receipt.cleanupConfirmed).toBe(true);
});
it("rejects copied source mutation after the artificial builder before scanning",async()=>{
 const {root,expected,inputManifest}=await syntheticRepository();let scanned=false;const receipt=await runSdkBuildDiagnostic(root,{expected,inputManifest,builder:async(args,options)=>{const child=await runSdkDiagnosticChild(args,options);await write(options.cwd,"packages/shared/src/index.ts","synthetic post-build mutation\n");return child;},scanner:async()=>{scanned=true;throw Error("must not scan");}});expect(scanned).toBe(false);expect(receipt).toMatchObject({status:"failed",failureCode:"copied_source_changed",cleanupConfirmed:true,runtimeOutputUnchanged:true});
});
it("retains a separately hash-bound lock overlay while all source/config Git blobs stay frozen",async()=>{
 const {root,expected,inputManifest}=await syntheticRepository();await write(root,"pnpm-lock.yaml","synthetic trusted target-lock overlay\n");const receipt=await runSdkBuildDiagnostic(root,{expected,inputManifest});expect(receipt).toMatchObject({status:"completed",cleanupConfirmed:true,lockSha256:hash("synthetic trusted target-lock overlay\n")});
});
