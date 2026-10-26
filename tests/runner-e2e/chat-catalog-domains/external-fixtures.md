# Disposable named-provider fixture references

The coordinator may supply `PAPERCLIP_CHAT_CATALOG_EXTERNAL_CONFIG` as the absolute
path to an untracked JSON file with mode `0600`. Do not put credentials in the
file. Only explicit disposable resource identifiers, nonsecret choices and names
of credential environment variables belong there. The file schema is:

```json
{
  "schemaVersion": 1,
  "providers": {
    "notion": {
      "disposable": true,
      "resourceIds": ["authorized-disposable-workspace-id"],
      "credentialEnv": ["PAPERCLIP_CHAT_EVAL_NOTION_AUTH"],
      "prerequisites": {
        "workspaceId": "authorized-disposable-workspace-id",
        "recentPageId": "synthetic-launch-update-page-id",
        "olderPageId": "synthetic-background-page-id",
        "mcpUrl": "https://mcp.notion.com/mcp"
      }
    }
  }
}
```

`external-fixtures.ts` lists exact required fields per scenario. A fixture marked
configured is **only a prerequisite receipt**, never an assertion that the
provider, callback, permission or scenario works. Every provider call must still
be observed independently. Existing production accounts are never adopted by
inference. No connector/grant may be created outside the disposable company or
against a resource outside its explicit allowlist.

Notion needs synthetic recent/background launch pages, separately authorized
shared and personal workspaces for account-mismatch coverage, plus explicit
expired credentials and a disposable OAuth browser-session reference for repair
and handoff. Slack needs its disposable app/workspace, sender, channel/thread/file
IDs, credentials and a registered callback origin that reaches the coordinator's
isolated server. AgentMail needs an authorized disposable inbox and a real
controlled recipient corresponding to the catalog's synthetic address (or an
explicitly audited query identity binding), plus two inbound messages for reply
coverage. A vault needs a supported disposable provider and reference. Credential
values stay in coordinator child environment variables named
`PAPERCLIP_CHAT_EVAL_*`; session references identify a private session file rather
than embedding session bytes.

Missing input throws a setup blocker before chat or provider writes. Sanitized
receipts contain only scenario, provider, configured boolean and missing field
names. Never persist the parsed private file, credential values, session state or
raw provider receipts into tracked files/public evidence.

The two project repository scenarios use a `github` provider binding with an
explicitly authorized token environment reference `tokenEnv` (also present in
`credentialEnv`). Add-repository requires `siteRepositoryId`; replacement requires
`oldRepositoryId` and `newRepositoryId`. Each numeric ID must occur in
`resourceIds`. The scoped disposable credential must independently expose the
canonical synthetic names `acorn/site`, `acorn/site-old`, and `acorn/site-new`
needed by the selected query through the production GitHub connection. Different
real names require a reviewed query identity binding; they are never silently
substituted. The fixture creates a company-owned encrypted secret and public
connection, verifies current repository discovery, and deletes both on cleanup.
Ambient `gh` authentication and personal credentials are never adopted.

Synthetic notes apps, MCP gateways, local plugins, team packages, local encrypted
secrets and test endpoints do not require this file. They use real public
Paperclip APIs and controlled fixture implementations; they cannot count as live
proof of Notion, Slack, AgentMail or vault operation.
