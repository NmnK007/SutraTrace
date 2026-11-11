# Product decisions

## Chosen architecture

Choose **Approach 2: unified timeline and cross-source correlation** as the investigative spine. It directly connects the problem statement's analysis, correlation, pattern detection, and reconstruction requirements, and gives an investigator a clear path from a lead to its underlying record.

| Supplied approach | Role in SutraTrace | Why |
|---|---|---|
| 1. Evidence vault and custody | Trust foundation | Preserves bytes, intake context, hashes, and handling history before analysis |
| 2. Timeline and correlation | Core workflow | Turns fragmented records into an inspectable sequence |
| 3. Graph investigation | Relationship exploration | Lets investigators pivot through exact account/device/IP/file attributes, with sourced edges |
| 4. Grounded AI copilot | Optional interpretation layer | Retrieves only this case's records and validates citation IDs and quotes |
| 5. Manipulation triage | File review signals | Highlights signature/extension mismatches and exact duplicates without claiming authenticity |
| 6. Anomaly triage | Explainable review prioritization | Uses visible rules and thresholds; avoids uncalibrated probabilities from tiny datasets |

The main differentiator is **inspectable traceability**: a finding points to an event, a source-record locator, an original artifact, its intake hash, and its custody history. Accepting/rejecting a finding updates the report and records the review decision.

## Lessons from the submissions

The team's supplied evidence-vault-and-logger PDF distinguishes an implemented collection/hashing foundation from proposed parsing/correlation. The selected def build() submission presents a more complete intake-to-reconstruction workflow, local AI, explicit review, and a governance layer. That is a useful product-presentation lesson; the documents do not establish the judges' reasons or prove that every proposed competitor capability was implemented.

SutraTrace adopts a connected workflow and local model option while retaining the team's evidence-first foundation. It does not copy competitor code, invent an OKF integration, or describe proposals as shipped capabilities.

## Existing team repositories inspected

- https://github.com/Namz27/Sutram2026 at `57a3c3c8e0426f1effd48b72d65a65897a4fd4e1`
- https://github.com/chinmaykhare985/Sutram2026-main at `941c91b20be4cd6005f50bfe313db46238f475ff`

The inspected code has SHA-256 upload/verify/download flows, a Windows collector, and a Gemini analysis path. SutraTrace preserves those design ideas through a new case-scoped backend and a manifest-compatible import bridge. The original repositories remain unchanged under the ignored `references/` directory. Their bundled host captures are not imported into the new app or included in the demo.

## Deliberate boundaries

- Manual intake and verified collector-export import are implemented; automatic live acquisition is not performed.
- Rule-based anomalies are implemented; no trained statistical classifier is represented as validated AI.
- Local Ollama integration is implemented, but a model must be installed/configured separately. Search mode is explicitly non-generative.
- Hash checks address consistency after intake. No feature claims to authenticate a human or certify legal admissibility.
- Independent user authentication, RBAC, encrypted storage, worker sandboxes, background job queues, external signed checkpoints, native PCAP/EVTX adapters, OCR, and specialist media models are future hardening/extensions, not hidden behind nonfunctional UI controls.

## Demonstration path

1. Load Operation Silent Thread: six synthetic files, five timed source categories, and collection notes.
2. Inspect authentication.csv, its SHA-256, and collection metadata.
3. Open the timeline and filter to network events; inspect the exact transfer record.
4. Open the graph and select a.sharma or WS-07 to pivot through source observations.
5. Review the archive-staging/transfer lead. Read its limitation: correlation does not prove payload or intent.
6. Ask the copilot for transfer evidence and follow its source citations.
7. Accept a lead with reasoning; verify the custody chain; export Markdown and JSON reports.

The demonstration makes claims that can be inspected and tested rather than presenting unsupported detection accuracy.
