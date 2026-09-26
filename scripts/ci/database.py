#!/usr/bin/env python3
"""Replay migrations and SQL contracts in a new, disposable Supabase project."""

import errno
from functools import partial
import json
import os
from pathlib import Path
import random
import shutil
import signal
import socket
import subprocess
import tempfile
import tomllib
from urllib.parse import urlsplit


EXCLUDED_SERVICES = (
    "studio,imgproxy,realtime,storage-api,edge-runtime,logflare,vector,"
    "postgres-meta,mailpit,supavisor"
)
# Matches Supabase CLI 2.101.0's pgTAP runner. Unlike `test db <file>`,
# mounting the copied tree lets migration tests resolve relative psql includes.
PG_PROVE_IMAGE = "public.ecr.aws/supabase/pg_prove:3.36"
ACCOUNT_SETUP_UPGRADE_MIGRATIONS = (
    "20260923000100_guard_account_setup_claims.sql",
    "20260923000200_release_account_setup_claim_for_staff.sql",
    "20260926000100_reconcile_account_setup_attempts.sql",
)
STAGED_UPGRADE_MIGRATIONS = (
    *ACCOUNT_SETUP_UPGRADE_MIGRATIONS,
    "20260926000300_training_record_scope.sql",
    "20260926000400_critical_tasks_read_scope.sql",
    "20260926000500_critical_tasks_task_reference_integrity.sql",
    "20260926000600_calendar_unassigned_scope.sql",
    "20260926000700_personnel_unassigned_scope.sql",
    "20260926000800_personnel_counseling_file_scope.sql",
    "20260926000900_rating_scheme_unassigned_scope.sql",
)
STAGED_UPGRADE_FIXTURES = (
    "account_setup_populated_before.sql",
    "training_record_populated_before.sql",
    "critical_tasks_populated_before.sql",
    "calendar_unassigned_populated_before.sql",
    "personnel_unassigned_populated_before.sql",
    "personnel_counseling_file_populated_before.sql",
    "rating_scheme_populated_before.sql",
)
STAGED_UPGRADE_CONTRACTS = (
    "account_setup_populated_after.sql",
    "training_record_populated_after.sql",
    "critical_tasks_populated_after.sql",
    "critical_tasks_task_reference_after.sql",
    "calendar_unassigned_populated_after.sql",
    "personnel_unassigned_populated_after.sql",
    "personnel_counseling_file_populated_after.sql",
    "rating_scheme_populated_after.sql",
)


def port_fields(config, prefix=()):
    for key, value in config.items():
        if isinstance(value, dict):
            yield from port_fields(value, (*prefix, key))
        elif key == "port" or key.endswith("_port"):
            yield (*prefix, key)


def reserve_ports(count):
    """Hold sockets until startup to avoid reusing occupied or protected ports."""
    sockets = []
    candidates = list(range(58000, 65000))
    random.SystemRandom().shuffle(candidates)
    try:
        for port in candidates:
            try:
                sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
            except OSError as error:
                if error.errno not in (errno.EAFNOSUPPORT, errno.EPROTONOSUPPORT):
                    raise
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                if sock.family == socket.AF_INET6:
                    sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
                    sock.bind(("::", port))
                else:
                    sock.bind(("0.0.0.0", port))
            except OSError:
                sock.close()
                continue
            sockets.append(sock)
            if len(sockets) == count:
                return sockets
        raise RuntimeError("Could not reserve unused disposable database ports")
    except BaseException:
        for sock in sockets:
            sock.close()
        raise


def isolated_config(source, project_id, ports):
    config = tomllib.loads(source)
    fields = list(port_fields(config))
    if len(fields) != len(ports) or len(set(ports)) != len(ports):
        raise ValueError("Every configured port must receive a distinct allocation")
    if any(not 58000 <= port < 65000 for port in ports):
        raise ValueError("Disposable ports must be outside existing development stacks")
    config["project_id"] = project_id
    config["db"]["seed"] = {"enabled": False, "sql_paths": []}
    for field, port in zip(fields, ports):
        table = config
        for part in field[:-1]:
            table = table[part]
        table[field[-1]] = port
    return config


def config_text(config, prefix=()):
    """Serialize this config's scalar/array tables without adding a dependency."""
    lines = [f"[{'.'.join(prefix)}]"] if prefix else []
    for key, value in config.items():
        if not isinstance(value, dict):
            lines.append(f"{key} = {json.dumps(value)}")
    for key, value in config.items():
        if isinstance(value, dict):
            lines.extend(["", config_text(value, (*prefix, key))])
    return "\n".join(lines) + "\n"


