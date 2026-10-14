#!/usr/bin/env python3
import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.request import Request, ProxyHandler, build_opener
import uuid

sys.dont_write_bytecode = True
RELEASE_FAULTS = ('roster-scan-attach-hold', 'roster-scan-remove-hold', 'roster-delete-hold')
REPOSITORY = Path(__file__).resolve().parents[4]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def target(fixture, organization, roster):
    require(organization in ("orgA", "orgB"), "Use an owned fixture Organization.")
    require(str(uuid.UUID(roster)) == roster, "Use a canonical roster UUID.")
    org = fixture["ids"][organization]
    require(str(uuid.UUID(org)) == org, "Owned Organization identity is invalid.")
    return org, org + "/sign-in-rosters/" + roster + "/"


KEY = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/"
                 r"(sign-in-rosters/[0-9a-f-]{36}|counseling-records/[0-9a-f-]{36}|personnel/[0-9a-f-]{36}/documents)/"
                 r"[A-Za-z0-9._-]+")


def recorded_keys(fixture, manifest):
    require(manifest and isinstance(manifest.get('files'), list), 'Seed roster-shared-keys first.')
    organizations = {fixture['ids']['orgA'], fixture['ids']['orgB']}
    keys = []
    for file in manifest['files'][:32]:
        case, bucket, name = file.get('case'), file.get('bucket'), file.get('path')
        require(isinstance(case, str) and re.fullmatch(r'[A-Za-z]{1,40}', case), 'Recorded case name is invalid.')
        require(isinstance(name, str) and KEY.fullmatch(name) and name.split('/')[0] in organizations,
                'Recorded key is outside the owned fixture Organizations.')
        require(bucket == ('personnel-documents' if '/personnel/' in name else 'counseling-files'),
                'Recorded key has the wrong bucket.')
        keys.append((case, bucket, name))
    require(len(keys) == len(manifest['files']), 'Too many recorded keys.')
    return keys


def keys_sql(keys):
    values = ','.join(f"('{case}','{bucket}','{name}')" for case, bucket, name in keys)
    return f"""SET statement_timeout='10s';
WITH k(case_name, bucket, name) AS (VALUES {values}),
d AS (SELECT k.*, organization_private.file_key_digest(bucket, name) digest FROM k)
SELECT coalesce(json_agg(json_build_object(
 'case', case_name, 'bucket', bucket, 'key', name, 'digest', encode(digest, 'hex'),
 'object', (SELECT json_build_object('size', (metadata->>'size')::bigint, 'created_at', created_at)
   FROM storage.objects o WHERE o.bucket_id = d.bucket AND o.name = d.name),
 'references', json_build_object(
   'counseling', (SELECT coalesce(json_agg(id ORDER BY id), '[]'::json) FROM public.counseling_records
     WHERE d.bucket = 'counseling-files' AND file_path = d.name),
   'rosters', (SELECT coalesce(json_agg(id ORDER BY id), '[]'::json) FROM public.sign_in_rosters
     WHERE d.bucket = 'counseling-files' AND signed_file_path = d.name),
   'documents', (SELECT coalesce(json_agg(id ORDER BY id), '[]'::json) FROM public.personnel_documents
     WHERE d.bucket = 'personnel-documents' AND file_path = d.name)),
 'hold', (SELECT json_build_object('held_at', held_at, 'attempted_at', attempted_at)
   FROM organization_private.file_retirement_holds h WHERE h.key_digest = d.digest),
 'retirement', (SELECT json_build_object('pending', object_name IS NOT NULL, 'completed', object_name IS NULL,
   'retired_at', retired_at, 'attempted_at', attempted_at)
   FROM organization_private.file_retirements r WHERE r.key_digest = d.digest),
 'registrations', (SELECT coalesce(json_agg(json_build_object('id', id, 'actor_id', actor_id, 'created_at', created_at)
   ORDER BY created_at), '[]'::json) FROM organization_private.file_uploads u
   WHERE u.bucket_id = d.bucket AND u.object_name = d.name)
) ORDER BY case_name), '[]'::json) FROM d;
"""


