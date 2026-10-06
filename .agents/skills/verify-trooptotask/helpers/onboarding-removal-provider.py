#!/usr/bin/env python3
"""Fixed owned-provider Onboarding removal observations; never a migration.

After normal native template preparation, capture the original legacy Paperwork
row. fault-on leaves one recorded DELETE fault; fault-off must remove it before
clean-seeds. wait locks that row without changing it, reports HOLDING, then
RECONCILIATION_WAITING. The driver starts DELETE only after the second report.
Two ordered ordinary writer waits cause automatic ROLLBACK. The driver must drain
both requests and collect their outcomes before cleanup. No app requests here.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import queue
import re
import signal
import subprocess
import sys
import threading
import time
import tomllib
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from urllib.parse import urlsplit
import uuid

sys.dont_write_bytecode = True
REPOSITORY = Path(__file__).resolve().parents[4]
EVIDENCE = REPOSITORY / ".verification/evidence/verify-trooptotask"


class Blocked(Exception):
    """Public diagnostic with no private provider output."""


def require(condition, message):
    if not condition:
        raise Blocked(message)


def stamp():
    return datetime.now(timezone.utc).isoformat()


def public_error(error):
    return {"error_type": type(error).__name__,
            "message": str(error) if isinstance(error, Blocked) else "Private command diagnostics withheld."}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def regular(value):
    path = Path(value).absolute()
    require(path.resolve() == path and path.is_file() and not path.is_symlink()
            and path.stat().st_uid == os.getuid(), "Use an owned regular file without symlink ancestors.")
    return path


def read_json(value):
    return json.loads(regular(value).read_text())


def uid(value):
    try:
        canonical = isinstance(value, str) and str(uuid.UUID(value)) == value
    except ValueError:
        canonical = False
    require(canonical, "Use a canonical lowercase UUID.")
    return value


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def decode_json_values(stdout):
    """psql JSON rows may themselves contain json_agg's embedded newlines."""
    decoder, values, cursor = json.JSONDecoder(), [], 0
    while cursor < len(stdout):
        while cursor < len(stdout) and stdout[cursor].isspace():
            cursor += 1
        if cursor == len(stdout):
            break
        value, cursor = decoder.raw_decode(stdout, cursor)
        values.append(value)
        require(cursor == len(stdout) or stdout[cursor].isspace(), "SQL JSON rows lack a whitespace separator.")
    return values


def validate_seed(seed, fixture, ledger):
    """Only the helper's original, ledgered legacy cohort may supply targets."""
    require(seed.get("kind") == "onboarding-legacy" and re.fullmatch(r"[0-9a-f]{8}", seed.get("tag", "")),
            "Use the original onboarding-legacy seed capture.")
    org = uid(fixture["ids"]["orgA"])
    require(len(seed.get("packets", [])) == 1 and len(seed.get("progress", [])) == 3,
            "Use exactly the original legacy packet and three progress rows.")
    person, packet = seed["person"], seed["packets"][0]
    require(person == {"id": person.get("id"), "organization_id": org, "group_id": fixture["ids"]["groupA"],
                       "rank": "SPC", "first_name": "Synthetic", "last_name": "MapLegacy" + seed["tag"],
                       "slug": "map-legacy-" + seed["tag"]}, "Legacy Person capture differs from its business contract.")
    require(packet == {"id": packet.get("id"), "organization_id": org, "personnel_id": person["id"],
                       "template_id": None, "started_at": fixture["dates"]["ui"], "status": "in_progress"},
            "Legacy packet capture differs from its business contract.")
    rows = sorted(seed["progress"], key=lambda row: row["sort_order"])
    expected = [("Orientation", "checkbox", True, None, None),
                ("Paperwork", "paperwork", False, ["Submitted", "Reviewed", "Filed"], "Reviewed"),
                ("Historic task", "checkbox", True, None, None)]
    require(len({row["id"] for row in rows}) == 3, "Original progress IDs must be distinct.")
    for index, (row, fields) in enumerate(zip(rows, expected)):
        require(row == {"id": row.get("id"), "organization_id": org, "onboarding_id": packet["id"],
                        "template_step_id": None, "step_name": fields[0], "step_type": fields[1],
                        "completed": fields[2], "stages": fields[3], "current_stage": fields[4],
                        "sort_order": index, "active": True,
                        "notes": [{"text": "Legacy retained work " + seed["tag"],
                                   "timestamp": "2000-01-01T12:00:00.000Z",
                                   "userId": fixture["actors"]["onboardingConfigure"]["id"]}]},
                "Original legacy progress business fields differ.")
    for table, targets in (("personnel", [person]), ("personnel_onboardings", [packet]),
                           ("onboarding_step_progress", rows)):
        for row in targets:
            uid(row["id"])
            require(any(entry.get("kind") == seed["kind"] and entry.get("tag") == seed["tag"]
                        and entry.get("organization") == "orgA" and entry.get("table") == table
                        and row["id"] in entry.get("ids", []) for entry in ledger.get("seeded", [])),
                    "A legacy target ID is absent from this worker's current ledger.")
    return org, person, packet, rows[1]


