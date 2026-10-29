import { expect, it } from "vitest";
import type { MatrixExecution } from "./types.js";
import { runnerMatrix } from "./catalog.js";
import { buildPaperclipServerEnvironment, buildRunnerE2EProcessEnvironment } from "./harness-env.js";
import { DEFAULT_ANNOUNCEMENT_FEED_URL } from "../../packages/shared/src/announcements.js";
const selected = runnerMatrix.find(row => row.id === "chat-features.runner-opencode.local.navigation-preferences.dismiss-announcement")!;
it("the exact selected native case reaches the server with its real default public feed, independently of ambient switches", () => {
 for (const ambient of [{}, {PAPERCLIP_ANNOUNCEMENTS_ENABLED:"false",PAPERCLIP_ANNOUNCEMENTS_FEED_URL:"https://foreign.invalid/synthetic.json"}]) {
  const env=buildPaperclipServerEnvironment(buildRunnerE2EProcessEnvironment(ambient,[selected]));
  expect(env.PAPERCLIP_ANNOUNCEMENTS_ENABLED).toBe("true");expect(env.PAPERCLIP_ANNOUNCEMENTS_FEED_URL).toBe(DEFAULT_ANNOUNCEMENT_FEED_URL);
 }
});
it("an empty or mixed selection cannot opt unrelated work into announcements", () => {
 const other=runnerMatrix.find(row=>row.id!==selected.id)!;
 for(const rows of [[],[selected,other],[selected,selected],[other]])expect(buildPaperclipServerEnvironment(buildRunnerE2EProcessEnvironment({PAPERCLIP_ANNOUNCEMENTS_ENABLED:"true"},rows)).PAPERCLIP_ANNOUNCEMENTS_ENABLED).toBe("false");
});
it.each(["id","task","profile","environment","suite"] as const)("rejects an altered %s identity at the existing server boundary", field => {
 const wrong={...selected,...(field==="id"?{id:"foreign"}:field==="task"?{task:{...selected.task,id:"foreign"}}:field==="profile"?{profile:{...selected.profile,model:"foreign"}}:field==="environment"?{environment:{...selected.environment,id:"foreign"}}:{suite:{...selected.suite,id:"foreign"}})};
 expect(buildPaperclipServerEnvironment(buildRunnerE2EProcessEnvironment({PAPERCLIP_ANNOUNCEMENTS_ENABLED:"true"},[wrong as unknown as MatrixExecution])).PAPERCLIP_ANNOUNCEMENTS_ENABLED).toBe("false");
});
