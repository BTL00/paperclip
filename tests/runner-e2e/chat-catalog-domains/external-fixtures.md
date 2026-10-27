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
      "resourceIds": ["authorized-disposable-workspace-id", "synthetic-launch-update-page-id", "synthetic-background-page-id"],
      "credentialEnv": ["PAPERCLIP_CHAT_EVAL_NOTION_API", "PAPERCLIP_CHAT_EVAL_NOTION_MCP"],
      "prerequisites": {
        "workspaceId": "authorized-disposable-workspace-id",
        "recentPageId": "synthetic-launch-update-page-id",
        "olderPageId": "synthetic-background-page-id",
        "mcpUrl": "https://mcp.notion.com/mcp",
        "apiVersion": "2022-06-28",
        "apiTokenEnv": "PAPERCLIP_CHAT_EVAL_NOTION_API",
        "mcpTokenEnv": "PAPERCLIP_CHAT_EVAL_NOTION_MCP",
        "recentMarker": "Launch moves to November 8",
        "olderMarker": "Launch originally targeted October 1",
        "recentFactJson": "{\"subjectAliases\":[\"launch\",\"release\"],\"valueAliases\":[\"November 8\",\"Nov 8\",\"8 November\"]}",
        "olderFactJson": "{\"subjectAliases\":[\"launch\",\"release\"],\"valueAliases\":[\"October 1\",\"Oct 1\",\"1 October\"]}"
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

`secrets.configure-company-secret` needs no external account. It generates one
synthetic value in the selected attempt's private redactor and uses the finite
`company-secret-create` browser operation. That operation permits only the local
instance's company secret page, creates `Deployment API key` through its actual
form using `local_encrypted`, and returns a closed receipt containing its UUID
and booleans. The value stays out of argv, environment and Playwright Test
instrumentation. Morgan's reference is then selected and saved through the
ordinary visible environment-variable editor. Independent saved binding and
human activity reads prove configuration; they do not claim next-run delivery.

The two project repository scenarios use a `github` provider binding with an
explicitly authorized token environment reference `tokenEnv` (also present in
`credentialEnv`). Add-repository requires `siteRepositoryId` and
`siteRepositoryFullName`; replacement requires `oldRepositoryId`,
`oldRepositoryFullName`, `newRepositoryId`, and `newRepositoryFullName`. Each safe
numeric ID must occur in `resourceIds`, and each full name must identify its
authorized disposable owner/repository. The scoped credential must independently
expose those identities through the production GitHub connection. The audited
query binding replaces only `acorn/site`, `acorn/site-old`, or `acorn/site-new`
with the corresponding current provider identity after independent public API
readback validates its company, active connection and allowlisted numeric ID.
The remaining catalog prose is unchanged. The fixture creates a company-owned encrypted secret and public
connection, verifies current repository discovery, and deletes both on cleanup.
Ambient `gh` authentication and personal credentials are never adopted.

The named `notion-connected` case requires separate references for the official
Notion REST oracle and official Notion MCP authorization. The API version is an
explicit coordinator choice; its validity is not inferred from the example.
Workspace and both page UUIDs must occur in `resourceIds`. At execution, the
official [token bot-user endpoint](https://developers.notion.com/reference/get-self)
must report the selected workspace, and both allowlisted page bodies must contain
their distinct approved synthetic facts with the current page actually newer.
Only minimal page/source/date projections and workspace-match booleans enter
case observations. Raw account receipts, names and email remain private.
The model must independently perform a successful MCP read in its own source run;
the oracle's REST reads cannot satisfy that requirement. No generic or synthetic
MCP host is accepted as a named Notion proof. Missing bindings remain executable
setup blockers; source-reference availability is not provider validity evidence.

The two marker fields identify substantive facts present in the controlled page
bodies, never nonces or mandatory answer wording. Their bounded fact JSON defines
approved subject and value aliases (at most eight strings each). Each actual body
must substantiate its subject/value relation; the answer may paraphrase that
relation within a bounded passage. The grader accepts ordinary month-name dates
and validates Notion links by approved host and exact page UUID rather than
requiring a title slug, hyphenation style or query string.

Secure API-key entry uses `external-private-browser.ts` and its fixed worker in
a separate Node process. The selected human cookie and synthetic provider key
cross only a private `0600` request file, removed in `finally`. Child environment
inheritance is limited to tool paths and disposable process directories; no
credential appears in argv, environment or the closed receipt. The worker has
no Playwright Test execution context and never requests tracing, video or
screenshots. The normal source-chat browser never receives the key.

An offline browser canary under the actual human-session reporter settings
confirmed that disabling trace/video/screenshots alone does not make a Test
context safe for credential entry: a controlled failing fill retained a synthetic
value in stdout, JUnit, blob/HTML reports and error context. The structured JSON
sanitizer removed the same value, but it does not rewrite these raw reporter
sinks. The separate worker's controlled entry passed without Test API-step
collection. These are harness privacy controls, not provider or scenario passes.

Synthetic notes apps, MCP gateways, local plugins, team packages, local encrypted
secrets and test endpoints do not require this file. They use real public
Paperclip APIs and controlled fixture implementations; they cannot count as live
proof of Notion, Slack, AgentMail or vault operation.

During execution, the launcher copies only the selected case's declared
`externalInput` provider/fields and referenced values into an owned private0600
attempt file. Owning callbacks use `selectedExternalBinding(context)` and
`selectedExternalCredential(context, binding, referenceOrEnvField)`; these call
`context.input.privateInputs.configuration("external-provider")` and `.read(name)`.
They never fall back to process environment or adopt another provider's binding.
The launcher strips original external config/environment references from server,
model, provider and unrelated-case inheritance. Only declared reference names
and field names enter the public fingerprint; credentials enter the private
redaction sink. Local fixture CLI children use an explicit sanitized environment.

The finite `gateway-token-rotation` private-browser operation uses the actual
Tokens UI to issue one replacement and revoke the named old client only after
protocol discovery with the replacement succeeds. Old and unrelated-client
bearers enter through the private request. The one-time replacement crosses a
separate `0600` handoff inside the same disposable directory, reaches only the
owning callback/redactor, and is removed with the directory in `finally`.
The public receipt contains only fixed booleans, a token UUID and HTTP status;
it never contains a bearer. The parent separately verifies saved revocation,
other-client preservation, actual protocol access and reachable-output byte scans.

`app-permissions.grant-one-agent` requires only the selected official Notion
transport, disposable workspace and API/MCP credential references. It does not
require launch-summary pages or dates. The independent account probe verifies
the declared workspace through the official API, and the product connects to the
official MCP endpoint. Human audience changes use the real agent-selection UI;
public effective access verifies Morgan-only reach and unchanged action rules.

The `assistant-connections.use-scoped-client` companion declares a separate
external-model surface: selected `OPENAI_API_KEY`, the existing qualified
`gpt-5.4-mini` model, at most six provider requests, four tool invocations and
2048 total output tokens. It receives the original canonical query and actual
public MCP catalog, with no board API or native Agent Chat credential. Current
public scope names alone do not qualify a creation-only grant: valid comment
and update attempts against a separate readable control task must actually be
denied, leaving the control unchanged, before model dispatch. The requested
Website task is never created during setup. Unsupported effective authority is
an executable prerequisite blocker, distinct from the implemented model surface.

`chat-channels.reply-in-thread` constructs its own two real Slack threads and
therefore takes no pre-existing thread IDs. Its selected Slack fields are
`workspaceId`, `channelId`, `senderUserId`, `botUserId`, `appId`,
`registeredWebhookOrigin`, `webhookRelayPort`, `botTokenEnv`, `senderTokenEnv`,
`signingSecretEnv`, and `configurationTokenEnv`. Every provider ID must be in the
explicit disposable resource allowlist; the human and bot must be distinct. The
already-authorized app must have message event subscriptions and scopes for its
selected channel. The registered HTTPS origin must already forward to the
reserved loopback relay port and match the isolated server's actual advertised
webhook origin. The fixture does not manufacture a tunnel, widen OAuth scopes,
or adopt a production connector. Missing references fail setup before provider
operations. All three token references and the signing secret resolve only from
the selected private envelope.

The actual app manifest is kept privately for restoration. Only existing callback
URLs change. Endpoint setup and signed-in identity confirmation use supported
operator APIs with sensitive transport; they are not reported as completed
browser wizard steps. The canonical query and one separate status-discussion
precondition are actual human Slack messages. The latter has exactly one native
setup run on another source; its human comment is not canonical-source history.
That run counts within the four-run limit. One genuine signed canonical event
is replayed once to test idempotency. Cleanup restores the app manifest, removes
the new endpoint, restores the instance experiment flag, and deletes only
creation-receipted messages/uploads plus this app's replies within owned threads.
Provider response/account metadata and original manifest contents stay private.

`assistant-connections.revoke-personal-grant` needs no external account. Two
labelled generic assistant grants are genuinely registered and consented through
the current signed-in person's sensitive public API transport. This is labelled
fixture grant creation, not named ChatGPT setup or a completed consent wizard.
The old grant then creates the actual Website task through public MCP. A stable
owned runtime gate proves that its admitted worker is genuinely awaiting a tool
result before the canonical disconnect request. The actual model must identify
the old client, preserve its task, and direct a supported personal management
page before the human clicks the matching visible Revoke control. Fresh revoked
access and refresh calls must fail, the other grant remains usable with unchanged
scope, and the same worker stays running for five seconds after revocation. A
neutral release then lets that original worker finish normally. No provider
account is discovered, adopted, or mutated by this fixture.

`secrets.secret-proposal` uses a synthetic local-encrypted company secret and
Morgan's missing publishing reference; it needs no external account. The actual
admitted model creates one binding proposal per explicit request. The first is
rejected through the public Proposals review UI and its delivery state is read
again. Only then does the human repeat the unchanged catalog request to test
approval of a fresh proposal. Four native phases are declared: proposal,
rejection continuation, repeated proposal, and approval continuation. The four
persisted human comments comprise the two original-query turns and the product's
two human-attributed proposal-resolution notices. Approval proves the exact
saved reference and consumer, with no Morgan task run or task-delivery event;
it never proves that a later task already consumed or validated the value.

The `connect-slack` and `channel-prerequisites` journeys additionally select
`slackBrowserSessionEnv`, a private reference containing Playwright storage-state
JSON for the designated disposable **human** Slack account. It is separate from
the sender API token. Cookies/storage may belong only to official HTTPS Slack
hosts. The finite isolated browser verifies the selected workspace/channel URL
and copies the current person's actual member ID from their own profile before
submitting exactly the saved app's slash command with `connect`. Missing or
changed controls, a different member, an existing draft, expired sign-in or an
unavailable designated session fail that prerequisite; no API-created slash event
substitutes for it. The provider-signed callback and current processed
`lastConnectAt` are independently required before the real ownership button,
Continue to message test and Done controls. The final case also requires a new
actual two-way native conversation; credential saving or endpoint activation
alone does not pass. These callbacks are authored and calibrated offline, not
live-qualified Slack/browser evidence.

The private session JSON, each cookie/storage value, bot token and signing secret
remain in the selected private envelope, redactor, process memory and private
0600 child handoff. They never enter model input, public case state, argv,
subprocess environment, trace, video, screenshots or closed receipts. The child
handoff is removed unconditionally. Supply no unrelated browser sessions.

`chat-channels.repair-endpoint` selects the same Slack fields plus
`botTokenExpiresAt` and `repairBotTokenEnv`. The original bot token must still
successfully identify the designated bot during historical fixture qualification
and naturally expire within the bounded two-to-eight-minute window. The separate
repair token must independently identify that same bot/app/workspace and remain
valid. No token is revoked, rotated, exchanged or minted by this fixture. Initial
historical qualification uses the actual public board configure route, not the
normal UI under evaluation. The SDK generation is invalidated by an actual
pause/resume while the old credential still works. Its next genuine signed
intake must fail after the official provider returns `token_expired`, without a
setup native run; any other starting condition blocks qualification.

The tested human repair uses the actual protected Reconnect form, the selected
human's Slack App Settings Request URL retry/re-entry, fresh provider-signed
verification, normal existing-person wizard continuation and Done. A later new
same-thread native reply is still mandatory. Expiry timing is credential-fixture
metadata, not an expected model answer. Missing qualified tokens/session/app
management authority are prerequisites, never positive coverage. The case is
bounded at 25 minutes and performs no external operations during offline
calibration. A visible real form rejection is retained as a nonpassing product
observation; the harness does not pre-reject an actual rotating-token format or
bypass that form. Slack's documented rotating access-token format is described at
https://docs.slack.dev/authentication/using-token-rotation/.
