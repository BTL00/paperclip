import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createSdkAstContext, loadSdkAstParser, observeSdkAstSpans, SDK_AST_BINDING, validateSdkAstContext } from "./sdk-build-ast-context.mjs";
import { diagnosticSecretShapeRanges, findSecretLeakMatch } from "./redaction.js";
import { validateSdkDiagnosticScan } from "./sdk-build-diagnostic.mjs";
const parser = loadSdkAstParser(path.resolve(import.meta.dirname, "../.."));
const context = (text: string) => observeSdkAstSpans(text, parser, diagnosticSecretShapeRanges(text));
const observed = () => ({schema:"paperclip.sdk-build-ast-context/v1",observationalOnly:true,suppressedFindings:0,binding:{...SDK_AST_BINDING},comparison:"matched",unresolvedReason:null,parserVersion:"7.29.8",parseErrorCount:0,matches:context("interface Config { OPENROUTER_API_KEY: z.ZodOptional<z.ZodString>; }").matches});
it("observes representative cross-token type context without text or suppressing the original shape",()=>{
 const text="interface Config { OPENROUTER_API_KEY: z.ZodOptional<z.ZodString>; }", row=context(text);
 expect(findSecretLeakMatch(text,[])?.reason).toBe("secret-shaped value");expect(row.unresolvedReason).toBeNull();expect(row.matches).toHaveLength(1);expect(row.matches[0]).toMatchObject({detector:3,containsTypeNode:true,containsPropertySignature:true,containsLiteral:false,containsComment:false});expect(row.matches[0]!.nodeKinds.every(Number.isSafeInteger)).toBe(true);
 for(const word of ["OPENROUTER_API_KEY","ZodOptional","Config"])expect(JSON.stringify(row)).not.toContain(word);
});
it.each([
 'declare const value: "sk-ABCDEFGHIJKLMNOPQRSTUVWX123456789";',
 'interface Config { key: "sk-ABCDEFGHIJKLMNOPQRSTUVWX123456789"; }',
 '// sk-ABCDEFGHIJKLMNOPQRSTUVWX123456789\ninterface Config {}',
 'declare const value: { key: "sk-ABCDEFGHIJKLMNOPQRSTUVWX123456789" };',
])("retains a credential shape even inside declaration content %#",text=>{
 const original=findSecretLeakMatch(text,[]), row=context(text);expect(original?.reason).toBe("secret-shaped value");expect(row.unresolvedReason).toBeNull();expect(row.matches.length).toBeGreaterThan(0);expect(row.matches.some(match=>match.containsLiteral||match.containsComment)).toBe(true);expect(findSecretLeakMatch(text,[])).toEqual(original);expect(JSON.stringify(row)).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWX123456789");
});
it("cannot suppress an exact private value in a type identifier or reinterpret a public enum as authority",()=>{
 const value="synthetic_private_credential_68194025",text=`interface Config { ${value}: string }`;
 expect(findSecretLeakMatch(text,[value],{includeShapes:false})?.reason).toBe("exact secret value");expect(context(text).unresolvedReason).toBe("no_shape_match");
});
it("reports parse failures and observation bounds without any source diagnostics",()=>{
 const text='interface { OPENROUTER_API_KEY: z.ZodOptional<z.ZodString>;';const row=context(text);expect(row.unresolvedReason).toBe("parse_error");expect(row.parseErrorCount).toBeGreaterThan(0);expect(row.matches).toEqual([]);expect(JSON.stringify(row)).not.toContain("OPENROUTER");
 expect(observeSdkAstSpans("",parser,{bounded:false,matches:[]})).toMatchObject({unresolvedReason:"shape_span_bound",matches:[]});
 expect(context(Array(33).fill('"sk-ABCDEFGHIJKLMNOPQRSTUVWX123456789"').join(";"))).toMatchObject({unresolvedReason:"shape_span_bound",matches:[]});
});
it("does not infer authenticated target context from missing copied inputs",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"sdk-ast-missing-synthetic-"));try{const result=await createSdkAstContext(root,[],diagnosticSecretShapeRanges);expect(result).toMatchObject({comparison:"unresolved",unresolvedReason:"metadata_unavailable",matches:[],suppressedFindings:0});expect(()=>validateSdkAstContext(result)).not.toThrow();}finally{await rm(root,{recursive:true,force:true});}
});
it("accepts only closed fixed enums, integers and hashes",()=>{
 const value=observed();expect(()=>validateSdkAstContext(value)).not.toThrow();
 for(const extra of [{preview:"synthetic-private-token-1672"},{nodeName:"synthetic-private-token-1672"},{diagnostic:"synthetic-private-token-1672"}])expect(()=>validateSdkAstContext({...value,...extra})).toThrow("ast_metadata_invalid");
 for(const patch of [{observationalOnly:false},{suppressedFindings:1},{unresolvedReason:"private raw exception"},{parserVersion:"private-name"},{binding:{...value.binding,targetSha256:"unbound"}},{binding:{...value.binding,targetSha256:"0".repeat(64)}}])expect(()=>validateSdkAstContext({...value,...patch})).toThrow("ast_metadata_invalid");
 for(const patch of [{nodeKinds:["Identifier"]},{start:-1},{end:9e9},{containsLiteral:"private"},{text:"synthetic-secret"}])expect(()=>validateSdkAstContext({...value,matches:[{...value.matches[0],...patch}]})).toThrow("ast_metadata_invalid");
 expect(()=>validateSdkAstContext({...value,comparison:"unresolved",unresolvedReason:"identity_mismatch",matches:value.matches})).toThrow("ast_metadata_invalid");
});
it("keeps generic findings in the closed scan while AST identity is unresolved",()=>{
 const ast={...observed(),comparison:"unresolved",unresolvedReason:"identity_mismatch",matches:[],parserVersion:null,parseErrorCount:null,binding:{...SDK_AST_BINDING,targetSha256:"0".repeat(64)}};
 const scan={schema:"paperclip.sdk-build-diagnostic-scan/v2",originalCanaryAttribution:"unavailable-original-registry-not-inferred",astContext:ast,certificates:["packages/shared/dist","packages/plugins/sdk/dist"].map(target=>({target,sources:"1".repeat(64),outputs:"2".repeat(64),markerSha256:"3".repeat(64)})),files:[{path:"packages/shared/dist/validators/agent.d.ts",bytes:100,sha256:"0".repeat(64),findings:["generic-key-shape"]}]};
 expect(()=>validateSdkDiagnosticScan(scan)).not.toThrow();expect(scan.files[0]!.findings).toEqual(["generic-key-shape"]);expect(()=>validateSdkDiagnosticScan({...scan,astContext:{...ast,suppressedFindings:1}})).toThrow("ast_metadata_invalid");
});

