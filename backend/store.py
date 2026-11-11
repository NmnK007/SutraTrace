from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


def now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def uid(prefix):
    return prefix + '-' + uuid.uuid4().hex[:12]


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


class Store:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.vault = self.root / 'originals'
        self.vault.mkdir(parents=True, exist_ok=True)
        self.dbpath = self.root / 'sutratrace.sqlite3'
        self.lock = threading.RLock()
        with self.tx() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), evidence_id TEXT NOT NULL REFERENCES evidence(id), data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS findings(id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL REFERENCES cases(id), payload TEXT NOT NULL, previous_hash TEXT NOT NULL, hash TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS evidence_case ON evidence(case_id);
            CREATE INDEX IF NOT EXISTS events_case ON events(case_id);
            CREATE INDEX IF NOT EXISTS findings_case ON findings(case_id);
            CREATE INDEX IF NOT EXISTS audit_case ON audit(case_id);
            CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(event_id UNINDEXED, case_id UNINDEXED, text);
            ''')

    @contextmanager
    def tx(self):
        with self.lock:
            db = sqlite3.connect(self.dbpath, timeout=30)
            db.row_factory = sqlite3.Row
            db.execute('PRAGMA foreign_keys=ON')
            try:
                db.execute('BEGIN IMMEDIATE')
                yield db
                db.commit()
            except Exception:
                db.rollback()
                raise
            finally:
                db.close()

    def all(self, table, case_id=None, db=None):
        assert table in ('cases', 'evidence', 'events', 'findings')
        if db is None:
            with self.tx() as conn:
                return self.all(table, case_id, conn)
        sql = f'SELECT data FROM {table}' + (' WHERE case_id=?' if case_id else '')
        return [json.loads(r['data']) for r in db.execute(sql, (case_id,) if case_id else ())]

    def get(self, table, id, case_id=None, db=None):
        assert table in ('cases', 'evidence', 'events', 'findings')
        if db is None:
            with self.tx() as conn:
                return self.get(table, id, case_id, conn)
        row = db.execute(f'SELECT data FROM {table} WHERE id=?' + (' AND case_id=?' if case_id else ''), (id, case_id) if case_id else (id,)).fetchone()
        return json.loads(row['data']) if row else None

    def save(self, table, data, db):
        assert table in ('cases', 'evidence', 'events', 'findings')
        keys = ['id'] + (['case_id'] if table != 'cases' else []) + (['evidence_id'] if table == 'events' else [])
        db.execute(f'INSERT INTO {table} ({",".join(keys)},data) VALUES ({",".join("?" for _ in keys)},?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', [data[k] for k in keys] + [canonical(data)])

    def audit(self, db, case_id, action, actor, details=None, evidence_id=None):
        head = db.execute('SELECT hash FROM audit WHERE case_id=? ORDER BY seq DESC LIMIT 1', (case_id,)).fetchone()
        prev = head['hash'] if head else '0' * 64
        payload = {'id': uid('AUD'), 'case_id': case_id, 'action': action, 'actor': actor,
                   'timestamp': now(), 'evidence_id': evidence_id, 'details': details or {}}
        hashvalue = digest({'previous_hash': prev, 'payload': payload})
        db.execute('INSERT INTO audit(case_id,payload,previous_hash,hash) VALUES (?,?,?,?)', (case_id, canonical(payload), prev, hashvalue))
        return hashvalue

    def ledger(self, case_id, db=None):
        if db is None:
            with self.tx() as conn:
                return self.ledger(case_id, conn)
        return [{**json.loads(r['payload']), 'sequence': r['seq'], 'previous_hash': r['previous_hash'], 'hash': r['hash']} for r in db.execute('SELECT * FROM audit WHERE case_id=? ORDER BY seq', (case_id,))]

    def verify_ledger(self, case_id, checkpoint=None):
        rows = self.ledger(case_id)
        prev = '0' * 64
        errors = []
        for row in rows:
            payload = {k: v for k, v in row.items() if k not in ('sequence', 'previous_hash', 'hash')}
            if row['previous_hash'] != prev or row['hash'] != digest({'previous_hash': prev, 'payload': payload}):
                errors.append(row['id'])
            prev = row['hash']
        if checkpoint is not None and checkpoint != prev:
            errors.append('checkpoint_mismatch')
        return {'valid': not errors, 'head': prev, 'entries': len(rows), 'errors': errors,
                'anchored': checkpoint is not None, 'limitation': 'Internal consistency only unless compared with an independently protected checkpoint. A privileged administrator can rewrite a local ledger.'}