def inventory_sql(org, roster, prefix):
    return f"""SET statement_timeout='10s';
SELECT json_build_object(
 'rows', (SELECT coalesce(json_agg(to_jsonb(r)),'[]'::json) FROM public.sign_in_rosters r
   WHERE organization_id='{org}'::uuid AND id='{roster}'::uuid),
 'objects', (SELECT coalesce(json_agg(json_build_object('key',name,'metadata',metadata) ORDER BY name),'[]'::json)
   FROM storage.objects WHERE bucket_id='counseling-files' AND left(name,{len(prefix)})='{prefix}'),
 'registrations', (SELECT coalesce(json_agg(to_jsonb(r)),'[]'::json) FROM organization_private.file_uploads r
   WHERE organization_id='{org}'::uuid AND bucket_id='counseling-files' AND left(object_name,{len(prefix)})='{prefix}'),
 'retirements', (SELECT coalesce(json_agg(to_jsonb(r)),'[]'::json) FROM organization_private.file_retirements r
   WHERE bucket_id='counseling-files' AND left(object_name,{len(prefix)})='{prefix}'),
 'holds', (SELECT coalesce(json_agg(to_jsonb(r)),'[]'::json) FROM organization_private.file_retirement_holds r
   WHERE bucket_id='counseling-files' AND left(object_name,{len(prefix)})='{prefix}'),
 'waiting_writers', (SELECT coalesce(json_agg(json_build_object('pid',pid,'state',state,'wait_event_type',wait_event_type,
   'wait_event',wait_event,'blocking_pids',pg_blocking_pids(pid))),'[]'::json) FROM pg_stat_activity
   WHERE usename='authenticator' AND wait_event_type='Lock' AND query LIKE '%sign_in_roster%'));
"""


def waiter_graph(database, holder):
    return json.loads(database._execute(f"""WITH RECURSIVE chain AS (
 SELECT pid, pg_blocking_pids(pid) blockers FROM pg_stat_activity
 WHERE {holder}=ANY(pg_blocking_pids(pid))
 UNION
 SELECT a.pid, pg_blocking_pids(a.pid) FROM pg_stat_activity a JOIN chain c
 ON c.pid=ANY(pg_blocking_pids(a.pid)))
 SELECT coalesce(json_agg(json_build_object('pid',a.pid,'state',state,'wait_event_type',wait_event_type,
 'wait_event',wait_event,'blocking_pids',c.blockers,'query_start',query_start,
 'operation',CASE WHEN query LIKE '%attach_sign_in_roster_scan%' THEN 'attach'
   WHEN query LIKE '%remove_sign_in_roster_scan%' THEN 'remove'
   WHEN query LIKE '%delete_sign_in_roster%' THEN 'delete'
   WHEN query LIKE '%DELETE FROM%' THEN 'direct-delete' ELSE 'direct-update' END)), '[]'::json)
 FROM chain c JOIN pg_stat_activity a ON a.pid=c.pid
 WHERE usename='authenticator' AND wait_event_type='Lock' AND query LIKE '%sign_in_roster%';""").strip())