def prepare_project(repository, workdir, project_id, ports):
    source = repository / "supabase"
    target = workdir / "supabase"
    target.mkdir()
    for name in ("migrations", "tests", "migration-tests", "templates"):
        shutil.copytree(source / name, target / name)
    config = isolated_config((source / "config.toml").read_text(), project_id, ports)
    (target / "config.toml").write_text(config_text(config))
    package = json.loads((repository / "package.json").read_text())
    if any(key in package["scripts"] for key in ("predb:test", "postdb:test")):
        raise ValueError("Review database lifecycle hooks before isolated validation")
    # Carry only the existing SQL contract command; no install/prepare hooks or deps.
    (workdir / "package.json").write_text(json.dumps({
        "private": True, "scripts": {"db:test": package["scripts"]["db:test"]}
    }))
    return config


def clean_environment():
    return {
        key: value for key, value in os.environ.items()
        if not key.startswith("PG") and not any(
            marker in key for marker in (
                "SUPABASE", "DATABASE", "RESEND", "STRIPE", "E2E", "S3_",
                "OPENAI_API_KEY", "ACCOUNT_SETUP", "APP_PUBLIC_ORIGIN", "PUBLIC_APP_ORIGIN",
                "PUBLIC_SITE_URL",
            )
        )
    }


