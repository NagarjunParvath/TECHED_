# AI Intake — Recommended Workflow & Automated Responses

Inputs reviewed:
- `FABRIC_AI_INTAKE_PORTAL_GUIDE.md` (latest Git version, branch `claude/aiintakeportal-setup-ohy8ee`)
- `AI_INTAKE_RESPONSE_TEMPLATES.docx` (Matthew Walz, 2026-10-06) — 5 Premium Tool templates

---

## 1. Key finding: two request types, one portal

| | **A. Premium Tool License** (Matt's templates) | **B. AI Solution Build** (Git design) |
|---|---|---|
| What's asked for | A seat on an existing product (e.g. Copilot Premium) | Something built: agent, Document AI, automation, prediction model… |
| Decision driver | License budget / procurement cycle, overlap with M365 Copilot | Business value, ROI, data risk, CoE capacity |
| Outcomes | Reject · Defer to queue · Approve now · Approve next cycle | Approve → build → UAT → deliver, or Reject / On Hold |
| Ends at | IT Help ticket fulfilled | Solution live in catalog |

The Git state machine (`Submitted → Under Review → Approved → In Development → UAT → Completed`)
**cannot express** "Deferred to prioritization queue" or "Approved for 2027". Forcing license
requests through it will either lose those states or overload "On Hold". Add a `requestType`
field and give each type its own transition graph — still owned by the **one** state-machine module.

---

## 2. Recommended workflows

### A. Premium Tool License

```
Submitted ──auto──▶ Under Review ──▶ Needs Info ──(requester replies)──▶ Under Review
                         │
                         ├──▶ Rejected                                   (terminal)
                         ├──▶ Deferred (Prioritization Queue) ──cycle planning──▶ Approved – Next Cycle | Rejected
                         ├──▶ Approved – Immediate ──▶ Provisioning ──▶ Fulfilled
                         └──▶ Approved – Next Cycle ──▶ Awaiting Procurement ──▶ Provisioning ──▶ Fulfilled
```

- **SLA:** Submitted promises a reply in **7 business days**, so the system has to track it.
  Day 5: nudge the reviewer. Day 7: escalate to the CoE lead. Internal only, the requester gets nothing.
- **Deferred is reviewed in bulk.** Once per procurement-cycle planning meeting, every queued request
  moves to *Approved – Next Cycle* or *Rejected*. Nothing stays deferred indefinitely.

### B. AI Solution Build

```
Submitted ──▶ Under Review ⇄ Needs Info
                  ├──▶ Rejected
                  ├──▶ On Hold ──▶ Under Review
                  └──▶ Approved ──▶ In Development ──▶ UAT ──▶ Completed  (creates AiSolution catalog row)
```
`containsPii = true` or restricted data sources → mandatory **Security/Legal review** step
before Approved. This is the governance gate from the Git design; enforce it in the
state-machine module, not the UI.

---

## 3. What to automate vs. keep human

| Step | Automate? | Notes |
|---|---|---|
| Acknowledgement on submit | **Fully automatic** | Send instantly; include request key + due date |
| SLA nudges / escalation | **Fully automatic** | Internal to reviewers only |
| Triage suggestion | **Suggest only** | Rules can *pre-select* a decision + reason (e.g. capability overlaps M365 Copilot → suggest Reject/OVERLAP). Never auto-reject. |
| Decision (reject / defer / approve) | **Human decides, system sends** | Reviewer picks decision + reason code → sees rendered email preview → confirms. Zero free-typing for standard cases. |
| IT Help ticket | **Fully automatic** on Approved – Immediate / Provisioning | Create the ticket **first**, then send the email with the ticket number. Never promise a ticket that doesn't exist yet. |
| Status updates for builds (In Development, UAT, Completed) | **Fully automatic** | Triggered by the transition |
| AI assistant drafting replies | **Later, server-side only** | Fabric UDF / Data Agent; no keys in client (rule #5) |

### How sending works (fits the Fabric "no triggers" constraint)

Rule #2 already requires every status change to write a `RequestTransition` row in the same
mutation. Extend that: **the same mutation also writes a `NotificationOutbox` row**
(templateKey, requestId, recipient, rendered subject/body, status=`pending`).

A scheduled sender (Power Automate flow or Fabric User Data Function, using Outlook/Graph,
**not** the browser) picks up `pending` rows, sends them, and marks them `sent` or `failed`.
What this gets you:
- No lost emails if the sender is down, because rows stay pending and get retried.
- Each email is sent once (idempotent), and you keep an audit trail of exactly what went to whom.
- The email credentials live server-side only, which matches the public-URL static hosting rule.

### Data model additions

- `AiRequest.requestType`: `PremiumTool | AiSolution`
- `AiRequest.toolName`, `procurementCycle`, `decisionReasonCode`, `itTicketId` (optional fields for license requests)
- `ResponseTemplate`: key, requestType, toStatus, reasonCode, subject, body, version, active.
  The governance team can edit wording **without a redeploy**, and each `NotificationOutbox`
  row records the template version it used.
- `NotificationOutbox`: id, requestId, templateKey, templateVersion, to, subject, body, status, attempts, sentAt.

---

## 4. Review of Matt's templates. Fix these before automating

1. **Hardcoded "Copilot Premium" and "2027".** The form says "premium AI tool", but the Deferred
   and Approved-Immediately emails name Copilot Premium. Replace with `{{toolName}}` and
   `{{procurementCycle}}`, or the emails will be wrong the first time someone asks for a different
   tool and every January.
2. **Only one rejection reason.** The Rejection email says *"M365 Copilot already offers the
   features you need"*. Requests rejected for data-risk, security or business-case reasons will
   get a false explanation. Use reason codes (below).
3. **Policy statement in the Deferred email.** *"Personal AI accounts are permitted for the time
   being if no restricted data are entered"* is a data-governance policy going out automatically.
   It needs Security/Legal sign-off, and it cuts against the `containsPii` gate. Recommendation:
   link to the current AI usage policy in the AI Hub instead of restating it.
4. **No "Needs more information" template**, even though the Submitted email promises one.
5. **Both approval emails use the same subject line.** Requesters, and anyone searching email, can't tell them apart.
6. **No request key in subjects.** Prefix `[AIREQ-1256]` so replies thread together and can be
   matched back to the request.
7. **"Ticket will be created".** Once automated, say *"IT Help ticket {{itTicketId}} has been created"*.
8. **No templates for AI Solution requests**: acknowledgement, approved, in development, UAT, delivered, on hold.
9. Minor: inconsistent "Response:" labels, and the same sign-off on every email. Fine, but put
   `{{aiHubLink}}` and a contact address in the footer.

### Rejection reason codes (proposed)

| Code | Reason text inserted |
|---|---|
| `OVERLAP_M365` | Your current tools, like Microsoft 365 Copilot, already offer the features you need. |
| `DATA_RISK` | The use case involves data that can't be processed in this tool under our current AI policy. |
| `NO_BUSINESS_CASE` | We couldn't identify enough business value to justify a license at this time. |
| `VENDOR_NOT_APPROVED` | This tool hasn't passed our security and vendor review. |

---

## 5. Revised templates (parameterized)

Variables: `{{firstName}} {{requestKey}} {{toolName}} {{procurementCycle}} {{decisionDueDate}}
{{reasonText}} {{itTicketId}} {{aiHubLink}} {{policyLink}}`

Common footer:
> Thanks for your interest in expanding AI at Link Snacks!
> — The Central AI Team · [AI Hub]({{aiHubLink}})

**PT-SUBMITTED.** Subject: `[{{requestKey}}] AI Premium Tool Request Received`
> Hi {{firstName}}, thank you for submitting a request for {{toolName}}. Not every request can be
> fulfilled. If we move forward, access will normally be granted in our {{procurementCycle}} license
> procurement cycle unless we tell you otherwise. You'll hear from us by **{{decisionDueDate}}** with
> a decision or a request for more information.

**PT-NEEDS-INFO** *(new).* Subject: `[{{requestKey}}] More Information Needed`
> Hi {{firstName}}, to complete our review of your {{toolName}} request we need: {{infoRequested}}.
> Please reply in the AI Intake Portal. Your request is paused until we hear back.

**PT-REJECTED.** Subject: `[{{requestKey}}] AI Premium Tool Request Not Approved`
> Hi {{firstName}}, thank you for your {{toolName}} request. We vet every request against a standard
> set of criteria, and unfortunately this one doesn't meet the requirements for premium tool access:
> {{reasonText}} Check the AI Hub for Copilot training to get started, and reach out with any questions.

**PT-DEFERRED.** Subject: `[{{requestKey}}] AI Premium Tool Request Added to {{procurementCycle}} Queue`
> Hi {{firstName}}, we've added your {{toolName}} request to our {{procurementCycle}} prioritization
> queue. We procure a limited number of licenses each cycle, and your place in the queue determines
> whether and when we can get you one. In the meantime, the AI Hub has training to get the most out
> of Microsoft 365 Copilot. For what you can use other AI tools for, see our [AI usage policy]({{policyLink}}).

**PT-APPROVED-NOW.** Subject: `[{{requestKey}}] AI Premium Tool Request Approved: Access Being Set Up`
> Great news, {{firstName}}! Your request for {{toolName}} has been approved. IT Help ticket
> **{{itTicketId}}** has been created to grant your access.

**PT-APPROVED-NEXT-CYCLE.** Subject: `[{{requestKey}}] AI Premium Tool Request Approved for {{procurementCycle}}`
> Great news, {{firstName}}! Your request for {{toolName}} has been approved. You'll be included in
> our {{procurementCycle}} license batch. Once the license is procured, we'll create an IT Help ticket
> and send you the number.

**PT-FULFILLED** *(new, optional).* Subject: `[{{requestKey}}] Your {{toolName}} Access Is Ready`
> Hi {{firstName}}, your {{toolName}} access is now active. Start with the training in the AI Hub.

AI Solution templates (`AS-SUBMITTED`, `AS-NEEDS-INFO`, `AS-APPROVED`, `AS-IN-DEVELOPMENT`,
`AS-UAT`, `AS-COMPLETED`, `AS-ON-HOLD`, `AS-REJECTED`) follow the same pattern. Matt or the CoE
should write these. None exist yet.

---

## 6. Decisions needed

1. Does Matt agree that license requests and build requests are separate `requestType`s in one portal?
2. Who signs off on the personal-AI-account policy wording? (Security/Legal)
3. Which email sender: Power Automate (fastest to stand up) or a Fabric User Data Function (keeps it all in Fabric)?
4. Which IT Help system receives tickets (ServiceNow, Jira SM, …), and does it have an API we can call?
5. Does a decision email always need a reviewer preview, or can approved-immediate go out without one after a trial period?
