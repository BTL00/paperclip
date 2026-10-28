import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, lstat, readdir, readFile, realpath, rm, symlink, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
export const SDK_DIAGNOSTIC_FILE = "packages/paperclip-runner/dist/diagnostics/source-sdk-build-validation.json";
export const SDK_DIAGNOSTIC_SOURCE = Object.freeze({ shared: "6226b85ea08ae62634c621ce48e8e8b33db146a1", sdk: "4568bd1d9c0138e5d125d605ea3d4c4175588828", helper: "4e8c21ea34550b5308009cbc4cebfebfa99d1c728b641600964bde5237f372ae" });
export const SDK_DIAGNOSTIC_SYNTHETIC_SOURCES = Object.freeze({ OPENROUTER_API_KEY: "synthetic-sdk-diagnostic-token-48397526", CODEX_AUTH_JSON: JSON.stringify({ tokens: { access_token: "synthetic-sdk-diagnostic-access-52847391" }, metadata: { kind: "identity" } }) });
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const targets = ["packages/shared/dist", "packages/plugins/sdk/dist"];
const inputs = ["scripts/ensure-plugin-build-deps.mjs", "package.json", "pnpm-lock.yaml", "tsconfig.json", "tsconfig.base.json", "packages/shared/src", "packages/shared/package.json", "packages/shared/tsconfig.json", "packages/plugins/sdk/src", "packages/plugins/sdk/package.json", "packages/plugins/sdk/tsconfig.json"];
export function sdkDiagnosticEnvironment(root) {
  return { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: path.join(root, "home"), TMPDIR: path.join(root, "tmp"), LANG: "C", LC_ALL: "C", TZ: "UTC", ...SDK_DIAGNOSTIC_SYNTHETIC_SOURCES };
}
export async function sdkDiagnosticTree(root) {
  const files = []; let bytes = 0;
  async function visit(dir) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name), st = await lstat(file);
      if (st.isSymbolicLink() || (!st.isDirectory() && !st.isFile())) throw new Error("invalid_tree");
      if (st.isDirectory()) await visit(file);
      else { bytes += st.size; if (files.length >= 4096 || st.size > 8*1024*1024 || bytes > 64*1024*1024) throw new Error("tree_bound"); files.push({ path: path.relative(root,file).split(path.sep).join("/"), bytes: await readFile(file) }); }
    }
  }
  await visit(root); return files;
}
async function treeIdentity(root) {
  try { return hash(Buffer.concat((await sdkDiagnosticTree(root)).flatMap(row => [Buffer.from(JSON.stringify([row.path,row.bytes.length])),row.bytes]))); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
export async function prepareSdkDiagnosticCopy(repository, owned) {
  let count = 0, bytes = 0;
  async function copy(from,to) {
    const st=await lstat(from); if(st.isSymbolicLink())throw new Error("source_symlink");
    if(st.isDirectory()){await mkdir(to,{recursive:true,mode:0o700});for(const name of await readdir(from))await copy(path.join(from,name),path.join(to,name));}
    else {bytes+=st.size;if(!st.isFile()||++count>4096||bytes>64*1024*1024)throw new Error("source_bound");await mkdir(path.dirname(to),{recursive:true,mode:0o700});await copyFile(from,to);}
  }
  for(const file of inputs)await copy(path.join(repository,file),path.join(owned,file));
  for(const packagePath of ["", "packages/shared", "packages/plugins/sdk"]){
    const source=path.join(repository,packagePath,"node_modules"),destination=path.join(owned,packagePath,"node_modules");await mkdir(destination,{recursive:true,mode:0o700});
    for(const entry of await readdir(source,{withFileTypes:true})){
      if(entry.name.startsWith(".")||entry.name==="@paperclipai")continue;
      if(entry.name.startsWith("@")){await mkdir(path.join(destination,entry.name),{recursive:true});for(const child of await readdir(path.join(source,entry.name)))await symlink(await realpath(path.join(source,entry.name,child)),path.join(destination,entry.name,child));}
      else await symlink(await realpath(path.join(source,entry.name)),path.join(destination,entry.name));
    }
    await mkdir(path.join(destination,"@paperclipai"),{recursive:true});await symlink(path.join(owned,"packages/shared"),path.join(destination,"@paperclipai/shared"));
  }
  for(const directory of ["home","tmp","node_modules/.cache"])await mkdir(path.join(owned,directory),{recursive:true,mode:0o700});
  return { files:count, bytes };
}
export async function runSdkDiagnosticChild(args,{cwd,env,timeoutMs=120000,outputLimit=8*1024*1024}={}) {
  const child=spawn(process.execPath,args,{cwd,env,detached:true,stdio:["ignore","pipe","pipe"]}),digests=[createHash("sha256"),createHash("sha256")];let outputBytes=0,limit=false,timedOut=false;
  let signalFailed=false; const signal=kind=>{if(!Number.isInteger(child.pid))return;try{process.kill(-child.pid,kind);}catch(error){if(error.code!=="ESRCH")signalFailed=true;}};
  let escalation;const stop=()=>{signal("SIGTERM");escalation??=setTimeout(()=>signal("SIGKILL"),2000);};
  const timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);
  [child.stdout,child.stderr].forEach((stream,index)=>stream.on("data",chunk=>{digests[index].update(chunk);outputBytes+=chunk.length;if(outputBytes>outputLimit&&!limit){limit=true;stop();}}));
  let spawnFailed=false;const code=await new Promise(resolve=>{child.on("error",()=>{spawnFailed=true;});child.on("close",code=>resolve(code));});clearTimeout(timer);if(escalation)clearTimeout(escalation);
  let settled=spawnFailed&&!Number.isInteger(child.pid);for(let tries=0;!settled&&tries<40;tries++){try{process.kill(-child.pid,0);signal("SIGKILL");}catch(error){if(error.code==="ESRCH"){settled=true;break;}signalFailed=true;break;}await new Promise(resolve=>setTimeout(resolve,50));}
  return {exitCode:code,spawnFailed,timedOut,outputLimitExceeded:limit,outputBytes,stdoutSha256:digests[0].digest("hex"),stderrSha256:digests[1].digest("hex"),processGroupSettled:settled&&!signalFailed};
}
export async function runSdkBuildDiagnostic(repositoryRoot,{expected=SDK_DIAGNOSTIC_SOURCE,builder=runSdkDiagnosticChild,scanner=runSdkDiagnosticChild}={}) {
  const repository=await realpath(repositoryRoot),git=(...args)=>execFileSync("git",args,{cwd:repository,encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();
  const receipt={schema:"paperclip.sdk-build-only-diagnostic/v1",diagnosticOnly:true,caseResult:false,scenarioAttempts:0,providerCalls:null,sourceRevision:git("rev-parse","HEAD"),sourceIdentity:{shared:git("rev-parse","HEAD:packages/shared/src"),sdk:git("rev-parse","HEAD:packages/plugins/sdk/src"),helper:hash(await readFile(path.join(repository,"scripts/ensure-plugin-build-deps.mjs")))},lockSha256:hash(await readFile(path.join(repository,"pnpm-lock.yaml"))),status:"failed",failureCode:null,cleanupConfirmed:false};
  const output=path.join(repository,SDK_DIAGNOSTIC_FILE);let owned,settled=true;
  const watched=[...targets,"node_modules/.cache/paperclip-plugin-build-deps.lock"];
  const before=await Promise.all(watched.map(target=>treeIdentity(path.join(repository,target))));
  try {
    if(JSON.stringify(receipt.sourceIdentity)!==JSON.stringify(expected))throw new Error("source_identity_mismatch");
    owned=await mkdtemp(path.join(os.tmpdir(),"paperclip-sdk-build-diagnostic-"));receipt.copy=await prepareSdkDiagnosticCopy(repository,owned);const env=sdkDiagnosticEnvironment(owned);
    receipt.environmentKeys=Object.keys(env).sort();receipt.compilerPackageSha256=hash(await readFile(path.join(owned,"node_modules/typescript/package.json")));
    receipt.build=await builder([path.join(owned,"scripts/ensure-plugin-build-deps.mjs")],{cwd:owned,env});settled=receipt.build.processGroupSettled;
    if(!settled||receipt.build.exitCode!==0||receipt.build.timedOut||receipt.build.outputLimitExceeded)throw new Error("certified_build_failed");
    const scanOutput=path.join(owned,"closed-scan.json");receipt.scanProcess=await scanner(["--import",path.join(repository,"cli/node_modules/tsx/dist/loader.mjs"),await realpath(path.join(repository,"tests/runner-e2e/sdk-build-diagnostic-scan.ts")),owned,scanOutput],{cwd:owned,env});settled=receipt.scanProcess.processGroupSettled;
    if(!settled||receipt.scanProcess.exitCode!==0||receipt.scanProcess.timedOut||receipt.scanProcess.outputLimitExceeded)throw new Error("diagnostic_scan_failed");
    const scanFile=await lstat(scanOutput);if(!scanFile.isFile()||scanFile.isSymbolicLink()||scanFile.size>4*1024*1024)throw new Error("scan_metadata_invalid");const scan=JSON.parse(await readFile(scanOutput,"utf8"));validateSdkDiagnosticScan(scan);receipt.scan=scan;receipt.status="completed";
  } catch(error) {receipt.failureCode=["source_identity_mismatch","certified_build_failed","diagnostic_scan_failed","scan_metadata_invalid","source_symlink","source_bound","invalid_tree","tree_bound"].includes(error.message)?error.message:"diagnostic_operation_failed";}
  finally {
    if(owned&&settled){try{await rm(owned,{recursive:true,force:true});await lstat(owned);}catch(error){if(error.code==="ENOENT")receipt.cleanupConfirmed=true;}}
    receipt.runtimeOutputUnchanged=JSON.stringify(before)===JSON.stringify(await Promise.all(watched.map(target=>treeIdentity(path.join(repository,target)))));
    if(!receipt.runtimeOutputUnchanged){receipt.status="failed";receipt.failureCode="runtime_output_changed";}
    if(!receipt.cleanupConfirmed){receipt.status="failed";receipt.failureCode??="cleanup_unconfirmed";}
    await mkdir(path.dirname(output),{recursive:true,mode:0o700});await writeFile(output,JSON.stringify(receipt,null,2)+"\n",{flag:"wx",mode:0o600});
  }
  return receipt;
}

export async function maybeSdkBuildDiagnostic(repositoryRoot,env=process.env,run=runSdkBuildDiagnostic){
  if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_JOB!=="build_runner_artifacts")return null;
  const request=path.join(repositoryRoot,"tests/runner-e2e/sdk-build-diagnostic-request.json");
  let value;try{value=JSON.parse(await readFile(request,"utf8"));}catch(error){if(error.code==="ENOENT")return null;throw new Error("sdk_diagnostic_request_invalid");}
  if(value.schema!=="paperclip.sdk-build-diagnostic-request/v1"||value.buildValidationOnly!==true||value.noPaidAdmission!==true)throw new Error("sdk_diagnostic_request_invalid");
  return run(repositoryRoot);
}

export function validateSdkDiagnosticScan(scan){
 const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort());
 const hex=value=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
 if(!exact(scan,["schema","certificates","files","originalCanaryAttribution"])||scan.schema!=="paperclip.sdk-build-diagnostic-scan/v1"||scan.originalCanaryAttribution!=="unavailable-original-registry-not-inferred"||!Array.isArray(scan.files)||scan.files.length>4096||new Set(scan.files.map(row=>row.path)).size!==scan.files.length||!Array.isArray(scan.certificates)||scan.certificates.length!==2)throw new Error("scan_metadata_invalid");
 for(const [index,row]of scan.certificates.entries())if(!exact(row,["target","sources","outputs","markerSha256"])||row.target!==targets[index]||![row.sources,row.outputs,row.markerSha256].every(hex))throw new Error("scan_metadata_invalid");
 for(const row of scan.files)if(!exact(row,["path","bytes","sha256","findings"])||typeof row.path!=="string"||!targets.some(target=>row.path.startsWith(target+"/"))||!/^[A-Za-z0-9._/-]{1,300}$/.test(row.path)||row.path.split("/").some(part=>part==="..")||!Number.isSafeInteger(row.bytes)||row.bytes<0||row.bytes>8*1024*1024||!hex(row.sha256)||!Array.isArray(row.findings)||row.findings.length>3||row.findings.some(kind=>!["generic-key-shape","synthetic-credential-exact-match","synthetic-nonsecret-json-exact-match"].includes(kind)))throw new Error("scan_metadata_invalid");
}
