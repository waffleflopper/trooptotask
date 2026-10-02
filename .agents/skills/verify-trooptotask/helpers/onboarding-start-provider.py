#!/usr/bin/env python3
"""Fixed Start save/compensation faults in one doctor-verified disposable worker.

No app request or arbitrary SQL/target is accepted. The only target is the exact
ledgered onboarding-start Person. Remove both faults before clean-seeds.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from urllib.parse import urlsplit
import uuid

sys.dont_write_bytecode = True
REPOSITORY = Path(__file__).resolve().parents[4]
EVIDENCE = REPOSITORY / ".verification/evidence/verify-trooptotask"


class Blocked(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Blocked(message)


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


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_seed(seed, fixture, ledger):
    require(seed.get("kind") == "onboarding-start" and re.fullmatch(r"[0-9a-f]{8}", seed.get("tag", "")),
            "Use the original onboarding-start seed capture.")
    org = uid(fixture["ids"]["orgA"])
    person = seed["person"]
    require(person == {"id": person.get("id"), "organization_id": org, "group_id": fixture["ids"]["groupA"],
                       "rank": "SPC", "first_name": "Synthetic", "last_name": "MapStart" + seed["tag"],
                       "slug": "map-start-" + seed["tag"]}, "Start Person differs from its fixed business contract.")
    uid(person["id"])
    require(seed.get("people") == [person] and seed.get("packets") == [] and seed.get("progress") == []
            and seed.get("templateId") == uid(fixture["ids"]["onboardingTemplate"]),
            "Start setup must contain one fresh Person and no fabricated packet/progress.")
    training = seed.get("training", [])
    require(len(training) == 1 and training[0] == {
        "id": training[0].get("id"), "organization_id": org, "personnel_id": person["id"],
        "training_type_id": fixture["ids"]["trainingRequired"], "completion_date": "1999-01-01",
        "expiration_date": "2000-01-01"}, "Use only the fixed expired Training-presence witness.")
    uid(training[0]["id"])
    for table, row in (("personnel", person), ("personnel_trainings", training[0])):
        require(any(entry.get("kind") == seed["kind"] and entry.get("tag") == seed["tag"]
                    and entry.get("organization") == "orgA" and entry.get("table") == table
                    and entry.get("ids") == [row["id"]] for entry in ledger.get("seeded", [])),
                "Every target must match the original helper ownership ledger.")
    return org, person


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Probe:
    def __init__(self, args):
        require(Path.cwd().resolve() == REPOSITORY, "Run from this exact checkout root.")
        destination = Path(args.evidence).absolute()
        require(destination.resolve() == destination and destination.is_relative_to(EVIDENCE),
                "Evidence must resolve inside this checkout's verification directory.")
        destination.mkdir(parents=True, exist_ok=True, mode=0o700)
        require(destination.stat().st_uid == os.getuid(), "Evidence belongs to another user.")
        self.run = destination / ("start-" + args.mode + "-" + uuid.uuid4().hex[:8])
        self.run.mkdir(mode=0o700)
        seed_path = regular(args.seed)
        require(seed_path.is_relative_to(EVIDENCE), "Seed capture must be inside verification evidence.")
        self.seed = read_json(seed_path)
        module_path = REPOSITORY / "scripts/verification/environment.py"
        spec = importlib.util.spec_from_file_location("start_owned_environment", module_path)
        environment = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(environment)
        self.session = (Path.home() / ".local/state/trooptotask-verification"
                        / hashlib.sha256(str(REPOSITORY).encode()).hexdigest()[:16] / ("worker-" + args.worker))
        environment.private_session(self.session)
        require(read_json(self.session / "environment.json").get("repository") == str(REPOSITORY),
                "Provider ownership marker names another checkout.")
        state, self.workdir, self.environment = environment.owned(self.session)
        require(state["repository"] == str(REPOSITORY), "Provider belongs to another checkout.")
        provider_status = environment.status(self.session)
        records = environment.containers(state, self.workdir, self.environment)
        matches = [r for r in records if r["Name"] == "/supabase_db_" + state["project"] and r["State"]["Running"]]
        require(len(matches) == 1, "Exact owned database container is not running.")
        self.container = matches[0]["Id"]
        require(re.fullmatch(r"[0-9a-f]{64}", self.container), "Invalid exact container ID.")
        worker = read_json(self.session / "session.json")
        require(worker.get("id") == uid(args.session_id) and worker.get("repository") == str(REPOSITORY)
                and worker.get("worker") == args.worker and worker.get("phase") == "running",
                "Frozen worker/session identity is not running in this checkout.")
        supervisor = worker["supervisor"]
        require(type(supervisor["pid"]) is int and supervisor["pid"] > 0, "Invalid supervisor PID.")
        proc = Path("/proc") / str(supervisor["pid"])
        stat = (proc / "stat").read_text()
        require(stat[stat.rfind(")") + 2:].split()[19] == str(supervisor["start"])
                and (proc / "cmdline").read_bytes().decode() == supervisor["command"], "Supervisor was replaced.")
        origin = urlsplit(worker["origin"])
        require(origin.scheme == "http" and origin.hostname == "127.0.0.1" and origin.port
                and not origin.username and not origin.password and origin.path in ("", "/")
                and not origin.query and not origin.fragment, "Owned app origin is not loopback HTTP.")
        require(type(worker["controlPort"]) is int and 0 < worker["controlPort"] < 65536, "Invalid control port.")
        request = Request(f"http://127.0.0.1:{worker['controlPort']}", data=b'{"command":"doctor"}', method="POST",
                          headers={"Authorization": "Bearer " + worker["token"], "Content-Type": "application/json"})
        opener = build_opener(ProxyHandler({}), NoRedirect())
        try:
            response = opener.open(request, timeout=30)
        except HTTPError as error:
            response = error
        with response:
            doctor = json.loads(response.read(1048576))
            admitted = response.status == 200 and response.headers.get("X-T2T-Session") == worker["id"]
        self.save("doctor.json", {"authenticated": admitted, "result": doctor})
        require(admitted and doctor.get("status") == "PASS" and doctor.get("session") == worker["id"]
                and doctor.get("origin") == worker["origin"] and doctor.get("candidate") == worker["candidate"],
                "Owned authenticated doctor did not pass.")
        self.fixture = read_json(self.session / "fixtures.json")
        ledger_path = regular(self.session / "verify-trooptotask-owned.json")
        self.org, self.person = validate_seed(self.seed, self.fixture, read_json(ledger_path))
        self.binding = {"repository": str(REPOSITORY), "worker": args.worker, "session_id": worker["id"],
                        "project": state["project"], "container_id": self.container, "seed_sha256": sha(seed_path),
                        "organization_id": self.org, "personnel_id": self.person["id"], "template_id": self.seed["templateId"]}
        self.marker = json.dumps(self.binding, sort_keys=True)
        stem = "t2t_d15_start_" + self.seed["tag"] + "_" + worker["id"][:8]
        self.objects = [(stem + "_save", "onboarding_step_progress"), (stem + "_delete", "personnel_onboardings")]
        self.command = ["docker", "exec", "-i", "-e", "PGPASSWORD=postgres", self.container, "psql", "-X", "-q",
                        "-A", "-t", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
        self.prepared = None
        prepared_input = None
        if args.prepared:
            prepared_path = regular(args.prepared)
            require(prepared_path.is_relative_to(EVIDENCE), "Prepared capture must be inside verification evidence.")
            prepared = read_json(prepared_path)
            require(prepared.get("binding") == self.binding, "Prepared capture belongs to another worker/cohort.")
            self.prepared = prepared["snapshot"]
            prepared_input = {"path": str(prepared_path), "sha256": sha(prepared_path)}
        require(args.mode == "capture" or self.prepared is not None, "Use capture first and its prepared.json.")
        self.save("input.json", {"mode": args.mode, "binding": self.binding, "at": datetime.now(timezone.utc).isoformat(),
                                "helper_sha256": sha(Path(__file__)), "environment_sha256": sha(module_path),
                                "seed_path": str(seed_path), "ledger_sha256": sha(ledger_path),
                                "prepared": prepared_input, "config_sha256": state["config_sha256"],
                                "provider_status": provider_status, "supervisor_identity_matches": True})

    def save(self, name, value):
        with (self.run / name).open("x") as output:
            json.dump(value, output, indent=2)
            output.write("\n")

    def sql(self, name, sql):
        sql = "SET statement_timeout='10s'; SET lock_timeout='3s';\n" + sql
        with (self.run / (name + ".sql")).open("x") as output:
            output.write(sql)
        result = subprocess.run(self.command, input=sql, cwd=self.workdir, env=self.environment,
                                text=True, capture_output=True, timeout=15)
        self.save(name + ".json", {"exit": result.returncode, "stdout": result.stdout, "stderr": result.stderr[-4000:]})
        require(result.returncode == 0, "Controlled SQL failed; inspect recorded SQL/results.")
        return json.loads(result.stdout)

    def snapshot(self, name):
        org, person, template = map(literal, [self.org, self.person["id"], self.seed["templateId"]])
        return self.sql(name, f"""SELECT json_build_object(
 'person', (SELECT json_build_object('id',id,'organization_id',organization_id,'group_id',group_id,
 'rank',rank,'first_name',first_name,'last_name',last_name,'slug',slug,'archived_at',archived_at)
 FROM public.personnel WHERE organization_id={org}::uuid AND id={person}::uuid),
 'packets', COALESCE((SELECT json_agg(p ORDER BY p.id) FROM public.personnel_onboardings p
 WHERE p.organization_id={org}::uuid AND p.personnel_id={person}::uuid),'[]'::json),
 'progress', COALESCE((SELECT json_agg(s ORDER BY s.id) FROM public.onboarding_step_progress s
 JOIN public.personnel_onboardings p ON p.organization_id=s.organization_id AND p.id=s.onboarding_id
 WHERE p.organization_id={org}::uuid AND p.personnel_id={person}::uuid),'[]'::json),
 'training', COALESCE((SELECT json_agg(t ORDER BY t.id) FROM public.personnel_trainings t
 WHERE t.organization_id={org}::uuid AND t.personnel_id={person}::uuid),'[]'::json),
 'templates', COALESCE((SELECT json_agg(t ORDER BY t.id) FROM public.onboarding_templates t
 WHERE t.organization_id={org}::uuid AND t.id={template}::uuid),'[]'::json),
 'definitions', COALESCE((SELECT json_agg(d ORDER BY d.sort_order,d.id) FROM public.onboarding_template_steps d
 WHERE d.organization_id={org}::uuid AND d.template_id={template}::uuid),'[]'::json));
