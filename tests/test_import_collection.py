import csv
import hashlib
import pytest
from backend.import_collection import inspect_collection


def manifest(root, file='log.csv', sha=None, status='ok'):
    with (root/'manifest.csv').open('w',newline='',encoding='utf-8') as stream:
        writer=csv.DictWriter(stream,fieldnames=['name','file','status','sha256','collected_at_utc','command'])
        writer.writeheader()
        writer.writerow({'name':'logons','file':file,'status':status,'sha256':sha or hashlib.sha256(b'fixture').hexdigest(),'command':'untrusted command text','collected_at_utc':'2026-10-01T00:00:00Z'})


def test_manifest_validates_bytes_and_preserves_provenance(tmp_path):
    (tmp_path/'log.csv').write_bytes(b'fixture')
    manifest(tmp_path)
    record=inspect_collection(tmp_path)[0]
    assert record['status']=='ready' and record['source']=='authentication'
    assert record['acquired_at']=='2026-10-01T00:00:00Z'
    assert 'untrusted command text' in record['notes']


def test_manifest_rejects_changed_file(tmp_path):
    (tmp_path/'log.csv').write_bytes(b'changed')
    manifest(tmp_path)
    with pytest.raises(ValueError,match='mismatched'):
        inspect_collection(tmp_path)


def test_manifest_rejects_escape_path(tmp_path):
    nested=tmp_path/'collection';nested.mkdir()
    (tmp_path/'log.csv').write_bytes(b'fixture')
    manifest(nested,'../log.csv')
    with pytest.raises(ValueError,match='escapes'):
        inspect_collection(nested)


def test_failed_acquisition_not_silently_treated_as_empty_success(tmp_path):
    manifest(tmp_path,status='failed')
    assert inspect_collection(tmp_path)[0]['status']=='skipped'
