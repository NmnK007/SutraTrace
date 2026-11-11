"""Bounded, read-only extraction. Run in a separate, time-limited process."""
from __future__ import annotations

import csv
import io
import json
import sys
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime
from pathlib import Path

VERSION = 'sutratrace-parser/1.0'
MAX_RECORDS = 10000
ALIASES = {
    'timestamp': ['timestamp', 'time', 'datetime', 'date', 'event_time', 'TimeCreated', 'CreationDate'],
    'event_type': ['event_type', 'action', 'event', 'type', 'EventID'],
    'actor': ['actor', 'user', 'username', 'account', 'UserName', 'TargetUserName'],
    'device': ['device', 'host', 'hostname', 'Computer', 'CSName'],
    'ip': ['ip', 'source_ip', 'src_ip', 'IpAddress', 'RemoteAddress'],
    'destination': ['destination', 'dest_ip', 'dst_ip', 'domain', 'url'],
    'object': ['object', 'file', 'path', 'filename', 'TargetFilename', 'ExecutablePath'],
    'bytes': ['bytes', 'size', 'bytes_sent', 'size_bytes'],
    'description': ['description', 'message', 'summary', 'Message', 'CommandLine'],
    'sha256': ['sha256', 'hash', 'file_hash'],
}


def timestamp(value):
    raw = str(value or '').strip()
    if not raw:
        return None, 'missing'
    try:
        dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            return None, 'timezone_unknown'
        return dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z'), 'offset_provided_clock_unverified'
    except (ValueError, OverflowError):
        return None, 'invalid'


def normalize(row, locator, source):
    mapped = {}
    lookup = {str(k).lower(): v for k, v in row.items() if k is not None}
    for name, aliases in ALIASES.items():
        mapped[name] = next((lookup[a.lower()] for a in aliases if lookup.get(a.lower()) not in (None, '')), '')
    utc, quality = timestamp(mapped['timestamp'])
    try:
        size = max(0, int(mapped['bytes'] or 0))
    except (ValueError, TypeError):
        size = 0
    return {
        'timestamp_raw': str(mapped['timestamp']), 'timestamp_utc': utc, 'timestamp_quality': quality,
        'event_type': str(mapped['event_type'] or 'record').lower().replace(' ', '_'),
        **{k: str(mapped[k]) for k in ['actor', 'device', 'ip', 'destination', 'object', 'sha256']},
        'bytes': size, 'description': str(mapped['description'] or mapped['event_type'] or 'Imported record'),
        'source_locator': locator, 'source_type': source, 'raw': row, 'parser_version': VERSION,
    }


def detect(data):
    signatures = [(b'%PDF-', 'pdf'), (b'\x89PNG\r\n\x1a\n', 'png'), (b'\xff\xd8\xff', 'jpeg'),
                  (b'GIF87a', 'gif'), (b'GIF89a', 'gif'), (b'PK\x03\x04', 'zip'), (b'MZ', 'pe'),
                  (b'ElfFile\x00', 'evtx')]
    for sig, kind in signatures:
        if data.startswith(sig):
            return kind
    try:
        data.decode('utf-8-sig')
        return 'text'
    except UnicodeDecodeError:
        return 'binary'


