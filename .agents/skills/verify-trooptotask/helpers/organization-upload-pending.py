#!/usr/bin/env python3
"""Fixed pending-upload/byte observations in this checkout's disposable verification project.

No application request, production connection, migration, table reset or arbitrary
SQL is accepted. Restore gate-off before clean-seeds or retrying deletion.
"""
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
from urllib.request import Request, ProxyHandler, HTTPRedirectHandler, build_opener

sys.dont_write_bytecode = True
REPOSITORY = Path(__file__).resolve().parents[4]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def fault_state(sql, name):
    return json.loads(sql(f"""SELECT json_build_object(
 'function_oid', to_regprocedure('public.{name}()')::oid,
 'function_comment', obj_description(to_regprocedure('public.{name}()'), 'pg_proc'),
 'trigger', (SELECT json_build_object('function_oid', fault.tgfoid,
   'relation', namespace.nspname || '.' || relation.relname,
   'comment', obj_description(fault.oid, 'pg_trigger'))
  FROM pg_trigger AS fault
  JOIN pg_class AS relation ON relation.oid = fault.tgrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE fault.tgname = {literal(name)} AND fault.tgrelid = 'storage.objects'::regclass));"""))


def require_owned_fault(current, marker):
    trigger = current.get("trigger")
    require(current.get("function_oid") is not None and current.get("function_comment") == marker
            and trigger is not None and trigger.get("function_oid") == current["function_oid"]
            and trigger.get("relation") == "storage.objects" and trigger.get("comment") == marker,
            "Fault function/trigger belongs to a different binding or is absent.")