def release_fault(environment, session, worker, name):
    config = environment.private_json(session / 'server-source-control.json')
    ready = environment.private_json(session / 'server-source-control-ready.json')
    require(config['sessionId'] == worker['id'] == ready['sessionId'], 'Foreign preload identity.')
    request = Request(f"http://127.0.0.1:{ready['port']}", method='POST',
                      headers={'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'application/json'},
                      data=json.dumps({'action': 'fault-release', 'name': name}).encode())
    with build_opener(ProxyHandler({})).open(request, timeout=2) as response:
        value = json.loads(response.read(1048576))
        require(response.headers.get('X-T2T-Session') == worker['id'] and value['status'] == 'PASS',
                'Owned preload did not acknowledge release.')
        return value


def timeout_probe(environment, session, database, fixture, binding):
    provider = environment.private_json(session / 'provider.json')
    actor = fixture['actors']['rosterManager']
    opener = build_opener(ProxyHandler({}))
    def call(path, body, token):
        request = Request(provider['API_URL'] + path, method='POST', data=json.dumps(body).encode(),
                          headers={'apikey': provider['ANON_KEY'], 'Authorization': 'Bearer ' + token,
                                   'Content-Type': 'application/json'})
        with opener.open(request, timeout=10) as response:
            return response.status, json.loads(response.read(1048576) or b'{}')
    _, signed = call('/auth/v1/token?grant_type=password',
                     {'email': actor['email'], 'password': actor['password']}, provider['ANON_KEY'])
    token = signed['access_token']
    function = 't2t_verify_roster_timeout_' + binding['session'].replace('-', '')
    try:
        database._execute(f"""CREATE FUNCTION public.{function}() RETURNS json LANGUAGE sql AS
 $$ SELECT json_build_object('statement_timeout',current_setting('statement_timeout'),
 'role',current_user,'session_user',session_user,'actor',auth.uid()); $$;
 REVOKE ALL ON FUNCTION public.{function}() FROM PUBLIC, anon;
 GRANT EXECUTE ON FUNCTION public.{function}() TO authenticated;
 NOTIFY pgrst, 'reload schema';""")
        from urllib.error import HTTPError
        deadline = time.monotonic() + 5
        while True:
            try:
                status, value = call('/rest/v1/rpc/' + function, {}, token)
                break
            except HTTPError as error:
                if error.code != 404 or time.monotonic() >= deadline:
                    raise
                time.sleep(0.05)
        require(value['role'] == 'authenticated' and value['actor'] == actor['id'], 'Probe actor was not admitted.')
        print(json.dumps({'status': 'PASS', 'binding': binding, 'httpStatus': status, 'probe': value}))
    finally:
        database._execute(f"DROP FUNCTION IF EXISTS public.{function}(); NOTIFY pgrst, 'reload schema';")
        call('/auth/v1/logout?scope=local', {}, token)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("inventory", "hold", "timeout", "keys"))
    parser.add_argument('--independent', action='store_true')
    parser.add_argument('--release-fault', choices=RELEASE_FAULTS)
    parser.add_argument("--worker", choices=("1",), required=True)
    parser.add_argument("organization", nargs="?", choices=("orgA", "orgB"))
    parser.add_argument("roster", nargs="?")
    args = parser.parse_args()
    require((args.mode == 'keys') == (args.roster is None), 'Use keys alone, or ORGANIZATION ROSTER for other modes.')
    key = hashlib.sha256(str(REPOSITORY).encode()).hexdigest()[:16]
    session = Path.home() / ".local/state/trooptotask-verification" / key / ("worker-" + args.worker)
    spec = importlib.util.spec_from_file_location("owned_environment", REPOSITORY / "scripts/verification/environment.py")
    environment = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(environment)
    session = environment.private_session(session)
    worker = environment.private_json(session / "session.json")
    require(worker["repository"] == str(REPOSITORY) and worker["worker"] == args.worker and worker["phase"] == "running",
            "Worker does not belong to this active checkout.")
    if args.independent:
        current = subprocess.run(['node', '--input-type=module', '-e',
                                  "import {candidate} from './scripts/verification/core.mjs'; console.log(await candidate());"],
                                 cwd=REPOSITORY, capture_output=True, text=True, check=True).stdout.strip()
        require(current == worker['candidate'], 'Frozen checkout no longer matches the owned candidate.')
    else:
        request = Request(f"http://127.0.0.1:{worker['controlPort']}", data=b'{"command":"doctor"}', method="POST",
                      headers={"Authorization": "Bearer " + worker["token"], "Content-Type": "application/json"})
        with build_opener(ProxyHandler({})).open(request, timeout=30) as response:
            doctor = json.loads(response.read(1048576))
            require(response.status == 200 and response.headers.get("X-T2T-Session") == worker["id"]
                and doctor.get("status") == "PASS" and doctor.get("candidate") == worker["candidate"],
                "Frozen owned doctor did not pass.")
    fixture = environment.private_json(session / "fixtures.json")
    if args.mode == 'keys':
        keys = recorded_keys(fixture, environment.private_json(session / 'verify-trooptotask-owned.json').get('rosterSharedKeys'))
        with contextlib.redirect_stdout(io.StringIO()):
            database = environment.OwnedDatabase(session)
        print(json.dumps({'status': 'PASS', 'binding': {'session': worker['id'], 'candidate': worker['candidate'],
                                                        'project': database.project},
                          'keys': json.loads(database._execute(keys_sql(keys)).strip())}))
        return
    org, prefix = target(fixture, args.organization, args.roster)
    with contextlib.redirect_stdout(io.StringIO()):
        database = environment.OwnedDatabase(session)
    binding = {"session": worker["id"], "candidate": worker["candidate"], "project": database.project,
               "organization": args.organization, "roster": args.roster, "prefix": prefix}
    if args.mode == 'timeout':
        timeout_probe(environment, session, database, fixture, binding)
        return
    before = json.loads(database._execute(inventory_sql(org, args.roster, prefix)).strip())
    if args.mode == "inventory":
        print(json.dumps({"status": "PASS", "binding": binding, **before}))
        return
    require(args.organization == "orgA" and args.roster == fixture["ids"]["rosterAlpha"] and len(before["rows"]) == 1,
            "Hold is limited to the existing owned Alpha fixture roster.")
    name = "t2t-roster-hold-" + worker["id"]
    command = ["docker", "exec", "-i", "-e", "PGPASSWORD=postgres", "-e", "PGAPPNAME=" + name,
               database.container_id, "psql", "-X", "-qAt", "-h", "127.0.0.1", "-p", "5432",
               "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
    source = f"""BEGIN;
SET LOCAL statement_timeout='3s'; SET LOCAL lock_timeout='1s'; SET LOCAL idle_in_transaction_session_timeout='12s';
SELECT json_build_object('status','HOLDING','pid',pg_backend_pid(),'roster',id) FROM public.sign_in_rosters
 WHERE organization_id='{org}'::uuid AND id='{args.roster}'::uuid FOR UPDATE;
"""
    process = subprocess.Popen(command, cwd=database.workdir, env=database.environment, stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        process.stdin.write(source)
        process.stdin.flush()
        first = process.stdout.readline().strip()
        ready = json.loads(first)
        require(ready.get("status") == "HOLDING" and ready.get("roster") == args.roster, "Exact row hold was not acquired.")
        print(json.dumps({**ready, "binding": binding, "before": before, "deadlineSeconds": 10}), flush=True)
        deadline = time.monotonic() + 10
        first_deadline = None
        released = False
        graph = []
        while time.monotonic() < deadline:
            graph = waiter_graph(database, ready['pid'])
            if graph and first_deadline is None:
                first_deadline = time.monotonic() + 2
                print(json.dumps({'status': 'FIRST_WAITER', 'holder': ready['pid'], 'graph': graph}), flush=True)
            if graph and args.release_fault and not released:
                print(json.dumps({'status': 'PREDISPATCH_RELEASE', 'holder': ready['pid'], 'graph': graph,
                                  'receipt': release_fault(environment, session, worker, args.release_fault)}), flush=True)
                released = True
            if len(graph) >= 2 or (first_deadline and time.monotonic() >= first_deadline):
                break
            time.sleep(0.025)
        print(json.dumps({'status': 'RELEASE_GRAPH', 'holder': ready['pid'], 'graph': graph,
                          'overlap': len(graph) >= 2, 'binding': binding}), flush=True)
        process.stdin.write("ROLLBACK; SELECT json_build_object('status','ROLLED_BACK');\n")
        process.stdin.close()
        process.stdin = None
        output, _ = process.communicate(timeout=3)
        require(process.returncode == 0 and '"ROLLED_BACK"' in output, "Finite holder did not acknowledge rollback.")
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
        cleanup = json.loads(database._execute(f"SELECT json_build_object('holders',count(*)) FROM pg_stat_activity WHERE application_name='{name}';").strip())
        require(cleanup["holders"] == 0, "Exact holder backend remains; wait for its finite timeout before further work.")
        print(json.dumps({"status": "HOLDER_ABSENT", "binding": binding, **cleanup}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"status": "BLOCKED", "error_type": type(error).__name__,
                          "message": str(error) if isinstance(error, (RuntimeError, ValueError)) else "Private diagnostics withheld."}))
        sys.exit(1)
