"""Fictional incident. Documentation IPs and .example domains only."""
import csv
import io
import json


def samples():
    common = {'actor': 'a.sharma', 'device': 'WS-07'}
    def e(time, action, description, **extra):
        return {**common, 'timestamp': '2026-10-16T'+time+'+05:30', 'event_type': action, 'description': description, **extra}
    auth = [e('08:30:00','login_success','Routine sign-in from the office network',ip='192.0.2.12')]
    auth += [e(f'21:0{i}:00','login_failed','Authentication failure from an external source',ip='203.0.113.24') for i in range(3)]
    auth += [e('21:04:00','login_success','Successful sign-in after repeated failures',ip='203.0.113.24')]
    endpoint = [e('21:08:00','file_access','Project Orion directory accessed',object='D:/Projects/Orion'),
                e('21:12:00','archive_created','Project-Orion.zip created on workstation',object='D:/Exports/Project-Orion.zip'),
                e('21:24:00','file_deleted','Local archive deleted after outbound activity',object='D:/Exports/Project-Orion.zip')]
    network = [e('08:40:00','transfer','Routine approved backup',destination='backup.example',bytes=1048576),
               e('21:19:00','transfer','Outbound transfer recorded to file-sharing destination',destination='fileshare.example',ip='198.51.100.42',bytes=487587840,object='D:/Exports/Project-Orion.zip')]
    browser = [e('21:15:00','browser_visit','File-sharing upload page visited',destination='fileshare.example')]
    cloud = [e('21:09:00','file_download','Project files downloaded from shared workspace',object='Project Orion',destination='workspace.example')]
    def as_csv(rows):
        fields = list(dict.fromkeys(k for row in rows for k in row))
        out = io.StringIO(newline='')
        writer = csv.DictWriter(out, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
        return out.getvalue().encode()
    return [('authentication.csv','authentication',as_csv(auth)), ('endpoint-events.json','endpoint',json.dumps(endpoint,indent=2).encode()),
            ('network-traffic.csv','network',as_csv(network)), ('browser-history.json','browser',json.dumps(browser,indent=2).encode()),
            ('cloud-audit.json','cloud',json.dumps(cloud,indent=2).encode()),
            ('collection-notes.txt','document',b'SYNTHETIC TRAINING FIXTURE. All records are fictional.\nSource clocks have not been independently verified.\nTransfer payload bytes and human attribution are not established.\nA transfer may also be explained by authorized work; obtain approval records.\n')]
