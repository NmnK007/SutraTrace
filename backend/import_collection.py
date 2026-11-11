"""Import an existing team collector manifest. Never runs collection commands."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

import httpx

MAX_FILE = 20 * 1024 * 1024


def inspect_collection(folder):
    root = Path(folder).resolve(strict=True)
    manifest = root / 'manifest.csv'
    records = []
    with manifest.open(encoding='utf-8-sig', newline='') as stream:
        for row in csv.DictReader(stream):
            if row.get('status') != 'ok' or not row.get('file'):
                records.append({'name':row.get('name','unknown'),'status':'skipped','reason':row.get('status','missing status')})
                continue
            path = (root / row['file']).resolve(strict=True)
            if not path.is_relative_to(root) or not path.is_file():
                raise ValueError('Manifest path escapes the collection folder or is not a file.')
            if path.stat().st_size > MAX_FILE:
                raise ValueError(f'{path.name}: exceeds 20 MB intake limit. Preserve separately and import a bounded export.')
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
            if not row.get('sha256') or actual.lower() != row['sha256'].lower():
                raise ValueError(f'{path.name}: missing or mismatched collection SHA-256; nothing has been imported.')
            name = row.get('name', path.stem).lower()
            source = 'network' if any(x in name for x in ('tcp','dns','network')) else 'authentication' if any(x in name for x in ('logon','auth')) else 'endpoint'
            records.append({'name':path.name,'status':'ready','path':str(path),'sha256':actual,'source':source,
                            'acquired_at':row.get('collected_at_utc') or 'Unknown',
                            'notes':f'Collection command recorded as data only: {row.get("command", "Not supplied")}. {row.get("detail", "")} '})
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder',type=Path,help='Existing collector output containing manifest.csv')
    parser.add_argument('--case',help='Case ID created in the local workspace')
    parser.add_argument('--collector',default='Collector manifest import')
    parser.add_argument('--import',dest='do_import',action='store_true',help='Import verified files; otherwise validate only')
    args = parser.parse_args()
    try:
        records = inspect_collection(args.folder)
        if not args.do_import:
            print(json.dumps([{k:v for k,v in r.items() if k!='path'} for r in records],indent=2))
            return
        if not args.case:
            parser.error('--case is required with --import')
        with httpx.Client(base_url='http://127.0.0.1:8765',trust_env=False,timeout=60,headers={'X-SutraTrace':'local-workspace'}) as client:
            client.get('/api/session').raise_for_status()
            client.get(f'/api/cases/{args.case}').raise_for_status()
            for record in records:
                if record['status'] != 'ready':
                    print(f'Skipped: {record["name"]} ({record["reason"]})')
                    continue
                # Hash the same bounded bytes sent, preventing file replacement between validation and upload.
                with Path(record['path']).open('rb') as stream:
                    content = stream.read(MAX_FILE+1)
                if len(content)>MAX_FILE or hashlib.sha256(content).hexdigest()!=record['sha256']:
                    raise ValueError(f'{record["name"]} changed after validation; import stopped. Earlier successful imports remain in the case.')
                response = client.post(f'/api/cases/{args.case}/evidence',files={'file':(record['name'],content)},data={
                    'source_type':record['source'],'collected_by':args.collector,'acquired_at':record['acquired_at'],
                    'source_description':'Existing Windows collector export; manifest SHA-256 verified before import.',
                    'notes':record['notes']})
                response.raise_for_status()
                print(f'Imported {record["name"]} -> {response.json()["id"]}')
    except (ValueError,OSError,httpx.HTTPError) as error:
        parser.exit(1,f'Import stopped: {error}\n')


if __name__=='__main__':
    main()
