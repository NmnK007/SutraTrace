# SutraTrace

**Every trace connects.** A local-first digital forensics investigation workbench: preserve evidence, reconstruct a timeline, explore relationships, review explainable findings, and export a source-linked investigation record.

SutraTrace uses **Approach 2 (timeline and cross-source correlation)** as its core, **Approach 1 (evidence vault and custody)** as its foundation, and combines graph exploration, evidence-grounded AI, file triage, and explainable anomaly rules. See [the product decisions](docs/PRODUCT_DECISIONS.md).

## Run the completed local build

On the development computer, double-click `Start-SutraTrace.cmd`, or run:

```powershell
cd C:\SutraTrace
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8765
```

Open **http://127.0.0.1:8765**. Keep the terminal open. If the port is already in use, open the existing app instead of starting another copy.

Choose **Explore the demo case** for fictional training evidence, or **Create your first case** to start empty. Demo loading is idempotent. No real host collection is performed automatically.

## Install on another computer

Requires **Python 3.11 or newer**, Node.js 22 or newer, and npm. The development build was tested with Python 3.12 and Node.js 24. Windows commands:

```powershell
git clone https://github.com/NmnK007/SutraTrace.git
cd SutraTrace
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm --prefix frontend ci
npm --prefix frontend run build
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8765
```

Use an installed Python 3.11+ executable instead of `py -3.12` if necessary. On macOS/Linux, create the environment with `python3 -m venv .venv` and substitute `.venv/bin/python` for `.venv\Scripts\python.exe`. The runtime does not depend on the reference repositories or attachments.

## Working capabilities

| Area | Implemented behavior |
|---|---|
| Cases | Separate case records, investigator, purpose, and authorized scope |
| Evidence vault | Local originals, bounded uploads, SHA-256 intake and read-back check, independent duplicate intake records, re-verification, guarded original export |
| Parsing | CSV, JSON/JSONL, EML, plain text; bounded PDF text/metadata and image metadata; unsupported formats preserved without invented parsing |
| Timeline | Explicit-offset conversion to UTC, raw timestamps retained, source/record pointers, filters, unknown-time labels |
| Graph | Interactive event/entity links; each edge names the exact source and match basis; zoom, pan, source/search filtering |
| Triage | Failed logins followed by success, staging then transfer, transfer then deletion, large transfer, duplicate bytes, extension/signature disagreement |
| Review | Accept, reject, or follow up with required reasoning; decisions survive repeat triage |
| Copilot | Case-scoped SQLite FTS retrieval; optional local Ollama generation with citation ID and source-quote validation |
| Custody | Hash-linked handling history, actor/purpose records, transfer assertions, chain verification and optional external-head comparison |
| Reports | Markdown and complete JSON records with fresh hash checks, source IDs, raw observations, review status, custody history, methods, and limitations |
| Collector bridge | Validate and import your existing Windows collector exports without executing collection commands |

No external fonts, CDNs, analytics, or cloud model APIs are used by the shipped frontend. Dependencies and models require downloads during setup; evidence processing is local.

## Local AI

Evidence search works without an LLM and is explicitly labeled **Evidence search**. Generative AI requires a separately installed Ollama runtime and a locally downloaded model. No model was installed during development, so actual model inference has **not** been end-to-end validated on this machine.