""")

    def validate_fresh(self, snapshot):
        require(snapshot["person"] == {**self.person, "archived_at": None}, "Start Person changed or is archived.")
        require(snapshot["packets"] == [] and snapshot["progress"] == [], "Capture requires a fresh Person without packets.")
        require(len(snapshot["training"]) == 1 and all(snapshot["training"][0].get(k) == v
                for k, v in self.seed["training"][0].items()), "Training witness changed.")
        require(len(snapshot["templates"]) == 1 and snapshot["templates"][0]["id"] == self.seed["templateId"]
                and len(snapshot["definitions"]) == 3, "Use the original three-step fixture template.")
        for row, key in zip(snapshot["definitions"], ("onboardingCheckbox", "onboardingPaperwork", "onboardingTraining")):
            require(row["id"] == self.fixture["ids"][key] and row["organization_id"] == self.org
                    and row["template_id"] == self.seed["templateId"], "Definition identity/scope differs from fixture.")

    def object_state(self, name):
        values = []
        for function, table in self.objects:
            values.append(f"""json_build_object('name',{literal(function)}, 'table',{literal(table)},
 'function_exists',to_regprocedure('public.{function}()') IS NOT NULL,
 'function_marker',obj_description(to_regprocedure('public.{function}()'),'pg_proc'),
 'function_oid',to_regprocedure('public.{function}()')::oid::text,
 'trigger',(SELECT json_build_object('marker',obj_description(t.oid,'pg_trigger'),'function_oid',t.tgfoid::text)
 FROM pg_trigger t WHERE t.tgrelid='public.{table}'::regclass AND t.tgname={literal(function)} AND NOT t.tgisinternal))""")
        return self.sql(name, "SELECT json_build_array(" + ",".join(values) + ");\n")

    def remove_faults(self):
        before = self.object_state("faults-before-remove")
        for entry in before:
            require(not entry["function_exists"] or entry["function_marker"] == self.marker,
                    "Fault function has another owner; refusing removal.")
            require(entry["trigger"] is None or (entry["trigger"]["marker"] == self.marker
                    and entry["trigger"]["function_oid"] == entry["function_oid"]),
                    "Fault trigger has another owner/function; refusing removal.")
        statements = "\n".join(f"DROP TRIGGER IF EXISTS {function} ON public.{table};\n"
                               f"DROP FUNCTION IF EXISTS public.{function}();" for function, table in self.objects)
        self.sql("faults-remove", "BEGIN;\n" + statements + "\nCOMMIT;\nSELECT json_build_object('removed',true);\n")
        after = self.object_state("faults-after-remove")
        require(all(not entry["function_exists"] and entry["trigger"] is None for entry in after), "Owned faults remain.")
        return after

    def fault_on(self):
        require(self.snapshot("before") == self.prepared, "Prepared rows changed before fault installation.")
        self.validate_fresh(self.prepared)
        require(all(not entry["function_exists"] and entry["trigger"] is None
                    for entry in self.object_state("faults-before-install")), "An earlier owned fault remains.")
        save_function, _ = self.objects[0]
        delete_function, _ = self.objects[1]
        org, person = map(literal, [self.org, self.person["id"]])
        try:
            self.sql("faults-install", f"""BEGIN;
