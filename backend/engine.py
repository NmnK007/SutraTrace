"""Deterministic rules and provenance-preserving graph projection."""
from collections import defaultdict
from datetime import datetime
from .store import digest

RULE_VERSION = 'sutratrace-rules/1.0'
LIMITS = {'failed_logins': 3, 'login_window_seconds': 600, 'staging_window_seconds': 1800, 'large_transfer_bytes': 100 * 1024 * 1024}


def seconds(event):
    return datetime.fromisoformat(event['timestamp_utc'].replace('Z', '+00:00')).timestamp()


def findings(case_id, events, evidence):
    result = {}

    def add(rule, title, severity, explanation, supports, limitations, evidence_ids=None):
        ids = sorted(e['id'] for e in supports)
        ev_ids = sorted(set(evidence_ids or [e['evidence_id'] for e in supports]))
        id = 'FND-' + digest([case_id, rule, ids, ev_ids])[:12]
        result[id] = {'id': id, 'case_id': case_id, 'rule': rule, 'rule_version': RULE_VERSION,
                      'title': title, 'severity': severity, 'explanation': explanation, 'event_ids': ids,
                      'evidence_ids': ev_ids, 'limitations': limitations, 'status': 'unreviewed', 'review_note': '',
                      'kind': 'Rule-based lead', 'thresholds': LIMITS}

    groups = defaultdict(list)
    for e in events:
        if e['timestamp_utc'] and e['actor'] and e['device']:
            groups[(e['actor'], e['device'].lower())].append(e)
        if e['event_type'] in ('transfer', 'upload', 'network_transfer') and e['bytes'] >= LIMITS['large_transfer_bytes']:
            add('LARGE_TRANSFER', 'Large outbound transfer', 'medium',
                f"Recorded {e['bytes']:,} bytes; threshold is {LIMITS['large_transfer_bytes']:,} bytes.", [e],
                'A size threshold is not a behavioral baseline. Backup, sync, or approved work may explain the transfer.')
    for rows in groups.values():
        rows.sort(key=lambda x: (x['timestamp_utc'], x['id']))
        for i, e in enumerate(rows):
            before = rows[:i]
            if e['event_type'] in ('login_success', 'signin_success'):
                failed = [r for r in before if r['event_type'] in ('login_failed', 'login_failure') and 0 <= seconds(e)-seconds(r) <= LIMITS['login_window_seconds']]
                if len(failed) >= LIMITS['failed_logins']:
                    add('FAILED_THEN_SUCCESS', 'Repeated failures followed by successful sign-in', 'high',
                        f"{len(failed)} failed logins followed by success for the exact account and device within 10 minutes.", failed + [e],
                        'Mistyped credentials or automation can explain failed logins. Account activity does not identify the human operator.')
            if e['event_type'] in ('transfer', 'upload', 'network_transfer'):
                staged = [r for r in before if r['event_type'] in ('archive_created', 'file_archive') and 0 <= seconds(e)-seconds(r) <= LIMITS['staging_window_seconds']]
                if staged:
                    supports = staged[-1:] + [e]
                    add('STAGE_THEN_TRANSFER', 'Archive staging followed by outbound transfer', 'high',
                        'Archive creation precedes a transfer within 30 minutes on the same account and device. Linking method: exact account/device + bounded time.', supports,
                        'Temporal correlation does not establish transferred payload bytes, source-clock accuracy, destination authorization, or intent.')
            if e['event_type'] in ('file_deleted', 'delete') and e['object']:
                prior = [r for r in before if r['event_type'] in ('transfer','upload','network_transfer') and r['object'] == e['object'] and 0 <= seconds(e)-seconds(r) <= 900]
                if prior:
                    add('TRANSFER_THEN_DELETE', 'File deletion after a recorded transfer', 'high',
                        'The same object path, account, and device appear in a transfer and a deletion within 15 minutes.', prior[-1:]+[e],
                        'Routine cleanup can explain deletion. The logged object path is a source assertion, not independent proof of the payload.')
    hashes = defaultdict(list)
    for item in evidence:
        hashes[item['sha256']].append(item)
        for signal in item.get('signals', []):
            add(signal['rule'], signal['title'], 'medium', signal['detail'], [],
                'This indicator warrants review; it does not prove fraudulent manipulation.', [item['id']])
    for matches in hashes.values():
        if len(matches) > 1:
            add('DUPLICATE_BYTES', 'Identical evidence bytes at intake', 'low',
                f'{len(matches)} intake records share the same SHA-256. Their acquisition records remain separate.', [],
                'Equal bytes do not establish authorship or historical origin.', [x['id'] for x in matches])
    return sorted(result.values(), key=lambda f: ({'high':0,'medium':1,'low':2}[f['severity']], f['id']))


def graph(events):
    nodes, edges = {}, []
    for e in events:
        nodes[e['id']] = {'id': e['id'], 'type': 'event', 'label': e['event_type'], 'event_ids': [e['id']]}
        for field in ('actor', 'device', 'ip', 'destination', 'object', 'sha256'):
            value = e.get(field)
            if not value:
                continue
            canonical = value.lower() if field in ('device', 'sha256') else value
            id = 'ENT-' + digest([field, canonical])[:12]
            if id not in nodes:
                nodes[id] = {'id': id, 'type': field, 'label': value, 'event_ids': []}
            nodes[id]['event_ids'].append(e['id'])
            edges.append({'id': digest([e['id'], id])[:12], 'source': e['id'], 'target': id, 'relationship': f'observed_{field}',
                          'event_id': e['id'], 'evidence_id': e['evidence_id'], 'source_locator': e['source_locator'],
                          'basis': f'Exact {field} field in the cited record' + (' (case normalized)' if field in ('device','sha256') else ''),
                          'timestamp': e['timestamp_utc']})
    return {'nodes': list(nodes.values()), 'edges': edges, 'limitation': 'Shared attributes are observations, not proof that records describe the same person.'}