def ordered_waits(waiting, first):
    """Require the observed RPC first, then a DELETE blocked through that RPC."""
    rpc = [row for row in waiting if row["query_class"] == "reconciliation-ordinary-rpc"]
    deletion = [row for row in waiting if row["query_class"] == "progress-ordinary-delete"]
    require(len(rpc) <= 1 and len(deletion) <= 1 and len(rpc) + len(deletion) == len(waiting),
            "Additional or unclassified writers make this interleaving inconclusive.")
    if first is None:
        require(not deletion, "DELETE began before the first reconciliation wait was recorded.")
        return (rpc[0] if rpc else None), False
    require(not rpc or (rpc[0]["pid"], rpc[0]["backend_start"]) == (first["pid"], first["backend_start"]),
            "The observed reconciliation backend changed.")
    if not deletion:
        return first, False
    require(rpc and any(first["pid"] in path for path in deletion[0]["blocking_paths"]),
            "DELETE did not wait through the recorded reconciliation backend.")
    return first, True


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Probe:
    def __init__(self, args):
        require(Path.cwd().resolve() == REPOSITORY, "Run from this helper's exact checkout root.")
        destination = Path(args.evidence).absolute()
        require(destination.resolve() == destination and destination.is_relative_to(EVIDENCE),
                "Evidence must resolve inside this checkout's durable verification directory.")
        destination.mkdir(parents=True, exist_ok=True, mode=0o700)
        require(destination.stat().st_uid == os.getuid(), "Evidence directory belongs to another user.")
        self.run = destination / ("removal-" + args.mode + "-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                                  + "-" + uuid.uuid4().hex[:8])
        self.run.mkdir(mode=0o700)
        self.mode, self.seconds = args.mode, args.max_hold_seconds
        self.fault_installed = False
        require(5 <= self.seconds <= 60, "Hold bound must be 5 through 60 seconds.")
        seed_path = regular(args.seed)
        require(seed_path.is_relative_to(EVIDENCE), "Seed capture must be in this checkout's durable evidence.")
        self.seed = read_json(seed_path)
        self.seed_sha = sha(seed_path)
        self.app_name = "t2t-d15-removal-" + uuid.uuid4().hex
        module_path = REPOSITORY / "scripts/verification/environment.py"
        spec = importlib.util.spec_from_file_location("d15_removal_environment", module_path)
        environment = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(environment)
        self.session = (Path.home() / ".local/state/trooptotask-verification"
                        / hashlib.sha256(str(REPOSITORY).encode()).hexdigest()[:16] / ("worker-" + args.worker))
        environment.private_session(self.session)
        require(read_json(self.session / "environment.json").get("repository") == str(REPOSITORY),
                "Provider ownership marker names a different checkout.")
        state, self.workdir, self.environment = environment.owned(self.session)
        require(state["repository"] == str(REPOSITORY), "Provider belongs to another checkout.")
        status = environment.status(self.session)
        records = environment.containers(state, self.workdir, self.environment)
        database_name = "supabase_db_" + state["project"]
        matches = [record for record in records if record["Name"] == "/" + database_name and record["State"]["Running"]]
        require(len(matches) == 1, "Exact owned database container is not running.")
        self.container = matches[0]["Id"]
        require(re.fullmatch(r"[0-9a-f]{64}", self.container), "Invalid exact database container ID.")
        self.worker = read_json(self.session / "session.json")
        require(self.worker.get("id") == uid(args.session_id) and self.worker.get("repository") == str(REPOSITORY)
                and self.worker.get("worker") == args.worker and self.worker.get("phase") == "running",
                "Frozen worker/session identity is not running in this checkout.")
        supervisor = self.worker["supervisor"]
        require(type(supervisor["pid"]) is int and supervisor["pid"] > 0, "Invalid supervisor PID.")
        proc = Path("/proc") / str(supervisor["pid"])
        stat = (proc / "stat").read_text()
        require(stat[stat.rfind(")") + 2:].split()[19] == str(supervisor["start"])
                and (proc / "cmdline").read_bytes().decode() == supervisor["command"], "Owned supervisor was replaced.")
        origin = urlsplit(self.worker["origin"])
        require(origin.scheme == "http" and origin.hostname == "127.0.0.1" and origin.port
                and not origin.username and not origin.password and origin.path in ("", "/")
                and not origin.query and not origin.fragment, "Owned app origin is not loopback HTTP.")
        config = tomllib.loads((self.workdir / "supabase/config.toml").read_text())
        require(config["auth"]["site_url"] == self.worker["origin"], "Provider config and app origin differ.")
        port = self.worker["controlPort"]
        require(type(port) is int and 0 < port < 65536, "Invalid owned control port.")
        request = Request(f"http://127.0.0.1:{port}", data=b'{"command":"doctor"}', method="POST",
                          headers={"Authorization": "Bearer " + self.worker["token"], "Content-Type": "application/json"})
        opener = build_opener(ProxyHandler({}), NoRedirect())
        try:
            response = opener.open(request, timeout=30)
        except HTTPError as error:
            response = error
        with response:
            doctor = json.loads(response.read(1048576))
            authenticated = response.headers.get("X-T2T-Session") == self.worker["id"]
            code = response.status
        self.save("doctor.json", {"http_status": code, "authenticated": authenticated, "result": doctor})
        require(code == 200 and authenticated and doctor.get("status") == "PASS"
                and doctor.get("session") == self.worker["id"] and doctor.get("origin") == self.worker["origin"]
                and doctor.get("candidate") == self.worker["candidate"], "Owned authenticated doctor did not pass.")
        fixture = read_json(self.session / "fixtures.json")
        ledger_path = regular(self.session / "verify-trooptotask-owned.json")
        self.org, self.person, self.packet, self.target = validate_seed(self.seed, fixture, read_json(ledger_path))
        self.packet_id, self.target_id = self.packet["id"], self.target["id"]
        self.binding = {"repository": str(REPOSITORY), "worker": args.worker, "session_id": self.worker["id"],
                        "project": state["project"], "container_id": self.container, "seed_sha256": self.seed_sha,
                        "organization_id": self.org, "packet_id": self.packet_id, "step_id": self.target_id}
        self.function = "t2t_d15_remove_fault_" + self.seed["tag"] + "_" + self.worker["id"][:8]
        self.marker = json.dumps(self.binding, sort_keys=True)
        self.command = ["docker", "exec", "-i", "-e", "PGPASSWORD=postgres", "-e", "PGAPPNAME=" + self.app_name + "-observer",
                        self.container, "psql", "-X", "-q", "-A", "-t", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
        self.prepared = None
        inputs = {"mode": args.mode, "binding": self.binding, "at": stamp(), "helper_sha256": sha(Path(__file__)),
                  "seed": {"path": str(seed_path), "sha256": self.seed_sha}, "max_hold_seconds": self.seconds,
                  "ledger_sha256": sha(ledger_path), "environment_helper_sha256": sha(module_path),
                  "config_sha256": sha(self.workdir / "supabase/config.toml"), "provider_status": status,
                  "supervisor_identity_matches": True}
        if args.mode != "capture":
            require(args.prepared is not None, "Use capture first, then supply its frozen prepared.json.")
            prepared_path = regular(args.prepared)
            require(prepared_path.is_relative_to(EVIDENCE), "Prepared capture must be inside durable evidence.")
            prepared = read_json(prepared_path)
            require(prepared.get("binding") == self.binding, "Prepared capture belongs to another worker/cohort.")
            self.prepared = prepared["snapshot"]
            self.validate_prepared(self.prepared, args.mode == "wait")
            inputs["prepared"] = {"path": str(prepared_path), "sha256": sha(prepared_path)}
        if args.mode == "wait":
            require(args.reconcile_body and args.delete_body, "Freeze both ordinary request body files before wait.")
            files = [regular(args.reconcile_body), regular(args.delete_body)]
            require(all(path.is_relative_to(EVIDENCE) for path in files), "Frozen request bodies must be inside durable evidence.")
            definition = next(row for row in self.prepared["definitions"] if row["id"] == self.prepared_target()["template_step_id"])
            bodies = [read_json(path) for path in files]
            require(bodies == [{"onboardingId": self.packet_id, "newTemplateId": definition["template_id"]},
                               {"id": self.target_id}], "Requests must switch back to this row's definition and delete only this row.")
            inputs["requests"] = [{"method": method, "family": family, "body": body, "path": str(path), "sha256": sha(path)}
                                  for method, family, body, path in zip(["POST", "DELETE"], ["onboarding-resync", "onboarding-steps"], bodies, files)]
        self.save("input.json", inputs)

    def save(self, name, value):
        descriptor = os.open(self.run / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "w") as output:
            json.dump(value, output, indent=2)
            output.write("\n")

    def plan(self, name, sql):
        path = self.run / (name + ".sql")
        if path.exists():
            require(path.read_text() == sql, "A recorded SQL plan changed within this run.")
            return
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "w") as output:
            output.write(sql)

    def log(self, name, value):
        descriptor = os.open(self.run / (name + ".outputs.jsonl"), os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "a") as output:
            output.write(json.dumps({"at": stamp(), **value}) + "\n")

    def sql(self, name, sql):
        sql = "SET statement_timeout = '10s'; SET lock_timeout = '3s';\n" + sql
        self.plan(name, sql)
        result = subprocess.run(self.command, input=sql, cwd=self.workdir, env=self.environment,
                                text=True, capture_output=True, timeout=15)
        self.log(name, {"exit": result.returncode, "stdout": result.stdout, "stderr": result.stderr[-4000:]})
        require(result.returncode == 0, "Controlled SQL failed; inspect recorded SQL/results.")
        values = decode_json_values(result.stdout)
        require(len(values) == 1, "Controlled SQL must return exactly one JSON object.")
        return values[0]

    def snapshot(self, name):
        org, packet, person, step = map(literal, [self.org, self.packet_id, self.person["id"], self.target_id])
        return self.sql(name, f"""WITH selected_templates AS (
 SELECT template_id AS id FROM public.personnel_onboardings WHERE organization_id={org}::uuid AND id={packet}::uuid
 UNION SELECT definition.template_id FROM public.onboarding_template_steps definition
 JOIN public.onboarding_step_progress progress ON progress.template_step_id=definition.id
 WHERE progress.organization_id={org}::uuid AND progress.id={step}::uuid AND progress.onboarding_id={packet}::uuid
 AND definition.organization_id={org}::uuid
)
SELECT json_build_object(
 'packets', COALESCE((SELECT json_agg(p ORDER BY p.id) FROM public.personnel_onboardings p
 WHERE p.organization_id={org}::uuid AND p.id={packet}::uuid), '[]'::json),
 'person', (SELECT json_build_object('id',id,'organization_id',organization_id,'group_id',group_id,
 'rank',rank,'first_name',first_name,'last_name',last_name,'slug',slug,'archived_at',archived_at)
 FROM public.personnel WHERE organization_id={org}::uuid AND id={person}::uuid),
 'progress', COALESCE((SELECT json_agg(p ORDER BY p.id) FROM public.onboarding_step_progress p
 WHERE p.organization_id={org}::uuid AND p.onboarding_id={packet}::uuid), '[]'::json),
 'templates', COALESCE((SELECT json_agg(t ORDER BY t.id) FROM public.onboarding_templates t
 WHERE t.organization_id={org}::uuid AND t.id IN (SELECT id FROM selected_templates)), '[]'::json),
 'definitions', COALESCE((SELECT json_agg(d ORDER BY d.id) FROM public.onboarding_template_steps d
 WHERE d.organization_id={org}::uuid AND d.template_id IN (SELECT id FROM selected_templates)), '[]'::json));
""")

    def prepared_target(self):
        return next(row for row in self.prepared["progress"] if row["id"] == self.target_id)

    def validate_prepared(self, snapshot, wait=False):
        require(snapshot["person"] == {**self.person, "archived_at": None}, "Legacy Person changed or is archived.")
        require(len(snapshot["packets"]) == 1, "Prepared legacy parent is absent.")
        packet = snapshot["packets"][0]
        require(all(packet.get(key) == value for key, value in self.packet.items() if key != "template_id")
                and packet["completed_at"] is None and packet["cancelled_at"] is None and packet["template_id"] is not None,
                "Prepare through ordinary assignment with an in-progress parent and null terminal dates.")
        uid(packet["template_id"])
        rows = {row["id"]: row for row in snapshot["progress"]}
        require(len(rows) == len(snapshot["progress"]), "Prepared progress identities are duplicated.")
        for original in self.seed["progress"]:
            row = rows.get(original["id"])
            require(row and all(row.get(key) == value for key, value in original.items()
                                if key not in ("active", "template_step_id", "sort_order")),
                    "Native preparation must preserve original identities, work, stages and notes.")
        target = rows[self.target_id]
        require(target["active"] is False and target["completed"] is False, "Prepare an incomplete inactive Paperwork row.")
        require(all(row["organization_id"] == self.org for row in snapshot["templates"] + snapshot["definitions"]),
                "Prepared template references leave the owned Organization.")
        for row in snapshot["templates"] + snapshot["definitions"]:
            uid(row["id"])
        for row in snapshot["definitions"]:
            uid(row["template_id"])
        if target["template_step_id"] is not None:
            uid(target["template_step_id"])
        if wait:
            require(target["template_step_id"] is not None, "Wait requires a normally assigned definition reference.")
            definitions = [row for row in snapshot["definitions"] if row["id"] == target["template_step_id"]]
            require(len(definitions) == 1 and definitions[0]["template_id"] != packet["template_id"]
                    and definitions[0]["name"] == "Paperwork" and definitions[0]["step_type"] == "paperwork"
                    and definitions[0]["stages"] == ["Submitted", "Reviewed", "Filed"],
                    "Switch away from the matching Paperwork definition before waiting.")

    def object_state(self, name):
        return self.sql(name, f"""SELECT json_build_object(
 'function_marker', obj_description(to_regprocedure('public.{self.function}()'), 'pg_proc'),
 'function_exists', to_regprocedure('public.{self.function}()') IS NOT NULL,
 'trigger', (SELECT json_build_object('marker',obj_description(t.oid,'pg_trigger'),
 'function_oid',t.tgfoid::text) FROM pg_trigger t WHERE t.tgrelid='public.onboarding_step_progress'::regclass
 AND t.tgname={literal(self.function)} AND NOT t.tgisinternal),
 'function_oid', to_regprocedure('public.{self.function}()')::oid::text,
 'probe_trigger_count', (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal
 AND tgrelid IN ('public.onboarding_step_progress'::regclass,'public.personnel_onboardings'::regclass)
 AND tgname LIKE 't2t_d15_%'));
""")

    def remove_fault(self):
        state = self.object_state("fault-before-remove")
        require(not state["function_exists"] or state["function_marker"] == self.marker,
                "Fault function has another ownership marker; refusing removal.")
        require(state["trigger"] is None or (state["trigger"]["marker"] == self.marker
                and state["trigger"]["function_oid"] == state["function_oid"]),
                "Fault trigger has another owner/function; refusing removal.")
        self.sql("fault-remove", f"""BEGIN;
DROP TRIGGER IF EXISTS {self.function} ON public.onboarding_step_progress;
DROP FUNCTION IF EXISTS public.{self.function}();
COMMIT;
SELECT json_build_object('event','fault-removed');
""")
        after = self.object_state("fault-after-remove")
        require(not after["function_exists"] and after["trigger"] is None, "Owned fault objects remain.")
        return after

    def fault_on(self):
        require(self.snapshot("before") == self.prepared, "Prepared rows changed before fault installation.")
        state = self.object_state("fault-before-install")
        require(not state["function_exists"] and state["trigger"] is None and state["probe_trigger_count"] == 0,
                "An earlier probe fault remains; remove it with its original inputs.")
        try:
            self.sql("fault-install", f"""BEGIN;
CREATE FUNCTION public.{self.function}() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $removal$
BEGIN
 RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='t2t-d15 intentional owned progress-delete fault';
END;
$removal$;
COMMENT ON FUNCTION public.{self.function}() IS {literal(self.marker)};
CREATE TRIGGER {self.function} BEFORE DELETE ON public.onboarding_step_progress FOR EACH ROW
WHEN (OLD.organization_id={literal(self.org)}::uuid AND OLD.onboarding_id={literal(self.packet_id)}::uuid
 AND OLD.id={literal(self.target_id)}::uuid) EXECUTE FUNCTION public.{self.function}();
COMMENT ON TRIGGER {self.function} ON public.onboarding_step_progress IS {literal(self.marker)};
COMMIT;
SELECT json_build_object('event','fault-installed');
""")
            after = self.object_state("fault-after-install")
            require(after["function_exists"] and after["function_marker"] == self.marker and after["trigger"]
                    and after["trigger"]["marker"] == self.marker and after["trigger"]["function_oid"] == after["function_oid"],
                    "Fault object installation did not match exact ownership.")
        except BaseException as original_error:
            # Installation may have committed even when its output was lost.
            self.cleanup_failed_install(original_error)
            raise
        self.fault_installed = True
        return {"status": "INSTALLED", "target_id": self.target_id, "function_and_trigger": self.function,
                "cleanup_required": "Run fault-off with the same worker/session/seed/prepared inputs BEFORE clean-seeds.",
                "app_outcome": "unestablished; driver captures actual response and unchanged rows"}

    def cleanup_failed_install(self, original_error):
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        try:
            after = self.remove_fault()
            self.fault_installed = False
            self.save("fault-install-cleanup.json", {"at": stamp(), "after": after,
                                                    "original_failure": public_error(original_error)})
        except BaseException as cleanup_error:
            self.save("fault-install-cleanup.json", {"at": stamp(), "fault_absence_proven": False,
                      "original_failure": public_error(original_error), "cleanup_failure": public_error(cleanup_error),
                      "recovery": "Stop app work; rerun fault-off with the SAME frozen inputs before seed cleanup."})
            raise Blocked("Fault cleanup failed; exact frozen recovery inputs are recorded. Do not clean seeds.") from None
        finally:
            signal.signal(signal.SIGINT, interrupted)
            signal.signal(signal.SIGTERM, interrupted)

    def observer(self, identity):
        rpc = r'(^|[^[:alnum:]_$"])(public|"public")[.](reconcile_onboarding_packet|"reconcile_onboarding_packet")[[:space:]]*[(]'
        deletion = r'delete[[:space:]]+from[[:space:]]+("?public"?[.])?"?onboarding_step_progress"?([[:space:]]|$)'
        return f"""WITH RECURSIVE candidates AS (
 SELECT a.*, CASE WHEN query ~ {literal(rpc)} THEN 'reconciliation-ordinary-rpc'
 WHEN query ~* {literal(deletion)} THEN 'progress-ordinary-delete' END AS query_class
 FROM pg_stat_activity a WHERE datname='postgres' AND usename='authenticator'
 AND state='active' AND wait_event_type='Lock'
), chain(root_pid,node_pid,path) AS (
 SELECT pid,pid,ARRAY[pid] FROM candidates
 UNION ALL SELECT c.root_pid,b.pid,c.path || b.pid FROM chain c
 CROSS JOIN LATERAL unnest(pg_blocking_pids(c.node_pid)) b(pid)
 WHERE NOT b.pid=ANY(c.path) AND cardinality(c.path)<12
), reached AS (SELECT root_pid,json_agg(path) AS paths FROM chain
 WHERE node_pid={identity['pid']} GROUP BY root_pid)
SELECT json_build_object('holder_matches',EXISTS(SELECT 1 FROM pg_stat_activity
 WHERE {self.holder_condition(identity)}), 'waiting',COALESCE((SELECT json_agg(json_build_object(
 'pid',a.pid,'backend_start',a.backend_start::text,'query_class',a.query_class,
 'query_bytes',octet_length(a.query),'activity_query_capture_size',current_setting('track_activity_query_size'),
 'state',a.state,'wait_event_type',a.wait_event_type,'wait_event',a.wait_event,'blocking_paths',r.paths)
 ORDER BY a.pid) FROM candidates a JOIN reached r ON r.root_pid=a.pid),'[]'::json));
"""

    def holder_condition(self, identity):
        require(type(identity["pid"]) is int and identity["pid"] > 0, "Invalid exact holder PID.")
        return (f"pid={identity['pid']} AND backend_start={literal(identity['backend_start'])}::timestamptz "
                f"AND application_name={literal(self.app_name)} AND usename='supabase_admin' AND datname='postgres'")

    def wait(self):
        before = self.snapshot("before")
        require(before == self.prepared, "Prepared rows changed before the lock.")
        require(self.object_state("fault-absence")["probe_trigger_count"] == 0, "Remove old probe faults before wait.")
        require(self.sql("holder-name-unused", f"SELECT json_build_object('unused',NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name={literal(self.app_name)}));\n")["unused"],
                "Generated holder name already exists.")
        start = f"""SELECT json_build_object('event','identity','pid',pg_backend_pid(),
 'backend_start',(SELECT backend_start::text FROM pg_stat_activity WHERE pid=pg_backend_pid()));
BEGIN;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='3s';
SET LOCAL idle_in_transaction_session_timeout='75s';
SELECT json_build_object('event','locked','id',id) FROM public.onboarding_step_progress
WHERE organization_id={literal(self.org)}::uuid AND onboarding_id={literal(self.packet_id)}::uuid
 AND id={literal(self.target_id)}::uuid AND NOT active AND NOT completed AND step_type='paperwork'
 AND current_stage='Reviewed' AND template_step_id={literal(self.prepared_target()['template_step_id'])}::uuid
 AND notes={literal(json.dumps(self.target['notes']))}::jsonb FOR UPDATE;
SELECT json_build_object('event','ready');
"""
        holder, cleanup, observed = None, {"holder_started": False}, False
        try:
            holder = Holder(self, start)
            holder.send(start)
            identity, _ = holder.until("identity", 5)
            holder.identity = identity
            _, events = holder.until("ready", 8)
            require([event.get("id") for event in events if event.get("event") == "locked"] == [self.target_id],
                    "Holder did not lock exactly the original ledgered Paperwork row.")
            require(self.snapshot("held-before-requests") == before, "Business rows changed before either writer.")
            self.save("ready.json", {"status": "HOLDING", "holder": identity, "binding": self.binding, "at": stamp()})
            print(json.dumps({"status": "HOLDING", "evidence": str(self.run), "holder": identity}), flush=True)
            observer, first, deadline = self.observer(identity), None, time.monotonic() + self.seconds
            while time.monotonic() < deadline:
                require(holder.process.poll() is None, "Holder exited before the ordered waits.")
                waits = self.sql("writer-waits", observer)
                require(waits["holder_matches"], "Exact holder backend disappeared or changed.")
                previous = first
                first, observed = ordered_waits(waits["waiting"], first)
                if previous is None and first is not None:
                    require(self.snapshot("committed-before-delete") == before, "Committed business rows changed before DELETE.")
                    self.save("reconciliation-waiting.json", {"at": stamp(), "holder": identity, **waits})
                    print(json.dumps({"status": "RECONCILIATION_WAITING", "evidence": str(self.run),
                                      "writer": {"pid": first["pid"], "backend_start": first["backend_start"]}}), flush=True)
                if observed:
                    self.save("observed-ordered-writers.json", {"at": stamp(), "holder": identity, **waits})
                    require(self.snapshot("committed-before-release") == before, "Committed rows changed while both writers waited.")
                    break
                time.sleep(0.25)
            require(observed, "Ordered reconciliation/DELETE waits were not observed within the bound; inconclusive.")
        finally:
            signal.signal(signal.SIGINT, signal.SIG_IGN)
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            if holder:
                try:
                    cleanup = holder.close()
                except BaseException as error:
                    cleanup = {"holder_started": True, "holder_absent": False, **public_error(error),
                               "recovery": "Exact identity/SQL recorded; 75s idle transaction timeout is a backstop."}
            self.save("cleanup.json", {"at": stamp(), **cleanup, "driver_must_drain_requests_before_seed_cleanup": True})
            signal.signal(signal.SIGINT, interrupted)
            signal.signal(signal.SIGTERM, interrupted)
            require(cleanup.get("holder_absent", holder is None), "Holder absence is unproven; recorded cleanup remains incomplete.")
        return {"status": "ORDERED_WRITERS_OBSERVED_AND_RELEASED", "holder_absent": True,
                "rollback_confirmed": cleanup.get("rollback_confirmed"),
                "app_outcome": "unestablished; driver captures both responses, final rows and native reload"}


class Holder:
    def __init__(self, probe, sql):
        self.probe, self.identity, self.lines = probe, None, queue.Queue()
        probe.plan("holder-start", sql)
        command = ["PGAPPNAME=" + probe.app_name if value == "PGAPPNAME=" + probe.app_name + "-observer" else value
                   for value in probe.command]
        self.process = subprocess.Popen(command, cwd=probe.workdir, env=probe.environment,
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                        text=True, bufsize=1)
        threading.Thread(target=self.collect, daemon=True).start()

    def collect(self):
        for line in self.process.stdout:
            self.probe.log("holder", {"line": line.rstrip("\n")})
            self.lines.put(line)
        self.lines.put(None)

    def send(self, sql):
        self.process.stdin.write(sql)
        self.process.stdin.flush()

    def until(self, event, timeout):
        deadline, events = time.monotonic() + timeout, []
        while time.monotonic() < deadline:
            try:
                line = self.lines.get(timeout=max(0.01, deadline - time.monotonic()))
            except queue.Empty:
                break
            require(line is not None, "Held connection ended; inspect recorded output.")
            if not line.strip().startswith("{"):
                continue
            value = json.loads(line)
            events.append(value)
            if value.get("event") == event:
                return value, events
        raise Blocked("Holder did not report " + event + " within the bound.")

    def close(self):
        result = {"holder_started": True, "rollback_confirmed": False}
        if self.process.poll() is None:
            rollback = "ROLLBACK;\nSELECT json_build_object('event','holder-rolled-back');\n"
            self.probe.plan("holder-rollback", rollback)
            try:
                self.send(rollback)
                self.until("holder-rolled-back", 5)
                result["rollback_confirmed"] = True
            except BaseException as error:
                result["rollback_error"] = public_error(error)
        try:
            if self.process.poll() is None:
                self.send("\\q\n")
                self.process.stdin.close()
            self.process.wait(timeout=5)
        except BaseException:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)
        # Closing docker alone does not establish in-container backend absence.
        if not self.identity:
            candidates = self.probe.sql("holder-recover-identity", f"""SELECT json_build_object('holders',COALESCE(json_agg(
 json_build_object('pid',pid,'backend_start',backend_start::text)),'[]'::json)) FROM pg_stat_activity
WHERE application_name={literal(self.probe.app_name)} AND usename='supabase_admin' AND datname='postgres';
""")["holders"]
            require(len(candidates) <= 1, "Recovery identity is ambiguous; refusing backend termination.")
            if candidates:
                self.identity = candidates[0]
        if self.identity:
            condition = self.probe.holder_condition(self.identity)
            result["backend_cleanup"] = self.probe.sql("holder-cleanup", f"""SELECT json_build_object('terminated',COALESCE(json_agg(
 json_build_object('pid',pid,'termination_requested',pg_terminate_backend(pid,3000))),'[]'::json))
FROM pg_stat_activity WHERE {condition};
""")
        else:
            condition = f"application_name={literal(self.probe.app_name)} AND usename='supabase_admin' AND datname='postgres'"
        result["holder_absent"] = self.probe.sql("holder-absent", f"SELECT json_build_object('absent',NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE {condition}));\n")["absent"]
        return result