it("requires matched context to bind the unchanged generic finding and both certified outputs",()=>{
 const ast=observed(),certificates=[{target:"packages/shared/dist",sources:"1".repeat(64),outputs:SDK_AST_BINDING.sharedOutputsSha256,markerSha256:"3".repeat(64)},{target:"packages/plugins/sdk/dist",sources:"1".repeat(64),outputs:SDK_AST_BINDING.sdkOutputsSha256,markerSha256:"3".repeat(64)}];
 const file={path:"packages/shared/dist/validators/agent.d.ts",bytes:100,sha256:SDK_AST_BINDING.targetSha256,findings:["generic-key-shape"]},scan={schema:"paperclip.sdk-build-diagnostic-scan/v2",originalCanaryAttribution:"unavailable-original-registry-not-inferred",astContext:ast,certificates,files:[file]};
 expect(()=>validateSdkDiagnosticScan(scan)).not.toThrow();
 for(const files of [[],[{...file,findings:[]}],[{...file,sha256:"0".repeat(64)}]])expect(()=>validateSdkDiagnosticScan({...scan,files})).toThrow("ast_metadata_invalid");
 expect(()=>validateSdkDiagnosticScan({...scan,certificates:[{...certificates[0],outputs:"0".repeat(64)},certificates[1]]})).toThrow("ast_metadata_invalid");
 for(const key of Object.keys(SDK_AST_BINDING))expect(()=>validateSdkAstContext({...ast,binding:{...ast.binding,[key]:key==="inputCount"?500:"0".repeat(64)}})).toThrow("ast_metadata_invalid");
});

it("never propagates parser exceptions or arbitrary range fields into context",()=>{
 const privateText="synthetic-private-error-47918625",text="interface Config {}";
 const parserFailure={parse(){throw new Error(privateText)}};
 const result=observeSdkAstSpans(text,parserFailure,{bounded:true,matches:[]});expect(result).toEqual({unresolvedReason:"parse_error",parseErrorCount:1,matches:[]});expect(JSON.stringify(result)).not.toContain(privateText);
 const ranges={bounded:true,matches:[{detector:3,start:0,end:4,text:privateText}]};expect(observeSdkAstSpans(text,parser,ranges)).toEqual({unresolvedReason:"shape_span_bound",parseErrorCount:null,matches:[]});
});
