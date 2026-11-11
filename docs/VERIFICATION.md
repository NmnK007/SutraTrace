# Verification results

Verified on the current Windows checkout using Python 3.12 and Node.js 24.

| Check | Result |
|---|---|
| Complete pytest suite | **30 passed**, 19.13 seconds |
| TypeScript + Vite production build | Passed |
| Prettier check | Passed |
| Browser graph navigation | Account node opened its 12 source observations |
| Browser copilot search | Transfer question returned five cited source records |
| Citation navigation | Opened raw network record, original timestamp, UTC timestamp, artifact ID, and locator |
| Browser custody verification | Internally consistent ledger displayed |
| Browser JSON download | Download succeeded; independently parsed and checked |
| Downloaded report | Six artifacts, 16 source records, all current hashes verified, valid ledger, report-export audit event |
| Mobile breakpoint | Navigation and overview checked at a 390 x 844 viewport override; no horizontal overflow; override reset |
| Browser console | No error entries reported in this test session |

Earlier browser checks also covered evidence inspection, byte verification, and network-source timeline filtering. Automated tests cover finding review persistence, original download, custody transfers, and report separation of accepted versus other findings.

## Automated coverage

- Intake hashing, identical-content intake, one-byte tampering, missing originals, and blocked export of changed originals.
- Case-scoped retrieval and artifact access; cross-case requests rejected.
- UTC conversion including distinct DST offsets, unresolved naive timestamps, and malformed timestamps.
- Repeatable synthetic correlation rules, source-located graph edges, and review persistence.
- Changed ledger entries and mismatched external checkpoints.
- Malformed JSON preservation, multiline CSV locators, EML extraction, image signatures, and benign missing EXIF.
- Prompt-injection text remains source data in deterministic search mode.
- Local-model adapter with mocked valid output, foreign citations, malformed JSON, and unavailable runtime; checks audit metadata and source-search fallback.
- Host/origin/session protection, safe filenames, and review reasoning requirements.
- Collector manifest byte checks, path escape rejection, and explicit skipped-acquisition status.

One non-failing deprecation warning comes from Starlette's test client referencing an AnyIO compatibility alias.

## What these results do not establish

The model adapter tests use a mocked Ollama transport. No downloaded model was configured, so real generation quality, latency, resource use, and model-level prompt-injection resistance were not evaluated. Citation and quote checks alone cannot prove a model's interpretation is correct.

This is not a production penetration test, forensic accreditation, large-evidence performance benchmark, or proof of legal admissibility. Parser subprocesses are not OS sandboxes. No native PCAP/EVTX analysis, OCR, trained anomaly model, or universal media-authenticity detector is claimed.

## Reproduce

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
npm --prefix frontend run build
npm --prefix frontend run format:check
```

In a restricted environment with an inaccessible system temp directory, use a fresh directory under the workspace, such as `--basetemp=tmp/test-verification-01`. Pytest owns its temporary test directory; do not point this option at evidence or another valuable directory. Tests use isolated fixtures, not the live case store.

Follow [TESTING.md](TESTING.md) for the investigator walkthrough.
