import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { ThemeProvider } from "@/context/ThemeContext";
import { TaskChatThreadView } from "./TaskChatThreadView";
import type { TaskChatMessageItem } from "./task-chat-model";

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompany: { id: "company", issuePrefix: "RUN" } }),
  useOptionalCompany: () => ({ companies: [{ id: "company", issuePrefix: "RUN" }], selectedCompany: { id: "company", issuePrefix: "RUN" } }),
}));

const reply: TaskChatMessageItem = {
  id: "case-response", kind: "message", author: "agent",
  text: `Open customer cases for **Launch** (project):

| Case | Title | Status |
|---|---|---|
| RUN-C1 | Mobile checkout failure | **in_progress** |
| RUN-C2 | Keyboard focus loss | **in_review** |

RUN-C3 "Resolved image clipping" is **done**, so not included.`,
};
function render(enabled?: boolean) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/RUN/chats/ceo"]}>
        <ThemeProvider>
          <TaskChatThreadView items={[reply]} scroll={false} {...{ linkCaseReferences: enabled }} />
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it("renders the actual case table identifiers as company-bound links when enabled", () => {
  const html = render(true);
  expect(html).toContain('href="/RUN/cases/RUN-C1"');
  expect(html).toContain('href="/RUN/cases/RUN-C2"');
  expect(html).toContain("Mobile checkout failure");
  expect(html).toContain("so not included.");
});
it.each([false, undefined])("leaves case references as text when the feature is %s", enabled => {
  const html = render(enabled);
  expect(html).toContain("RUN-C1");
  expect(html).not.toContain('data-mention-kind="case"');
  expect(html).not.toContain('/cases/RUN-C');
});