CREATE FUNCTION public.{save_function}() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $save$
BEGIN
 IF NEW.organization_id={org}::uuid AND EXISTS(SELECT 1 FROM public.personnel_onboardings p
 WHERE p.organization_id={org}::uuid AND p.personnel_id={person}::uuid AND p.id=NEW.onboarding_id) THEN
  RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='t2t-d15 intentional owned Start progress-save fault';
 END IF;
 RETURN NEW;
END;$save$;
CREATE FUNCTION public.{delete_function}() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $delete$
BEGIN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='t2t-d15 intentional owned Start compensation-delete fault'; END;$delete$;
CREATE TRIGGER {save_function} BEFORE INSERT ON public.onboarding_step_progress FOR EACH ROW EXECUTE FUNCTION public.{save_function}();
CREATE TRIGGER {delete_function} BEFORE DELETE ON public.personnel_onboardings FOR EACH ROW
 WHEN (OLD.organization_id={org}::uuid AND OLD.personnel_id={person}::uuid) EXECUTE FUNCTION public.{delete_function}();
COMMENT ON FUNCTION public.{save_function}() IS {literal(self.marker)};
COMMENT ON FUNCTION public.{delete_function}() IS {literal(self.marker)};
COMMENT ON TRIGGER {save_function} ON public.onboarding_step_progress IS {literal(self.marker)};
COMMENT ON TRIGGER {delete_function} ON public.personnel_onboardings IS {literal(self.marker)};
COMMIT;
SELECT json_build_object('installed',true,'sqlstate','P0001');
""")
            after = self.object_state("faults-after-install")
            require(all(entry["function_exists"] and entry["function_marker"] == self.marker and entry["trigger"]
                        and entry["trigger"]["marker"] == self.marker
                        and entry["trigger"]["function_oid"] == entry["function_oid"] for entry in after),
                    "Fault installation did not match exact ownership.")
        except BaseException as original_error:
            try:
                self.remove_faults()
                self.save("failed-install-cleanup.json", {"fault_absence_proven": True,
                          "original_error_type": type(original_error).__name__})
            except BaseException as cleanup_error:
                self.save("failed-install-cleanup.json", {"fault_absence_proven": False,
                          "original_error_type": type(original_error).__name__,
                          "cleanup_error_type": type(cleanup_error).__name__,
                          "recovery": "Rerun fault-off with these SAME frozen inputs before clean-seeds."})
                raise Blocked("Fault cleanup is unproven; rerun fault-off with the SAME frozen inputs before clean-seeds.") from None
            raise
        return {"installed": True, "objects": after,
                "cleanup_required": "fault-off with these same frozen inputs BEFORE clean-seeds",
                "app_outcome": "unestablished; capture actual ordinary request and provider readback"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["capture", "readback", "fault-on", "fault-off"])
    parser.add_argument("--worker", required=True, choices=["1", "2"])
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--seed", required=True)
    parser.add_argument("--prepared")
    parser.add_argument("--evidence", required=True)
    args = parser.parse_args()
    probe = Probe(args)
    if args.mode == "capture":
        snapshot = probe.snapshot("initial")
        probe.validate_fresh(snapshot)
        probe.save("prepared.json", {"binding": probe.binding, "snapshot": snapshot})
        result = {"prepared": str(probe.run / "prepared.json"), "snapshot": snapshot}
    elif args.mode == "readback":
        result = {"snapshot": probe.snapshot("observed"), "objects": probe.object_state("observed-faults")}
    elif args.mode == "fault-on":
        result = probe.fault_on()
    else:
        result = {"fault_absence": probe.remove_faults()}
    probe.save("result.json", result)
    print(json.dumps({"status": "PASS", "mode": args.mode, "binding": probe.binding,
                      "evidence": str(probe.run), **result}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"status": "BLOCKED", "error_type": type(error).__name__,
                          "message": str(error) if isinstance(error, Blocked) else "Private diagnostics withheld."}))
        raise SystemExit(2)
