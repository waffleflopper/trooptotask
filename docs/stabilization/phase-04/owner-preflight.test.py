"""Exercise preflight rejection on an already-owned, populated disposable replay.

Usage: python owner-preflight.test.py ISOLATED_WORKDIR NEW_RESULT_JSON
Every injected mutation rolls back on error or connection close. No startup,
reset, seed, remote connection, or persistent schema change occurs here.
"""

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tomllib


def require(condition, reason):
    if not condition:
        raise SystemExit(reason)


def main():
    require(len(sys.argv) == 3, __doc__)
    work, output = (Path(arg).resolve() for arg in sys.argv[1:])
    source = Path(__file__).resolve().parent
    require(not work.is_relative_to(source.parents[2]), "Workspace must be outside repository")
    config = tomllib.loads((work / "supabase/config.toml").read_text())
    project = config["project_id"]
    require(re.fullmatch(r"t3-phase04-[a-z0-9-]+", project), "Disposable Phase 04 project required")
    require(config["db"]["seed"] == {"enabled": False, "sql_paths": []}, "Seeds must be disabled")
    require(not list(work.glob(".env*")), "Environment files forbidden")
    require(not (work / "supabase/.temp/project-ref").exists(), "Linked projects forbidden")
    port = config["db"]["port"]
    require(port >= 1024 and port // 100 not in (543, 553, 563), "Protected database port")
    require(not output.exists(), "Refusing to overwrite results")
    env = {k: os.environ[k] for k in ("PATH", "HOME", "USER", "XDG_RUNTIME_DIR") if k in os.environ}
    container = "supabase_db_" + project
    info = json.loads(subprocess.check_output(["docker", "inspect", container], env=env, text=True))[0]
    require(info["State"]["Running"], "Owned project must be running")
    bindings = info["HostConfig"]["PortBindings"]["5432/tcp"]
    require(bindings and all(int(x["HostPort"]) == port for x in bindings), "Port mismatch")
    command = ["docker", "exec", "-i", container, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]

    def execute(sql):
        return subprocess.run(command, env=env, input=sql, text=True, capture_output=True)

    def snapshot():
        result = execute((source / "upgrade-snapshot.sql").read_text())
        require(result.returncode == 0, result.stderr)
        return json.loads(result.stdout)

    sql = (source / "owner-preflight.sql").read_text()
    beginning = "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;"
    require(sql.count(beginning) == 1, "Preflight transaction boundary changed; review tests")
    before = snapshot()
    require(len(before["auth.users"]) == 7, "Populated synthetic baseline required")
    result = execute(sql)
    require(result.returncode == 0, result.stderr)
    report = json.loads(result.stdout)
    for table in ("organization_billing_snapshots", "stripe_webhook_events", "organization_checkout_attempts", "organization_plan_feature_overrides"):
        require(report[table] == 1, "Expected populated commercial table: " + table)
    cases = [
        ("extra overload", "CREATE FUNCTION public.cleanup_old_webhook_events(integer) RETURNS integer LANGUAGE sql AS 'SELECT 1'", "unexpected commercial overloads"),
        ("cross-schema view", "CREATE SCHEMA preflight_probe; CREATE VIEW preflight_probe.retained AS SELECT gift_tier FROM public.organizations", "unreviewed inbound dependencies"),
        ("body-only caller", "CREATE SCHEMA preflight_probe; CREATE FUNCTION preflight_probe.caller() RETURNS void LANGUAGE plpgsql AS 'BEGIN PERFORM public.cleanup_old_webhook_events(); END'", "unclassified routine body references"),
        ("external FK", "CREATE SCHEMA preflight_probe; CREATE TABLE preflight_probe.retained (billing_id uuid REFERENCES public.organization_billing_snapshots(organization_id))", "unreviewed inbound dependencies"),
        ("table row-type caller", "CREATE SCHEMA preflight_probe; CREATE FUNCTION preflight_probe.caller(public.organization_billing_snapshots) RETURNS integer LANGUAGE sql AS 'SELECT 1'", "unreviewed inbound dependencies"),
        ("target column drift", "ALTER TABLE public.organization_checkout_attempts ADD COLUMN retained_note text", "target column inventory"),
        ("RPC definition drift", "ALTER FUNCTION public.cleanup_old_webhook_events() SET statement_timeout='2s'", "RPC definition"),
        ("shared Organization constraint", "ALTER TABLE public.organizations ADD CONSTRAINT preflight_probe CHECK (gift_tier IS NULL OR name <> '')", "Organization commercial constraints"),
        ("Organization expression index", "CREATE INDEX preflight_probe ON public.organizations ((lower(gift_tier)))", "unreviewed index/trigger"),
        ("RLS drift", "ALTER TABLE public.organization_billing_snapshots DISABLE ROW LEVEL SECURITY", "ownership/RLS/ACL"),
        ("scheduled caller", "SELECT cron.schedule('preflight-probe','0 0 * * *','SELECT public.cleanup_old_webhook_events()')", "commercial cron callers"),
        ("unreviewed owned sequence", "CREATE SEQUENCE public.preflight_probe OWNED BY public.organization_checkout_attempts.id", "unreviewed inbound dependencies"),
        ("unreviewed owned rule", "CREATE RULE preflight_probe AS ON DELETE TO public.organization_checkout_attempts DO ALSO SELECT 1", "unreviewed inbound dependencies"),
        ("unreviewed extended statistics", "CREATE STATISTICS public.preflight_probe ON status, created_at FROM public.organization_checkout_attempts", "unreviewed inbound dependencies"),
        ("replication consumer", "ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_billing_snapshots", "unreviewed inbound dependencies"),
    ]
    results = []
    for name, fault, reason in cases:
        # Inject only inside this connection's uncommitted transaction, then
        # execute the actual assertion body in read-only mode. ON_ERROR_STOP
        # closes the connection and rolls the fault back on expected rejection.
        injected = sql.replace(beginning, "BEGIN; " + fault + "; SET LOCAL transaction_read_only=on;")
        result = execute(injected)
        passed = result.returncode != 0 and "BLOCKED:" in result.stderr and reason in result.stderr
        results.append({"case": name, "exit": result.returncode, "expected_rejection": passed})
        require(passed, name + ": " + result.stderr)
        require(execute(sql).returncode == 0, "Fault did not roll back: " + name)
    require(snapshot() == before, "Preflight/probes changed persistent rows")
    output.write_text(json.dumps({"workdir": str(work), "project": project, "database_port": port,
                                 "populated_preflight": report, "rejections": results,
                                 "all_rows_unchanged": True}, indent=2) + "\n")
    print("Populated preflight PASS;", len(results), "rejections PASS; all rows unchanged")


if __name__ == "__main__":
    main()