def local_docker_environment(workdir):
    environment = clean_environment()
    context = environment.get("DOCKER_CONTEXT")
    endpoint = environment.get("DOCKER_HOST")
    # Docker context overrides DOCKER_HOST, but not all Docker SDKs resolve
    # contexts. Resolve once, then pin both CLI and Supabase to the same socket.
    if context or not endpoint:
        command = ["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]
        if context:
            command.append(context)
        endpoint = run(command, workdir, quiet=True, environment=environment).stdout.strip()
    address = urlsplit(endpoint)
    if (address.scheme != "unix" or address.netloc or not address.path.startswith("/")
            or address.query or address.fragment):
        raise ValueError("Database validation requires a local Docker Unix socket")
    for key in ("DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"):
        environment.pop(key, None)
    environment["DOCKER_HOST"] = endpoint
    return environment


def run(command, workdir, *, quiet=False, check=True, environment=None, input_text=None):
    print("+ " + " ".join(command), flush=True)
    result = subprocess.run(
        command, cwd=workdir, env=clean_environment() if environment is None else environment,
        check=False,
        stdout=subprocess.PIPE if quiet else None,
        stderr=subprocess.STDOUT if quiet else None,
        text=True,
        input=input_text,
    )
    if quiet and check and result.returncode:
        # Supabase startup prints generated credentials. Never publish that output.
        print("Command failed; credential-bearing startup output was suppressed.", flush=True)
    if check and result.returncode:
        raise subprocess.CalledProcessError(result.returncode, command)
    return result


def validate(repository, *, staged_upgrade=False):
    execute = partial(run, environment=local_docker_environment(repository))
    source = tomllib.loads((repository / "supabase/config.toml").read_text())
    held_ports = reserve_ports(len(list(port_fields(source))))
    workdir = Path(tempfile.mkdtemp(prefix="t2t-ci-db-"))
    project_id = workdir.name
    container = f"supabase_db_{project_id}"
    runner = f"supabase_pgprove_{project_id}"
    started = False
    runner_started = False
    try:
        ports = [sock.getsockname()[1] for sock in held_ports]
        config = prepare_project(repository, workdir, project_id, ports)
        if staged_upgrade:
            for name in STAGED_UPGRADE_MIGRATIONS:
                (workdir / "supabase/migrations" / name).unlink()
        print(f"Disposable project: {project_id}; directory: {workdir}", flush=True)
        print("Ports: " + ", ".join(
            f"{'.'.join(field)}={port}"
            for field, port in zip(port_fields(config), ports)
        ), flush=True)
        migrations = sorted((workdir / "supabase/migrations").glob("*.sql"))
        print(f"Replay: {len(migrations)} migrations, {migrations[0].name} "
              f"through {migrations[-1].name}; staged upgrade: {staged_upgrade}", flush=True)
        execute(["supabase", "--version"], workdir)
        for sock in held_ports:
            sock.close()
        started = True  # Partial startup also needs exact-project cleanup.
        execute(["supabase", "start", "--exclude", EXCLUDED_SERVICES], workdir, quiet=True)
        psql = ["docker", "exec", "-e", "PGPASSWORD=postgres", container,
                "psql", "-U", "supabase_admin",
                "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
        execute([*psql, "-c", "SHOW server_version;"], workdir)
        # Known 17.6.1.106 supautils denial-hint crash; only this new DB is changed.
        # Grants, RLS, SQLSTATE expectations and test assertions remain intact.
        execute([*psql, "-c", "ALTER SYSTEM SET supautils.hint_roles = '';",
             "-c", "SELECT pg_reload_conf();"], workdir)
        if staged_upgrade:
            for name in STAGED_UPGRADE_FIXTURES:
                fixture = workdir / "supabase/migration-tests" / name
                execute([*psql[:2], "-i", *psql[2:]], workdir, input_text=fixture.read_text())
            for name in STAGED_UPGRADE_MIGRATIONS:
                shutil.copy2(repository / "supabase/migrations" / name,
                             workdir / "supabase/migrations" / name)
            # These held migrations can now sort before newer, already applied
            # migrations. CLI requires --include-all for that staged replay.
            execute(["supabase", "migration", "up", "--local", "--yes", "--include-all"], workdir)
            runner_started = True
            for name in STAGED_UPGRADE_CONTRACTS:
                execute([
                    "docker", "run", "--rm", "--name", runner,
                    "--network", f"supabase_network_{project_id}",
                    "--mount", f"type=bind,src={workdir / 'supabase'},dst=/tests,readonly",
                    "-e", "PGHOST=db", "-e", "PGPORT=5432", "-e", "PGUSER=postgres",
                    "-e", "PGPASSWORD=postgres", "-e", "PGDATABASE=postgres",
                    PG_PROVE_IMAGE, "pg_prove", "--verbose",
                    f"/tests/migration-tests/{name}",
                ], workdir)
            print("Populated account setup, Training, Critical Tasks, Calendar, Personnel, counseling file and Rating Scheme upgrades passed.", flush=True)
            return
        execute(["npm", "run", "db:test"], workdir)
        runner_started = True
        for migration_test in (
            "calendar_group_assignees.sql",
            "account_setup_claim_gate.sql",
            "account_setup_staff_release.sql",
        ):
            execute([
                "docker", "run", "--rm", "--name", runner,
                "--network", f"supabase_network_{project_id}",
                "--mount", f"type=bind,src={workdir / 'supabase'},dst=/tests,readonly",
                "-e", "PGHOST=db", "-e", "PGPORT=5432", "-e", "PGUSER=postgres",
                "-e", "PGPASSWORD=postgres", "-e", "PGDATABASE=postgres",
                PG_PROVE_IMAGE, "pg_prove", "--verbose",
                f"/tests/migration-tests/{migration_test}",
            ], workdir)
        # Exercise actual GoTrue admin calls after historical migration
        # reapplication tests. The provider probe persists new failure reasons
        # that older migrations correctly did not know about.
        status_output = execute(["supabase", "status", "-o", "json"], workdir, quiet=True).stdout
        # CLI notices can precede or follow the JSON because quiet mode
        # combines stdout and stderr; never print the credential-bearing body.
        json_start = status_output.find("{")
        if json_start < 0:
            raise RuntimeError("Disposable Supabase status contained no JSON")
        status, _ = json.JSONDecoder().raw_decode(status_output[json_start:])
        provider_environment = local_docker_environment(repository)
        provider_environment.update({
            "T2T_PROBE_API_URL": status["API_URL"],
            "T2T_PROBE_SERVICE_KEY": status["SERVICE_ROLE_KEY"],
            "T2T_PROBE_ANON_KEY": status["ANON_KEY"],
        })
        run(["node", str(repository / "scripts/ci/account_setup_provider_probe.mjs")],
            workdir, environment=provider_environment)
        run(["node", str(repository / "scripts/ci/personnel_roster_provider_probe.mjs")],
            workdir, environment=provider_environment)
        print("Fresh replay, SQL contracts, migration regressions and provider probes passed.", flush=True)
    finally:
        for sock in held_ports:
            sock.close()
        # A second termination signal must not interrupt cleanup of our own resources.
        previous_handlers = {}
        for sig in (signal.SIGINT, signal.SIGTERM):
            previous_handlers[sig] = signal.signal(sig, signal.SIG_IGN)
        try:
            if runner_started:
                execute(["docker", "rm", "--force", runner], workdir, quiet=True, check=False)
            if started:
                execute(["supabase", "stop", "--project-id", project_id, "--no-backup"], workdir)
            shutil.rmtree(workdir)
            print(f"Cleaned up disposable project {project_id}.", flush=True)
        finally:
            for sig, handler in previous_handlers.items():
                signal.signal(sig, handler)


def main():
    def interrupted(signum, _frame):
        raise SystemExit(128 + signum)

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, interrupted)
    try:
        repository = Path(__file__).resolve().parents[2]
        validate(repository)
        validate(repository, staged_upgrade=True)
    except (subprocess.CalledProcessError, OSError, ValueError, RuntimeError) as error:
        print(f"Database validation failed: {error}", flush=True)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