def interrupted(_signum, _frame):
    raise Blocked("Probe interrupted; controlled cleanup will run.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("capture", "fault-on", "fault-off", "wait"))
    parser.add_argument("--worker", choices=("1", "2"), required=True)
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--seed", required=True)
    parser.add_argument("--prepared")
    parser.add_argument("--reconcile-body")
    parser.add_argument("--delete-body")
    parser.add_argument("--evidence", required=True)
    parser.add_argument("--max-hold-seconds", type=int, default=35)
    args = parser.parse_args()
    signal.signal(signal.SIGINT, interrupted)
    signal.signal(signal.SIGTERM, interrupted)
    probe = Probe.__new__(Probe)
    try:
        probe.__init__(args)
        if args.mode == "capture":
            snapshot = probe.snapshot("prepared")
            probe.validate_prepared(snapshot)
            probe.save("prepared.json", {"binding": probe.binding, "snapshot": snapshot})
            result = {"status": "CAPTURED", "prepared": str(probe.run / "prepared.json")}
        elif args.mode == "fault-on":
            result = probe.fault_on()
        elif args.mode == "fault-off":
            result = {"status": "REMOVED", "after": probe.remove_fault(), "snapshot": probe.snapshot("after-fault-removal")}
        else:
            result = probe.wait()
        probe.save("result.json", result)
        print(json.dumps({**result, "evidence": str(probe.run)}), flush=True)
        return 0
    except BaseException as error:
        if getattr(probe, "fault_installed", False):
            try:
                probe.cleanup_failed_install(error)
            except BaseException as cleanup_error:
                error = cleanup_error
        failure = {"status": "BLOCKED", **public_error(error)}
        if hasattr(probe, "run"):
            probe.save("failure.json", failure)
            failure["evidence"] = str(probe.run)
        print(json.dumps(failure), flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