def parse(data, filename, source='other'):
    ext = Path(filename).suffix.lower()
    kind = detect(data)
    metadata = {'detected_format': kind, 'parser_version': VERSION}
    warnings, signals, events = [], [], []
    accepted = {'pdf': ['.pdf'], 'png': ['.png'], 'jpeg': ['.jpg', '.jpeg'], 'gif': ['.gif'],
                'zip': ['.zip', '.docx', '.xlsx', '.pptx'], 'pe': ['.exe', '.dll', '.sys'], 'evtx': ['.evtx']}
    expected = {v: k for k, vals in accepted.items() for v in vals}
    if (kind in accepted and ext not in accepted[kind]) or (ext in expected and kind != expected[ext]):
        signals.append({'rule': 'FORMAT_MISMATCH', 'title': 'File signature and extension disagree',
                        'detail': f'Extension {ext or "(none)"}; detected bytes: {kind}. Renaming or export may explain this.'})
    try:
        if kind == 'text' and ext == '.csv':
            reader = csv.DictReader(io.StringIO(data.decode('utf-8-sig')))
            if not reader.fieldnames or len(reader.fieldnames) > 200:
                raise ValueError('CSV must contain 1–200 named columns.')
            for i, row in enumerate(reader):
                if i >= MAX_RECORDS:
                    warnings.append(f'Only the first {MAX_RECORDS} records were parsed. Original retained in full.')
                    break
                events.append(normalize(row, f'csv:record:{i+1}', source))
        elif kind == 'text' and ext in ('.json', '.jsonl', '.ndjson'):
            if ext == '.json':
                obj = json.loads(data)
                rows = obj if isinstance(obj, list) else obj.get('events', obj.get('records', [obj])) if isinstance(obj, dict) else None
                if not isinstance(rows, list):
                    raise ValueError('JSON must be an object, array, or an object with an events/records array.')
            else:
                rows = [json.loads(line) for line in data.decode('utf-8-sig').splitlines() if line.strip()]
            if len(rows) > MAX_RECORDS:
                warnings.append(f'Only the first {MAX_RECORDS} records were parsed. Original retained in full.')
            for i, row in enumerate(rows[:MAX_RECORDS]):
                if not isinstance(row, dict):
                    warnings.append(f'Record {i+1} is not an object; skipped.')
                    continue
                events.append(normalize(row, f'json:record:{i+1}', source))
        elif ext == '.eml':
            message = BytesParser(policy=policy.default).parsebytes(data)
            body = message.get_body(preferencelist=('plain',))
            raw_date = str(message.get('Date', ''))
            try:
                normalized_date = parsedate_to_datetime(raw_date).isoformat()
            except (ValueError, TypeError):
                normalized_date = raw_date
            row = {'timestamp': normalized_date, 'event_type': 'email', 'actor': str(message.get('From', '')),
                   'destination': str(message.get('To', '')), 'description': str(message.get('Subject', '')),
                   'date_header': raw_date, 'body': body.get_content()[:16000] if body else '',
                   'message_id': str(message.get('Message-ID', ''))}
            events.append(normalize(row, 'eml:message:1', source))
            metadata['attachments'] = [str(a.get_filename()) for a in message.iter_attachments()]
            warnings.append('Attachments are inventoried, not recursively extracted. Sender header is unverified.')
        elif kind == 'pdf':
            from pypdf import PdfReader
            doc = PdfReader(io.BytesIO(data))
            metadata.update({'pages': len(doc.pages), 'properties': {str(k): str(v) for k, v in (doc.metadata or {}).items()}})
            for i, page in enumerate(doc.pages[:50]):
                events.append(normalize({'event_type': 'document_text', 'description': (page.extract_text() or '')[:16000]}, f'pdf:page:{i+1}', source))
            warnings.append('PDF text extraction limited to 50 pages; no OCR or signature authentication.')
        elif kind in ('png', 'jpeg', 'gif'):
            from PIL import Image, ExifTags
            Image.MAX_IMAGE_PIXELS = 25000000
            with Image.open(io.BytesIO(data)) as img:
                metadata.update({'width': img.width, 'height': img.height, 'mode': img.mode,
                                 'exif': {ExifTags.TAGS.get(k, str(k)): str(v)[:2000] for k, v in img.getexif().items()}})
            warnings.append('Metadata is descriptive; missing EXIF is not evidence of manipulation. No deepfake classifier.')
        elif kind == 'text' and ext in ('.txt', '.log', '.md'):
            lines = data.decode('utf-8-sig').splitlines()
            for i, line in enumerate(lines[:MAX_RECORDS]):
                if line.strip():
                    events.append(normalize({'event_type': 'text', 'description': line[:16000]}, f'text:line:{i+1}', source))
            if len(lines) > MAX_RECORDS:
                warnings.append('Text truncated for indexing; original retained in full.')
        else:
            warnings.append('Preserved and hashed only. No parser for this format; use a CSV/JSON export for correlation.')
        uncertain = sum(e['timestamp_quality'] != 'offset_provided_clock_unverified' for e in events)
        if uncertain:
            warnings.append(f'{uncertain} records have missing, invalid, or timezone-unknown timestamps; excluded from time-window rules.')
        return {'events': events, 'metadata': metadata, 'warnings': warnings, 'signals': signals, 'status': 'parsed' if events or kind in ('png','jpeg','gif','pdf') else 'preserved_only'}
    except Exception as error:
        return {'events': [], 'metadata': metadata, 'warnings': [f'Parser failed: {type(error).__name__}: {str(error)[:200]}'], 'signals': signals, 'status': 'parse_failed'}


if __name__ == '__main__':
    result = parse(Path(sys.argv[1]).read_bytes(), sys.argv[2], sys.argv[3])
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=True).encode('utf-8'))
