from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware
from .store import Store, canonical, now, uid
from . import copilot, demo, engine

ROOT = Path(__file__).resolve().parent.parent
MAX_FILE = 20 * 1024 * 1024
SOURCES = ('authentication','endpoint','network','browser','cloud','email','document','media','other')


class CaseInput(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    owner: str = Field(min_length=1, max_length=100)
    description: str = Field(default='', max_length=4000)
    scope: str = Field(min_length=1, max_length=4000)


class ReviewInput(BaseModel):
    status: Literal['accepted', 'rejected', 'needs_followup', 'unreviewed']
    note: str = Field(min_length=1, max_length=4000)


class AskInput(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    use_model: bool = False


class TransferInput(BaseModel):
    custodian: str = Field(min_length=1, max_length=100)
    purpose: str = Field(min_length=1, max_length=2000)


class CheckpointInput(BaseModel):
    checkpoint: str | None = Field(default=None, pattern='^[0-9a-f]{64}$')


def create_app(data_root=None):
    store = Store(data_root or os.environ.get('SUTRATRACE_DATA', str(ROOT/'data')))
    app = FastAPI(title='SutraTrace', version='0.1.0', docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store = store
    token = secrets.token_urlsafe(32)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1','localhost','testserver'])

    @app.middleware('http')
    async def local_boundary(request: Request, call_next):
        origin = request.headers.get('origin')
        allowed = {'http://127.0.0.1:8765', 'http://localhost:8765', 'http://127.0.0.1:5173', 'http://localhost:5173', 'http://testserver'}
        if request.url.path.startswith('/api/'):
            if origin and origin not in allowed or request.headers.get('sec-fetch-site') == 'cross-site':
                return JSONResponse({'detail':'Cross-origin access denied.'}, status_code=403)
            if request.url.path != '/api/session' and not secrets.compare_digest(request.cookies.get('sutratrace_session',''), token):
                return JSONResponse({'detail':'Open the local workspace to establish a session.'}, status_code=401)
            if request.method not in ('GET','HEAD','OPTIONS') and request.headers.get('x-sutratrace') != 'local-workspace':
                return JSONResponse({'detail':'Workspace request header required.'}, status_code=403)
            try:
                length = int(request.headers.get('content-length', '0'))
            except ValueError:
                return JSONResponse({'detail':'Invalid request length.'}, status_code=400)
            if length > MAX_FILE + 1024*1024:
                return JSONResponse({'detail':'Maximum upload size is 20 MB.'}, status_code=413)
            if request.method == 'POST' and request.url.path.endswith('/evidence') and not request.headers.get('content-length'):
                return JSONResponse({'detail':'Content-Length required for bounded uploads.'}, status_code=411)
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
        return response

    def case(id):
        value = store.get('cases', id)
        if not value:
            raise HTTPException(404, 'Case not found.')
        return value

    def item(case_id, evidence_id):
        case(case_id)
        value = store.get('evidence', evidence_id, case_id)
        if not value:
            raise HTTPException(404, 'Evidence not found in this case.')
        return value

    def run_triage(case_id, actor):
        with store.tx() as db:
            results = engine.findings(case_id, store.all('events',case_id,db),store.all('evidence',case_id,db))
            existing = {f['id']:f for f in store.all('findings',case_id,db)}
            for finding in results:
                if finding['id'] in existing:
                    for k in ('status','review_note','reviewed_at','reviewer'):
                        if k in existing[finding['id']]:
                            finding[k] = existing[finding['id']][k]
                store.save('findings',finding,db)
            store.audit(db,case_id,'triage_completed',actor,{'rule_version':engine.RULE_VERSION,'finding_count':len(results)})
        return results

    def ingest(case_id, filename, data, source, collected_by, acquisition, description, notes, actor):
        case(case_id)
        if len(data) > MAX_FILE:
            raise HTTPException(413, 'Maximum upload size is 20 MB.')
        evidence_id = uid('EV')
        filename = filename.replace('\\','/').split('/')[-1][:240] or 'unnamed'
        path = store.vault / evidence_id
        with path.open('xb') as out:
            out.write(data)
        initial = hashlib.sha256(data).hexdigest()
        stored_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        if stored_hash != initial:
            raise HTTPException(500, 'Storage verification failed.')
        # No application operation overwrites originals. Filesystem administrators remain trusted.
        path.chmod(0o444)
        try:
            process = subprocess.run([sys.executable,'-m','backend.parsers',str(path),filename,source],
                cwd=ROOT, capture_output=True, timeout=20, creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            parsed = json.loads(process.stdout) if process.returncode == 0 else None
            if not parsed:
                raise ValueError('Parser process failed.')
        except (subprocess.TimeoutExpired, ValueError, OSError):
            parsed = {'events':[], 'metadata':{}, 'warnings':['Parser failed or exceeded the 20-second time limit. Original retained.'], 'signals':[], 'status':'parse_failed'}
        evidence = {'id': evidence_id, 'case_id': case_id, 'filename':filename,'source_type':source,
                    'size':len(data),'sha256':initial,'observed_sha256':stored_hash,'verification_status':'verified','verified_at':now(),
                    'received_at':now(),'received_by':actor,'collected_by':collected_by,'acquired_at':acquisition,
                    'source_description':description,'notes':notes,'custodian':collected_by,
                    'parser_status':parsed['status'],'metadata':parsed['metadata'],'warnings':parsed['warnings'],
                    'signals':parsed['signals'],'event_count':len(parsed['events'])}
        with store.tx() as db:
            store.save('evidence', evidence, db)
            for event in parsed['events']:
                event.update({'id':uid('EVT'),'case_id':case_id,'evidence_id':evidence_id,'filename':filename})
                store.save('events',event,db)
                db.execute('INSERT INTO search(event_id,case_id,text) VALUES (?,?,?)',(event['id'],case_id,canonical(event['raw'])))
            store.audit(db,case_id,'evidence_received',actor,{'filename':filename,'sha256':initial,'size':len(data),'source':description,'collector':collected_by,'acquired_at':acquisition,'notes':notes},evidence_id)
            store.audit(db,case_id,'evidence_parsed',actor,{'parser':parsed['metadata'].get('parser_version'),'status':parsed['status'],'events':len(parsed['events']),'warnings':parsed['warnings']},evidence_id)
        return evidence

    def verify(case_id, evidence_id, actor):
        evidence = item(case_id,evidence_id)
        path = store.vault/evidence_id
        observed = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
        evidence.update({'observed_sha256':observed,'verification_status':'missing' if observed is None else 'verified' if observed==evidence['sha256'] else 'mismatch','verified_at':now()})
        with store.tx() as db:
            store.save('evidence',evidence,db)
            store.audit(db,case_id,'integrity_checked',actor,{'expected':evidence['sha256'],'observed':observed,'result':evidence['verification_status']},evidence_id)
        return evidence

    @app.get('/api/session')
    def session():
        response = JSONResponse({'local':True,'mode':'single_investigator','version':'0.1.0','model':os.environ.get('SUTRATRACE_MODEL') or None})
        response.set_cookie('sutratrace_session',token,httponly=True,samesite='strict')
        return response

    @app.get('/api/cases')
    def list_cases():
        return store.all('cases')

    @app.post('/api/cases')
    def create_case(body:CaseInput):
        if not body.title.strip() or not body.owner.strip() or not body.scope.strip():
            raise HTTPException(422,'Title, investigator, and scope must not be blank.')
        value = {**body.model_dump(),'id':uid('CASE'),'created_at':now(),'status':'open','synthetic':False}
        with store.tx() as db:
            store.save('cases',value,db)
            store.audit(db,value['id'],'case_created',body.owner,{'scope':body.scope})
        return value

    @app.post('/api/demo')
    def load_demo():
        with store.lock:
            found = next((c for c in store.all('cases') if c.get('synthetic')),None)
            if found:
                return found
            value = create_case(CaseInput(title='Operation Silent Thread',owner='Demo investigator',description='Possible movement of Project Orion data from workstation WS-07. Follow the traces across authentication, endpoint, browser, network, and cloud records.',scope='Synthetic training case. Fictional records only; no real persons or infrastructure.'))
            value['synthetic'] = True
            for filename, source, data in demo.samples():
                ingest(value['id'],filename,data,source,'Synthetic fixture generator','2026-10-17T04:00:00Z','Fictional training export','All data is synthetic. Source clocks unverified.',value['owner'])
            with store.tx() as db:
                store.save('cases',value,db)
            run_triage(value['id'],value['owner'])
            return value

    @app.get('/api/cases/{case_id}')
    def overview(case_id:str):
        value = case(case_id)
        evidence = store.all('evidence',case_id)
        events = sorted(store.all('events',case_id),key=lambda e:(e['timestamp_utc'] is None,e['timestamp_utc'] or '',e['id']))
        findings = store.all('findings',case_id)
        findings.sort(key=lambda f:({'high':0,'medium':1,'low':2}[f['severity']],f['id']))
        return {'case':value,'evidence':evidence,'events':events,'findings':findings,'graph':engine.graph(events),
                'audit':store.ledger(case_id),'ledger':store.verify_ledger(case_id),'rules':engine.LIMITS}

    @app.post('/api/cases/{case_id}/evidence')
    def upload(case_id:str,file:UploadFile=File(...),source_type:str=Form('other'),collected_by:str=Form(...),
               acquired_at:str=Form('Unknown'),source_description:str=Form(...),notes:str=Form('')):
        value = case(case_id)
        if source_type not in SOURCES or not collected_by.strip() or not source_description.strip():
            raise HTTPException(422,'Select a supported source and provide collector and source description.')
        if any(len(s)>4000 for s in (collected_by,acquired_at,source_description,notes)):
            raise HTTPException(422,'Collection metadata is too long.')
        data = file.file.read(MAX_FILE+1)
        result = ingest(case_id,file.filename or 'unnamed',data,source_type,collected_by,acquired_at,source_description,notes,value['owner'])
        run_triage(case_id,value['owner'])
        return result

    @app.get('/api/cases/{case_id}/evidence/{evidence_id}')
    def detail(case_id:str,evidence_id:str):
        value = item(case_id,evidence_id)
        actor = case(case_id)['owner']
        with store.tx() as db:
            store.audit(db,case_id,'evidence_inspected',actor,{},evidence_id)
        return value

    @app.post('/api/cases/{case_id}/evidence/{evidence_id}/verify')
    def verify_item(case_id:str,evidence_id:str):
        return verify(case_id,evidence_id,case(case_id)['owner'])

    @app.post('/api/cases/{case_id}/verify')
    def verify_case(case_id:str):
        actor = case(case_id)['owner']
        return [verify(case_id,e['id'],actor) for e in store.all('evidence',case_id)]

    @app.get('/api/cases/{case_id}/evidence/{evidence_id}/download')
    def download(case_id:str,evidence_id:str):
        actor = case(case_id)['owner']
        evidence = verify(case_id,evidence_id,actor)
        if evidence['verification_status'] != 'verified':
            raise HTTPException(409,'Original failed integrity verification; download blocked.')
        with store.tx() as db:
            store.audit(db,case_id,'evidence_exported',actor,{'sha256':evidence['sha256']},evidence_id)
        return FileResponse(store.vault/evidence_id,filename=evidence['filename'],media_type='application/octet-stream')

    @app.post('/api/cases/{case_id}/evidence/{evidence_id}/custody')
    def transfer(case_id:str,evidence_id:str,body:TransferInput):
        evidence = item(case_id,evidence_id)
        actor = case(case_id)['owner']
        if not body.custodian.strip() or not body.purpose.strip():
            raise HTTPException(422,'Custodian and purpose must not be blank.')
        with store.tx() as db:
            store.audit(db,case_id,'custody_transfer_recorded',actor,{'from':evidence['custodian'],'to':body.custodian,'purpose':body.purpose,'assertion':'Recorded by investigator; recipient identity not authenticated.'},evidence_id)
            evidence['custodian'] = body.custodian
            store.save('evidence',evidence,db)
        return evidence

    @app.post('/api/cases/{case_id}/triage')
    def triage(case_id:str):
        return run_triage(case_id,case(case_id)['owner'])

    @app.patch('/api/cases/{case_id}/findings/{finding_id}')
    def review(case_id:str,finding_id:str,body:ReviewInput):
        actor = case(case_id)['owner']
        finding = store.get('findings',finding_id,case_id)
        if not finding:
            raise HTTPException(404,'Finding not found in this case.')
        if not body.note.strip():
            raise HTTPException(422,'Review reasoning is required.')
        finding.update({'status':body.status,'review_note':body.note,'reviewer':actor,'reviewed_at':now()})
        with store.tx() as db:
            store.save('findings',finding,db)
            store.audit(db,case_id,'finding_reviewed',actor,{'finding_id':finding_id,**body.model_dump()})
        return finding

    @app.post('/api/cases/{case_id}/ask')
    def ask(case_id:str,body:AskInput):
        actor = case(case_id)['owner']
        if not body.question.strip():
            raise HTTPException(422,'Question must not be blank.')
        result = copilot.ask(store,case_id,body.question,body.use_model)
        with store.tx() as db:
            store.audit(db,case_id,'copilot_query',actor,result)
        return result

    @app.post('/api/cases/{case_id}/audit/verify')
    def verify_audit(case_id:str,body:CheckpointInput):
        case(case_id)
        return store.verify_ledger(case_id,body.checkpoint)

    @app.get('/api/cases/{case_id}/report')
    def report(case_id:str,format:Literal['json','md']='json'):
        value = case(case_id)
        verified = [verify(case_id,e['id'],value['owner']) for e in store.all('evidence',case_id)]
        with store.tx() as db:
            store.audit(db,case_id,'report_exported',value['owner'],{'format':format,'integrity_failures':[e['id'] for e in verified if e['verification_status']!='verified']})
        snapshot = overview(case_id)
        snapshot['generated_at'] = now()
        snapshot['methodology'] = 'SHA-256 intake and re-verification; bounded CSV/JSON/text/EML/PDF/image extraction; explicit UTC offsets; exact-field graph links; versioned deterministic rules. All source clocks unverified.'
        snapshot['accepted_findings'] = [f for f in snapshot['findings'] if f['status']=='accepted']
        snapshot['limitations'] = ['Single-user local prototype, not an accredited forensic suite.','Hash equality demonstrates byte consistency against intake, not historical authenticity or authorship.','Ledger checkpoint is not externally anchored.','Parser subprocesses have a timeout but are not a security sandbox.','Rules are investigative leads; event absence does not establish absence of activity.','Report includes unreviewed/rejected findings with their statuses; only accepted findings belong to the accepted section.']
        if format=='json':
            content = json.dumps(snapshot,indent=2,ensure_ascii=False)
            media = 'application/json'
        else:
            def plain(value):
                text = str(value).replace('&', '&amp;').replace('<','&lt;').replace('>','&gt;').replace('\n',' ')
                return re.sub(r'([\\`*_{}\[\]()#+.!|])', r'\\\1', text)
            lines = [f'# SutraTrace investigation report',f'Case: {plain(value["title"])} ({case_id})',f'Generated: {snapshot["generated_at"]}',f'Synthetic: {value["synthetic"]}',f'Investigator: {plain(value["owner"])}',f'Scope: {plain(value["scope"])}','\n## Methodology',snapshot['methodology'],'\n## Evidence inventory']
            for e in verified:
                lines += [f'- {e["id"]}: {plain(e["filename"])} | {e["verification_status"]} | SHA-256: {e["sha256"]} | observed: {e["observed_sha256"]}']
            lines += ['\n## Timeline (observations)']
            for e in snapshot['events']:
                lines += [f'- {e["timestamp_utc"] or "Time unknown"} | {e["id"]} | {plain(e["description"])} | {e["evidence_id"]} / {e["source_locator"]} | raw time: {plain(e["timestamp_raw"])}']
            for label, rows in [('Accepted findings',snapshot['accepted_findings']),('Other findings',[f for f in snapshot['findings'] if f['status']!='accepted'])]:
                lines += ['\n## '+label]
                if not rows:
                    lines += ['None.']
                for f in rows:
                    lines += [f'\n### {plain(f["title"])}',f'Status: {f["status"]}; rule: {f["rule"]}',plain(f['explanation']),f'Sources: {", ".join(f["event_ids"]+f["evidence_ids"])}',f'Review: {plain(f["review_note"])}',f'Limitations: {plain(f["limitations"])}']
            lines += ['\n## Custody ledger',f'Head checkpoint: {snapshot["ledger"]["head"]}']
            for a in snapshot['audit']:
                lines += [f'- {a["timestamp"]} | {a["action"]} | {plain(a["actor"])} | {a["evidence_id"] or "case"} | {a["hash"]}']
            lines += ['\n## Limitations']+['- '+x for x in snapshot['limitations']]
            content,media = '\n\n'.join(lines),'text/markdown'
        return Response(content,media_type=media,headers={'Content-Disposition':f'attachment; filename="sutratrace-{case_id}.{format}"'})

    static = ROOT/'frontend'/'dist'
    if static.exists():
        app.mount('/',StaticFiles(directory=static,html=True),name='workspace')
    return app


app = create_app()