1. Install [Ollama](https://ollama.com/download) and download a model suitable for your hardware.
2. Keep Ollama serving locally at `127.0.0.1:11434`.
3. In the terminal used to start SutraTrace, set the exact name of your downloaded model:

```powershell
$env:SUTRATRACE_MODEL = 'your-installed-model-name'
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8765
```

4. Enable **Use local AI** in the copilot. The adapter uses the [Ollama chat API](https://docs.ollama.com/api/chat) with non-streaming JSON output, no tools, and case-scoped records. Unsupported citations or quotes cause fallback to source search. Citation validity is not a proof of interpretive correctness; investigators must review generated claims.

## Evidence input contract

Structured CSV/JSON records use these canonical fields (common aliases are also supported):

```json
{
  "timestamp": "2026-10-16T21:19:00+05:30",
  "event_type": "transfer",
  "actor": "a.sharma",
  "device": "WS-07",
  "destination": "fileshare.example",
  "object": "D:/Exports/Project-Orion.zip",
  "bytes": 487587840,
  "description": "Outbound transfer recorded"
}
```

Use event types such as `login_failed`, `login_success`, `archive_created`, `transfer`, and `file_deleted` for the shipped rules. Arbitrary event types are retained but not automatically mapped to these rules. A CSV locator is a **logical data-record index**, excluding the header, not a physical line number; quoted multiline cells can span lines.

Missing/naive timestamps remain unresolved. The system does not guess time zones or clock skew. JSON objects, arrays, and `events`/`records` arrays are accepted. Source timestamps are assertions, not authenticated time.

Limits: **20 MB per file**, **10,000 structured/text records**, **50 PDF pages**, **20-second parser process timeout**. Truncation and failures are recorded. Archives are never expanded. PCAP, EVTX, disk images, memory images, and Office files can be preserved but require upstream CSV/JSON exports for investigation in this version. There is no OCR or deepfake classifier.

## Import the team's collector output

Keep the existing collector separate from the application. After an authorized acquisition, copy its output folder containing `manifest.csv` to the examination machine.

```powershell
# Validate each successful artifact against the collector manifest; does not import.
.\.venv\Scripts\python.exe -m backend.import_collection 'D:\AuthorizedCollection'

# Copy the CASE-... ID from the local UI. The local server must be running.
.\.venv\Scripts\python.exe -m backend.import_collection 'D:\AuthorizedCollection' --case CASE-your-id --collector 'Examiner name' --import
```

The bridge validates all candidates before beginning. It rejects missing hashes, byte mismatches, paths outside the source folder, and oversized artifacts. It checks the bytes again immediately before sending them to the loopback server. Failed collector records are reported as skipped. Commands recorded in the manifest are treated only as provenance data. Imports are individual transactions; if a later upload fails, earlier successful intake records remain.

## Development and verification

```powershell
# Production frontend build, including TypeScript checks
npm --prefix frontend run build

# Frontend formatting check
npm --prefix frontend run format:check

# Isolated forensic tests (use a new temporary directory for each Windows run)
.\.venv\Scripts\python.exe -m pytest -q --basetemp=tmp/test-run-unique

# Frontend development (run the backend in another terminal)
npm --prefix frontend run dev
```

The Vite server proxies `/api` to the local backend. Production uses FastAPI to serve the compiled frontend on the same origin. Restart the backend after building the frontend for the first time. See [verification notes](docs/VERIFICATION.md).

## Storage and security boundary

Case data lives in `data/sutratrace.sqlite3`; original bytes live in `data/originals/EV-...`. Set `SUTRATRACE_DATA` before startup to use another local directory. Stop the server before copying the complete data directory for backup. Backups contain sensitive case material and must be protected independently.

This is a **single-investigator local prototype**, not a multi-user or accredited forensic suite. Bind it to `127.0.0.1`; do not expose it to a LAN or the public internet. Local session cookies, host/origin checks, and mutation headers reduce browser-based cross-origin access. Anyone with sufficient access to the same machine remains inside the trust boundary. Investigator/custodian names are assertions, not authenticated identities.

Originals are read-only through the application and marked read-only at the filesystem level. This is not WORM storage. The database is not encrypted by this application. Parser subprocesses have a timeout but are **not an OS security sandbox** or malware scanner. A privileged local user can rewrite both a ledger and its head; keep independent checkpoints for stronger detection. Hash equality does not establish pre-intake authenticity, authorship, intent, or legal admissibility.

## Repository safety

`.gitignore` excludes originals, the case database, virtual environments, dependencies, build output, downloaded reference repositories, and temporary files. Only synthetic samples should be committed. Do not add real evidence, model weights, credentials, or `.env` files. Push instructions are in [GITHUB.md](docs/GITHUB.md).

## Design and research

Original SutraTrace implementation informed by the team's supplied research and six approaches. Visual inspiration: [SOCius by Pixelean](https://www.behance.net/gallery/236367227/SOCius-Cyber-Security-SaaS-Dashboard-Web-App) for charcoal/lime dashboard hierarchy, and [PHOTON](https://www.behance.net/gallery/243290839/PHOTON-Secure-Messenger) for restrained animated connection lines. No third-party design assets are bundled. Motion respects reduced-motion preferences.
