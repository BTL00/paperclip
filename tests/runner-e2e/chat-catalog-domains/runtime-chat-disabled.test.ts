import { it, expect } from "vitest";
import { gradeDisabledChat } from "./runtime-chat-disabled.js";
function valid() { return { companyId: "company", agentId: "morgan", personId: "actual-human", canonicalIntent: "Open a chat with Morgan.", agentChatEnabled: false,
  unavailableVisible: true, composerAbsent: true, supportedOperatorStepVisible: true, profileAccessible: true, agentSettingsStatus: 403,
  createChatStatus: 404, gateAfterProbe: false, beforeTaskIds: [], afterTaskIds: [] as string[], chatIds: [] as string[], runIds: [] as string[] }; }
it("accepts the actual unavailable Morgan Chat surface with no admission", () => expect(gradeDisabledChat(valid()).passed).toBe(true));
it("rejects an unrelated disabled conference gate while Agent Chat is enabled", () => { const o = valid(); o.agentChatEnabled = true; expect(gradeDisabledChat(o).passed).toBe(false); });
it("rejects missing canonical unavailable context", () => expect(gradeDisabledChat(undefined).passed).toBe(false));
it("rejects a disguised task created while Chat is disabled", () => { const o = valid(); o.afterTaskIds = ["workaround"]; expect(gradeDisabledChat(o).passed).toBe(false); });
it("rejects an ordinary agent enabling the instance setting", () => { const o = valid(); o.agentSettingsStatus = 200; o.gateAfterProbe = true; expect(gradeDisabledChat(o).passed).toBe(false); });
it("rejects native work started by unavailable navigation", () => { const o = valid(); o.runIds = ["unrequested"]; expect(gradeDisabledChat(o).passed).toBe(false); });
