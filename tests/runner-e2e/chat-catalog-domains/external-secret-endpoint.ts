import {createServer} from "node:http";
import {mkdir,realpath,writeFile,rm} from "node:fs/promises";
import path from "node:path";
import {resolveDefaultAgentWorkspaceDir} from "../../../server/src/home-paths.js";
import {listenOnFetchAllowedPort} from "../../e2e/fetch-allowed-port.js";
import type {ChatCatalogContext} from "../chat-catalog-contract.js";

/** Owned loopback publishing check. Credential bytes stay in the server closure;
 * the task receives only a script path and sanitized result. */
export async function secretTestEndpoint(ctx:ChatCatalogContext,agentId:string,value:string,envKey:"PUBLISHING_API_KEY"|"DEPLOYMENT_API_KEY"){
 if(ctx.input.execution.environment.id!=="local")throw new Error("Setup blocker: controlled secret endpoint needs the actual local worker environment");
 const temporary=process.env.PAPERCLIP_RUNNER_E2E_TEMP_ROOT;if(!temporary)throw new Error("Secret endpoint requires its isolated attempt root");
 const root=await realpath(temporary),candidate=path.resolve(resolveDefaultAgentWorkspaceDir(agentId));
 if(!candidate.startsWith(root+path.sep))throw new Error("Secret endpoint worker workspace escaped the disposable root");
 await mkdir(candidate,{recursive:true});const home=await realpath(candidate);if(!home.startsWith(root+path.sep))throw new Error("Secret endpoint worker path resolved outside the disposable root");
 const calls:Array<{authorized:boolean;agentId:string;runId:string;method:string;pathname:string}>=[];
 const server=createServer((request,response)=>{
  const authorized=request.headers.authorization===`Bearer ${value}`;
  const record={authorized,agentId:String(request.headers["x-paperclip-agent"]??""),runId:String(request.headers["x-paperclip-run"]??""),method:request.method??"",pathname:request.url??""};
  if(calls.length>=8){response.writeHead(429);response.end();return;}calls.push(record);
  const ok=authorized&&record.agentId===agentId&&/^[a-f0-9-]{36}$/i.test(record.runId)&&record.method==="GET"&&record.pathname==="/publishing-check";
  response.writeHead(ok?200:403,{"content-type":"application/json"});response.end(JSON.stringify({ok,check:"publishing endpoint",status:ok?200:403}));
 });
 const port=await listenOnFetchAllowedPort(server),scriptPath=path.join(home,`secret-endpoint-check-${ctx.input.nonce}.mjs`),url=`http://127.0.0.1:${port}/publishing-check`;
 await writeFile(scriptPath,`const credential=process.env[${JSON.stringify(envKey)}];if(!credential){process.stdout.write(JSON.stringify({ok:false,reason:'credential unavailable'}));process.exitCode=1;}else{try{const response=await fetch(${JSON.stringify(url)},{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{authorization:'Bearer '+credential,'x-paperclip-agent':process.env.PAPERCLIP_AGENT_ID??'','x-paperclip-run':process.env.PAPERCLIP_RUN_ID??''}});const result=await response.json();process.stdout.write(JSON.stringify({ok:result.ok===true,status:response.status,check:'publishing endpoint'}));if(!response.ok)process.exitCode=1;}catch{process.stdout.write(JSON.stringify({ok:false,reason:'endpoint check failed'}));process.exitCode=1;}}\n`,{mode:0o600});
 return {url,scriptPath,calls,async close(){try{await rm(scriptPath,{force:true});}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}}};
}