def remove_owned_fault(sql, name, marker):
    require_owned_fault(fault_state(sql, name), marker)
    sql(f"BEGIN; DROP TRIGGER {name} ON storage.objects; DROP FUNCTION public.{name}(); COMMIT;")
    after = fault_state(sql, name)
    require("function_oid" in after and "trigger" in after
            and after["function_oid"] is None and after["trigger"] is None,
            "Fault removal did not prove function and trigger absence.")
    return after


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", required=True, choices=["1", "2"])
    parser.add_argument("mode", choices=["gate-on", "gate-off", "state", "bytes"])
    args = parser.parse_args()
    key = hashlib.sha256(str(REPOSITORY).encode()).hexdigest()[:16]
    session = Path.home() / ".local/state/trooptotask-verification" / key / ("worker-" + args.worker)
    spec = importlib.util.spec_from_file_location("owned_environment", REPOSITORY / "scripts/verification/environment.py")
    environment = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(environment)
    session = environment.private_session(session)
    with contextlib.redirect_stdout(io.StringIO()):
        state, directory, env = environment.owned(session)
        require(state["repository"] == str(REPOSITORY), "Different repository owns this provider.")
        environment.status(session)
        records = environment.containers(state, directory, env)
    worker = json.loads((session / "session.json").read_text())
    require(worker["repository"] == str(REPOSITORY) and worker["worker"] == args.worker and worker["phase"] == "running",
            "Worker does not belong to this active checkout.")
    require(re.fullmatch(r"[0-9a-f-]{36}", worker["id"]), "Invalid session identity.")
    supervisor = worker["supervisor"]
    process = Path("/proc") / str(supervisor["pid"])
    stat = (process / "stat").read_text()
    require(stat[stat.rfind(")") + 2:].split()[19] == str(supervisor["start"])
            and (process / "cmdline").read_text() == supervisor["command"], "Owned supervisor identity changed.")

    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, *unused):
            return None

    require(type(worker["controlPort"]) is int and 1024 <= worker["controlPort"] <= 65535, "Invalid owned control port.")
    request = Request(f"http://127.0.0.1:{worker['controlPort']}", data=b'{"command":"doctor"}', method="POST",
                      headers={"Authorization": "Bearer " + worker["token"], "Content-Type": "application/json"})
    with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=30) as response:
        doctor = json.loads(response.read(1048576))
        require(response.status == 200 and response.headers.get("X-T2T-Session") == worker["id"]
                and doctor.get("status") == "PASS" and doctor.get("session") == worker["id"]
                and doctor.get("candidate") == worker["candidate"], "Frozen owned doctor did not pass.")
    fixture = json.loads((session / "fixtures.json").read_text())
    org = fixture["ids"]["orgA"]
    ledger = json.loads((session / "verify-trooptotask-owned.json").read_text())
    prepared = ledger.get("uploadOverlap")
    require(prepared and prepared["sessionId"] == worker["id"] and prepared["candidate"] == worker["candidate"]
            and prepared["orgId"] == org and prepared["personId"] == fixture["ids"]["personA"],
            "Run overlap-scan on this frozen owned worker before preparing a pending upload.")
    target = org + "/personnel/" + prepared["personId"] + "/documents/"

    def container(service):
        matches = [record for record in records if record["Name"] == "/supabase_" + service + "_" + state["project"] and record["State"]["Running"]]
        require(len(matches) == 1, "Exact owned service is unavailable.")
        return matches[0]

    def run(command, source=None):
        result = subprocess.run(command, input=source, text=True, capture_output=True, cwd=directory, env=env, timeout=60)
        require(result.returncode == 0, "Owned provider command failed; private diagnostics withheld.")
        return result.stdout

    binding = {"session": worker["id"], "project": state["project"], "target": target, "person": prepared["personId"], "candidate": worker["candidate"]}
    if args.mode == "bytes":
        storage = container("storage")
        config = storage["Config"]["Env"]
        roots = [value.split("=", 1)[1] for value in config if value.startswith("FILE_STORAGE_BACKEND_PATH=")]
        require("STORAGE_BACKEND=file" in config and len(roots) == 1,
                "Owned physical Storage backend configuration is unavailable.")
        root = roots[0]
        require(Path(root).is_absolute() and str(Path(root)) == root and root != "/"
                and any(mount["Destination"] == root for mount in storage["Mounts"]),
                "Physical Storage root is not the exact owned service mount.")
        source = """const fs=require('node:fs'),p=require('node:path'),c=require('node:crypto');
const files=[];function visit(dir){for(const name of fs.readdirSync(dir)){const file=p.join(dir,name),stat=fs.lstatSync(file);if(stat.isDirectory())visit(file);else if(stat.isFile())files.push({path:file,size:stat.size,sha256:c.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});else throw Error('Unexpected Storage path');}}visit(process.argv[1]);process.stdout.write(JSON.stringify(files));"""
        files = json.loads(run(["docker", "exec", storage["Id"], "node", "-e", source, root]))
        print(json.dumps({"binding": binding, "physical_storage_root": root, "physical_storage_files": files}))
        return

    name = "zz_t2t_d17_upload_gate_" + worker["id"].replace("-", "")[:16]
    marker = json.dumps(binding, sort_keys=True)
    command = ["docker", "exec", "-i", "-e", "PGPASSWORD=postgres", container("db")["Id"], "psql", "-X", "-q", "-A", "-t", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
    sql = lambda source: run(command, source)
    if args.mode == "gate-on":
        current = fault_state(sql, name)
        require(current["function_oid"] is None and current["trigger"] is None,
                "A gate already exists; restore its original binding first.")
        sql(f"""BEGIN;
CREATE FUNCTION public.{name}() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.bucket_id = 'personnel-documents' AND left(NEW.name, {len(target)}) = {literal(target)}
   AND NEW.version ~ '^[0-9a-f]{{8}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{12}}$'
   AND current_setting('role', true) = 'service_role' THEN
  PERFORM set_config('application_name', {literal(name + ':')} || NEW.version, true);
  PERFORM pg_sleep(20);
 END IF;
 RETURN NEW;
END $$;
COMMENT ON FUNCTION public.{name}() IS {literal(marker)};
CREATE TRIGGER {name} BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.{name}();
COMMENT ON TRIGGER {name} ON storage.objects IS {literal(marker)};
COMMIT;""")
        after = fault_state(sql, name)
        require_owned_fault(after, marker)
    elif args.mode == "gate-off":
        after = remove_owned_fault(sql, name, marker)
    else:
        current = fault_state(sql, name)
        require_owned_fault(current, marker)
        observed = json.loads(sql(f"""SELECT json_build_object(
 'observed_at', clock_timestamp(),
 'effective_function', pg_get_functiondef(to_regprocedure('public.{name}()')),
 'effective_trigger', (SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname={literal(name)}),
 'pending_sessions', (SELECT coalesce(json_agg(json_build_object('pid',pid,'application_name',application_name,
   'state',state,'wait_event_type',wait_event_type,'wait_event',wait_event,'query_start',query_start)), '[]'::json)
   FROM pg_stat_activity WHERE application_name LIKE {literal(name + ':%')}),
 'registrations', (SELECT coalesce(json_agg(to_jsonb(r)), '[]'::json) FROM organization_private.file_uploads r
   WHERE organization_id={literal(org)}::uuid AND bucket_id='personnel-documents' AND left(object_name,{len(target)})={literal(target)}),
 'committed_metadata', (SELECT coalesce(json_agg(to_jsonb(o)), '[]'::json) FROM storage.objects o
   WHERE bucket_id='personnel-documents' AND left(name,{len(target)})={literal(target)}),
 'document_rows', (SELECT coalesce(json_agg(to_jsonb(d)), '[]'::json) FROM public.personnel_documents d
   WHERE organization_id={literal(org)}::uuid AND personnel_id={literal(prepared['personId'])}::uuid),
 'parent_rows', (SELECT coalesce(json_agg(to_jsonb(o)), '[]'::json) FROM public.organizations o WHERE id={literal(org)}::uuid)
 );"""))
        print(json.dumps({"binding": binding, "mode": args.mode, "observed": observed}))
        return
    print(json.dumps({"binding": binding, "mode": args.mode,
                      "function_exists": after["function_oid"] is not None,
                      "trigger_exists": after["trigger"] is not None}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"status": "BLOCKED", "error_type": type(error).__name__, "message": str(error) if isinstance(error, RuntimeError) else "Private diagnostics withheld."}))
        sys.exit(1)
