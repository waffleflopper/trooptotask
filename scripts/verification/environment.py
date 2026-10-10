#!/usr/bin/env python3
"""Owned, disposable provider lifecycle; composes the existing CI isolation code."""

import argparse
import base64
import contextlib
import hashlib
import hmac
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time
import tomllib
from urllib.parse import urlsplit
import uuid


class Blocked(Exception):
    """Safe public failure, without provider command output."""


def save(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w") as output:
        json.dump(value, output)


def private_session(value):
    path = Path(value).absolute()
    if path.is_symlink() or path.resolve() != path:
        raise Blocked("Session must be a real absolute directory without symlink ancestors.")
    stat = path.stat()
    if not path.is_dir() or stat.st_uid != os.getuid() or stat.st_mode & 0o077:
        raise Blocked("Create a private session directory owned by you with mode 0700.")
    return path


def load_database(repository):
    spec = importlib.util.spec_from_file_location("verification_database", repository / "scripts/ci/database.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def execute(command, directory, environment, *, suppress_diagnostic=False):
    result = subprocess.run(command, cwd=directory, env=environment, capture_output=True, text=True)
    if result.returncode:
        # The controlled psql command contains no provider tokens. Other outputs
        # (especially Supabase startup and Docker inspect) may contain credentials.
        diagnostic = result.stderr[-4000:] if command[:2] == ["docker", "exec"] and not suppress_diagnostic else "Credential-bearing provider output suppressed."
        save(directory / "last-error.json", {"operation": command[:2], "exit": result.returncode, "diagnostic": diagnostic})
        raise Blocked(f"{command[0]} {command[1]} failed (exit {result.returncode}); inspect private provider/last-error.json, then retry cleanup.")
    return result.stdout


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def owned(session):
    marker = session / "environment.json"
    if marker.is_symlink():
        raise Blocked("Ownership marker is a symlink; refusing this target.")
    state = json.loads(marker.read_text())
    project = state.get("project", "")
    if (state.get("version") != 1 or state.get("session") != str(session)
            or not re.fullmatch(r"t2t-verify-[0-9a-f]{24}", project)):
        raise Blocked("Missing or foreign provider ownership; create a new toolkit session.")
    workdir = session / "provider"
    config_path = workdir / "supabase/config.toml"
    if workdir.resolve() != workdir or config_path.resolve() != config_path:
        raise Blocked("Provider directory was replaced by a symlink; refusing this target.")
    config = tomllib.loads(config_path.read_text())
    if config.get("project_id") != project or digest(config_path) != state["config_sha256"]:
        raise Blocked("Provider configuration changed after creation; refusing stale ownership.")
    database = load_database(Path(state["repository"]))
    environment = database.clean_environment()
    for key in ("DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"):
        environment.pop(key, None)
    endpoint = urlsplit(state["docker_host"])
    if endpoint.scheme != "unix" or endpoint.netloc or not endpoint.path.startswith("/"):
        raise Blocked("Only the original local Docker Unix socket is allowed.")
    environment["DOCKER_HOST"] = state["docker_host"]
    return state, workdir, environment


def containers(state, workdir, environment):
    output = execute(["docker", "ps", "--all", "--filter", f"label=com.supabase.cli.project={state['project']}",
                      "--format", "{{.ID}}"], workdir, environment)
    ids = output.split()
    if not ids:
        return []
    records = json.loads(execute(["docker", "inspect", *ids], workdir, environment))
    for item in records:
        labels = item["Config"].get("Labels") or {}
        if (labels.get("com.supabase.cli.project") != state["project"]
                or labels.get("com.docker.compose.project") != state["project"]
                or not item["Name"].endswith("_" + state["project"])):
            raise Blocked("Docker ownership labels disagree; refusing foreign resources.")
    if state.get("container_ids") and any(item["Id"] not in state["container_ids"] for item in records):
        raise Blocked("Provider containers were replaced; refusing stale or foreign resources.")
    return records


def cleanup(session):
    state, workdir, environment = owned(session)
    containers(state, workdir, environment)
    execute(["supabase", "stop", "--project-id", state["project"], "--no-backup"], workdir, environment)
    if containers(state, workdir, environment):
        raise Blocked("Owned provider containers remain; retry cleanup before removing the session.")
    (session / "provider.json").unlink(missing_ok=True)
    state["phase"] = "cleaned"
    save(session / "environment.json", state)
    return {"status": "PASS", "project": state["project"], "phase": "cleaned"}


def status(session):
    state, workdir, environment = owned(session)
    provider_path = session / "provider.json"
    if provider_path.is_symlink() or digest(provider_path) != state.get("provider_sha256"):
        raise Blocked("Provider credentials changed after creation; refusing a foreign endpoint. Cleanup and launch again.")
    provider = json.loads(provider_path.read_text())
    api = urlsplit(provider["API_URL"])
    if (api.scheme != "http" or api.hostname != "127.0.0.1"
            or api.port != state["ports"]["api.port"] or api.username or api.password):
        raise Blocked("Provider endpoint does not match the owned allocation; refusing to drive it.")
    records = containers(state, workdir, environment)
    running = {item["Name"].removeprefix("/") for item in records if item["State"]["Running"]}
    required = [f"supabase_{name}_{state['project']}" for name in ("db", "auth", "rest", "kong", "storage")]
    missing = [name for name in required if name not in running]
    if state["phase"] != "running" or missing:
        raise Blocked("Owned provider is unavailable or incomplete; cleanup this session and launch a new one.")
    return {"status": "PASS", "project": state["project"], "phase": "running", "ports": state["ports"]}


REVIEW_FAILURE_PREFIX = "t2t_verify_review_fail_"
REVIEW_FAILURE_FILE = "deletion-review-failure.json"
REVIEW_SOURCE_TABLES = {
    "personnel": "personnel", "training_type": "training_types",
    "personnel_training": "personnel_trainings", "counseling_record": "counseling_records",
    "rating_scheme_entry": "rating_scheme_entries",
}


def save_review_failure_receipt(session, control):
    """Keep the previous complete ownership witness until its replacement is durable."""
    descriptor, filename = tempfile.mkstemp(prefix=".deletion-review-failure-", suffix=".tmp", dir=session)
    temporary = Path(filename)
    try:
        with os.fdopen(descriptor, "w") as output:
            json.dump(control, output)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, session / REVIEW_FAILURE_FILE)
        directory = os.open(session, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def canonical_uuid(value):
    try:
        if not isinstance(value, str) or str(uuid.UUID(value)) != value:
            raise ValueError()
    except ValueError:
        raise Blocked("Use a canonical lowercase UUID for the synthetic request and target.") from None
    return value


def private_json(path):
    if path.is_symlink() or path.resolve() != path:
        raise Blocked("Verification control ownership file was replaced by a symlink.")
    info = path.stat()
    if not path.is_file() or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise Blocked("Verification control ownership files must be private and owned by you.")
    return json.loads(path.read_text())


def review_failure_definition(control):
    return f"CHECK (((id <> '{control['request_id']}'::uuid) OR (status <> 'approved'::text))) NOT VALID"


def review_failure_comment(control):
    return f"{control['project']}:{control['nonce']}:{control['request_id']}"


class OwnedDatabase:
    """Fixed operations on the verified disposable database; no caller SQL or DSN."""

    def __init__(self, session):
        status(session)
        self.state, self.workdir, self.environment = owned(session)
        records = containers(self.state, self.workdir, self.environment)
        expected = f"/supabase_db_{self.state['project']}"
        database = [item for item in records if item["Name"] == expected and item["State"]["Running"]]
        if len(database) != 1 or database[0]["Id"] not in self.state.get("container_ids", []):
            raise Blocked("The original owned database container is unavailable; refusing this control.")
        self.container_id = database[0]["Id"]
        self.project = self.state["project"]

    def _execute(self, sql):
        return execute(["docker", "exec", "-e", "PGPASSWORD=postgres", self.container_id,
                        "psql", "-X", "-qAt", "-h", "127.0.0.1", "-p", "5432",
                        "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql],
                       self.workdir, self.environment, suppress_diagnostic=True)

    def totp_factor(self, user_id):
        output = self._execute(f"""
            SET statement_timeout = '10s';
            SELECT row_to_json(factor) FROM
              (SELECT f.secret, f.status::text AS status FROM auth.mfa_factors f
               JOIN auth.users u ON u.id = f.user_id
               WHERE f.user_id = '{user_id}'::uuid AND f.factor_type = 'totp'
                 AND u.email LIKE '%@example.test'
               ORDER BY f.created_at DESC LIMIT 1) AS factor;
        """).strip()
        return json.loads(output) if output else None


class ReviewFailureDatabase(OwnedDatabase):
    def snapshot(self, request_id=None):
        target = f"id = '{request_id}'::uuid" if request_id else "false"
        output = self._execute(f"""
            SET statement_timeout = '10s';
            SELECT json_build_object(
              'request', (SELECT row_to_json(request) FROM
                (SELECT id, organization_id, resource_type, resource_id, status
                 FROM public.deletion_requests WHERE {target}) AS request),
              'constraints', (SELECT COALESCE(json_agg(row_to_json(control) ORDER BY control.name), '[]'::json)
                FROM (SELECT conname AS name, contype AS type, convalidated AS validated,
                             pg_get_constraintdef(oid, false) AS definition,
                             obj_description(oid, 'pg_constraint') AS comment
                      FROM pg_constraint WHERE conrelid = 'public.deletion_requests'::regclass
                        AND left(conname, {len(REVIEW_FAILURE_PREFIX)}) = '{REVIEW_FAILURE_PREFIX}') AS control));
        """)
        return json.loads(output)

    def arm(self, control):
        # The lock repeats admission at the mutation boundary, closing the preflight race.
        self._execute(f"""
            BEGIN;
            SET LOCAL lock_timeout = '5s';
            SET LOCAL statement_timeout = '10s';
            LOCK TABLE public.deletion_requests IN ACCESS EXCLUSIVE MODE;
            DO $verification$ BEGIN
              IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.deletion_requests'::regclass
                         AND left(conname, {len(REVIEW_FAILURE_PREFIX)}) = '{REVIEW_FAILURE_PREFIX}') THEN
                RAISE EXCEPTION 'A verification constraint already exists';
              END IF;
              IF NOT EXISTS (SELECT 1 FROM public.deletion_requests
                WHERE id = '{control['request_id']}'::uuid AND organization_id = '{control['organization_id']}'::uuid
                  AND resource_type = '{control['resource_type']}' AND resource_id = '{control['resource_id']}'::uuid
                  AND status = 'pending') THEN
                RAISE EXCEPTION 'The owned pending verification request changed';
              END IF;
            END $verification$;
            ALTER TABLE public.deletion_requests ADD CONSTRAINT {control['constraint']}
              CHECK (id <> '{control['request_id']}'::uuid OR status <> 'approved'::text) NOT VALID;
            COMMENT ON CONSTRAINT {control['constraint']} ON public.deletion_requests
              IS '{review_failure_comment(control)}';
            COMMIT;
        """)

    def restore(self, control):
        self._execute(f"""
            BEGIN;
            SET LOCAL lock_timeout = '5s';
            SET LOCAL statement_timeout = '10s';
            LOCK TABLE public.deletion_requests IN ACCESS EXCLUSIVE MODE;
            DO $verification$ BEGIN
              IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.deletion_requests'::regclass
                         AND left(conname, {len(REVIEW_FAILURE_PREFIX)}) = '{REVIEW_FAILURE_PREFIX}'
                         AND conname <> '{control['constraint']}') OR NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conrelid = 'public.deletion_requests'::regclass
                  AND conname = '{control['constraint']}' AND contype = 'c' AND NOT convalidated
                  AND pg_get_constraintdef(oid, false) = $definition${review_failure_definition(control)}$definition$
                  AND obj_description(oid, 'pg_constraint') = '{review_failure_comment(control)}') THEN
                RAISE EXCEPTION 'Verification constraint ownership changed';
              END IF;
            END $verification$;
            ALTER TABLE public.deletion_requests DROP CONSTRAINT {control['constraint']};
            COMMIT;
        """)


def review_failure_receipt(session, database):
    path = session / REVIEW_FAILURE_FILE
    if not path.exists() and not path.is_symlink():
        return None
    control = private_json(path)
    if (control.get("version") != 1 or control.get("session") != str(session)
            or control.get("project") != database.project or control.get("container_id") != database.container_id
            or not isinstance(control.get("nonce"), str) or not re.fullmatch(r"[0-9a-f]{32}", control["nonce"])
            or control.get("constraint") != REVIEW_FAILURE_PREFIX + control["nonce"]
            or control.get("resource_type") not in REVIEW_SOURCE_TABLES
            or control.get("phase") not in ("arming", "armed", "restoring")):
        raise Blocked("Missing or foreign review-failure ownership; refusing to adopt or remove a constraint.")
    for field in ("request_id", "organization_id", "resource_id"):
        canonical_uuid(control.get(field))
    return control


def check_review_failure_constraints(snapshot, control):
    constraints = snapshot["constraints"]
    if not constraints:
        return False
    if (not control or len(constraints) != 1 or constraints[0].get("name") != control["constraint"]
            or constraints[0].get("type") != "c" or constraints[0].get("validated") is not False
            or constraints[0].get("definition") != review_failure_definition(control)
            or constraints[0].get("comment") != review_failure_comment(control)):
        raise Blocked("A foreign or changed verification constraint exists; refusing to adopt or remove it.")
    return True


def admit_review_failure_request(session, request):
    if not request or request.get("status") != "pending":
        raise Blocked("Use an existing pending request for a helper-owned deletion source.")
    resource_type = request.get("resource_type")
    if resource_type not in REVIEW_SOURCE_TABLES:
        raise Blocked("The request has an unsupported verification source.")
    canonical_uuid(request.get("resource_id"))
    fixtures = private_json(session / "fixtures.json")
    ledger = private_json(session / "verify-trooptotask-owned.json")
    organizations = {canonical_uuid(fixtures["ids"][key]): key for key in ("orgA", "orgB")}
    organization = organizations.get(request.get("organization_id"))
    if not organization or not any(
        isinstance(item, dict) and item.get("kind") == "deletion-sources" and item.get("organization") == organization
        and item.get("table") == REVIEW_SOURCE_TABLES[resource_type] and isinstance(item.get("ids"), list)
        and request["resource_id"] in item["ids"]
        for item in ledger.get("seeded", [])
    ):
        raise Blocked("The request target is not a saved helper-owned deletion source in fixture A or B.")


def deletion_review_failure(session, action, request_id=None):
    if action not in ("arm", "restore", "state"):
        raise Blocked("Use deletion-review-failure arm, restore or state.")
    if request_id is not None:
        canonical_uuid(request_id)
    if action == "arm" and request_id is None:
        raise Blocked("Arming requires the exact synthetic pending request UUID.")
    database = ReviewFailureDatabase(session)
    control = review_failure_receipt(session, database)
    if control and request_id is not None and request_id != control["request_id"]:
        raise Blocked("Restore the saved review-failure control before targeting another request.")
    snapshot = database.snapshot(control["request_id"] if control else request_id)
    armed = check_review_failure_constraints(snapshot, control)
    restored = False
    if action == "arm":
        request = snapshot["request"]
        if not request or request.get("id") != request_id:
            raise Blocked("The exact synthetic pending request was not returned; refusing this target.")
        admit_review_failure_request(session, request)
        if control and any(request[field] != control[field] for field in ("organization_id", "resource_type", "resource_id")):
            raise Blocked("The saved review-failure target changed; restore the control first.")
        if not control:
            nonce = uuid.uuid4().hex
            control = {"version": 1, "session": str(session), "project": database.project,
                       "container_id": database.container_id, "nonce": nonce,
                       "constraint": REVIEW_FAILURE_PREFIX + nonce, "request_id": request_id,
                       "organization_id": request["organization_id"], "resource_type": request["resource_type"],
                       "resource_id": request["resource_id"], "phase": "arming"}
        # Retain the receipt if installation or its readback is interrupted.
        control["phase"] = "arming"
        save_review_failure_receipt(session, control)
        if not armed:
            database.arm(control)
        armed = check_review_failure_constraints(database.snapshot(control["request_id"]), control)
        if not armed:
            raise Blocked("Review-failure installation was not confirmed; restore this session's control.")
        control["phase"] = "armed"
        save_review_failure_receipt(session, control)
    elif action == "restore" and control:
        control["phase"] = "restoring"
        save_review_failure_receipt(session, control)
        if armed:
            database.restore(control)
            restored = True
        if check_review_failure_constraints(database.snapshot(control["request_id"]), control):
            raise Blocked("The owned review-failure constraint remains; retry restoration.")
        (session / REVIEW_FAILURE_FILE).unlink()
        armed = False
    return {"status": "PASS", "armed": armed, "restored": restored,
            "phase": control["phase"] if control and action != "restore" else "clear",
            "target": {key: control[key] for key in ("request_id", "organization_id", "resource_type", "resource_id")}
            if control else None}


def totp(secret, at):
    """RFC 6238 SHA-1, 30-second, 6-digit code: the provider's TOTP parameters."""
    key = base64.b32decode(secret.upper() + "=" * (-len(secret) % 8))
    digest_bytes = hmac.new(key, int(at // 30).to_bytes(8, "big"), hashlib.sha1).digest()
    offset = digest_bytes[-1] & 0x0F
    return f"{(int.from_bytes(digest_bytes[offset:offset + 4], 'big') & 0x7FFFFFFF) % 1_000_000:06d}"


def totp_code(session, user_id, at=None):
    # The secret stays in this process; callers receive only the current short-lived code.
    user_id = canonical_uuid(user_id)
    factor = OwnedDatabase(session).totp_factor(user_id)
    if not factor or not re.fullmatch(r"[A-Z2-7]+=*", factor.get("secret") or ""):
        raise Blocked("No readable TOTP factor exists for this synthetic account.")
    return {"status": "PASS", "factor": factor["status"], "code": totp(factor["secret"], time.time() if at is None else at)}


def verification_auth_config(config, origin):
    config["auth"]["site_url"] = origin
    config["auth"]["additional_redirect_urls"] = [origin]
    # The app's MFA challenge and account security use Supabase TOTP, which the
    # repository's local config leaves off. Enable it only for this disposable
    # provider; signup, password policies and all abuse limits stay as configured.
    config["auth"]["mfa"]["totp"]["enroll_enabled"] = True
    config["auth"]["mfa"]["totp"]["verify_enabled"] = True
    return config


def verification_excluded_services(excluded):
    """CI's exclusions minus the services verification journeys use."""
    # Sign-in Roster verification exercises real private PDF upload/download. The
    # provider sends email-change confirmations itself; without its local Mailpit
    # capture the change fails and Account Security cannot reach its pending state.
    return ",".join(service for service in excluded.split(",") if service not in ("storage-api", "mailpit"))


def create(session, repository, origin):
    if (session / "environment.json").exists() or (session / "provider").exists():
        raise Blocked("This session already has provider state; use status or cleanup, never adopt it.")
    repository = Path(repository).resolve()
    if session.is_relative_to(repository):
        raise Blocked("Provider sessions must live outside the source checkout.")
    parsed = urlsplit(origin)
    if (parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or not parsed.port
            or parsed.username or parsed.password or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise Blocked("App origin must be http://127.0.0.1:<owned-app-port>.")
    database = load_database(repository)
    # Existing CI helper logs commands; capture those so stdout stays JSON-only.
    with contextlib.redirect_stdout(io.StringIO()):
        environment = database.local_docker_environment(repository)
    source = tomllib.loads((repository / "supabase/config.toml").read_text())
    held = database.reserve_ports(len(list(database.port_fields(source))))
    workdir = session / "provider"
    workdir.mkdir(mode=0o700)
    # Supabase CLI truncates IDs at 40 chars, including in resource labels.
    # Keep the entire chosen identity below that limit (35 chars / 96 random bits).
    project = "t2t-verify-" + uuid.uuid4().hex[:24]
    attempted = False
    try:
        ports = [sock.getsockname()[1] for sock in held]
        config = database.prepare_project(repository, workdir, project, ports)
        verification_auth_config(config, origin)
        config_path = workdir / "supabase/config.toml"
        config_path.write_text(database.config_text(config))
        state = {"version": 1, "session": str(session), "repository": str(repository),
                 "project": project, "docker_host": environment["DOCKER_HOST"],
                 "config_sha256": digest(config_path), "phase": "starting",
                 "ports": {".".join(field): port for field, port in zip(database.port_fields(config), ports)}}
        save(session / "environment.json", state)
        if containers(state, workdir, environment):
            raise Blocked("Allocated project name already exists; refusing to adopt foreign state.")
        for sock in held:
            sock.close()
        attempted = True
        execute(["supabase", "start", "--exclude", verification_excluded_services(database.EXCLUDED_SERVICES)],
                workdir, environment)
        if not containers(state, workdir, environment):
            raise Blocked("Supabase returned success without containers bearing the exact owned project label.")
        # Same pinned-image workaround as CI; applies only to the new disposable DB.
        execute(["docker", "exec", "-e", "PGPASSWORD=postgres", f"supabase_db_{project}",
                 "psql", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
                 "-c", "ALTER SYSTEM SET supautils.hint_roles = '';", "-c", "SELECT pg_reload_conf();"],
                workdir, environment)
        output = execute(["supabase", "status", "-o", "json"], workdir, environment)
        provider, _ = json.JSONDecoder().raw_decode(output[output.index("{"):])
        api = urlsplit(provider["API_URL"])
        if api.hostname not in ("127.0.0.1", "localhost") or api.port != config["api"]["port"]:
            raise Blocked("Provider returned a foreign endpoint; refusing credentials.")
        save(session / "provider.json", {key: provider[key] for key in ("API_URL", "ANON_KEY", "SERVICE_ROLE_KEY")})
        state["provider_sha256"] = digest(session / "provider.json")
        state["container_ids"] = [item["Id"] for item in containers(state, workdir, environment)]
        state["phase"] = "running"
        save(session / "environment.json", state)
        return status(session)
    except BaseException:
        if attempted:
            # Retain the ownership marker when cleanup fails so it can be retried.
            try:
                cleanup(session)
            except Exception:
                pass
        raise
    finally:
        for sock in held:
            sock.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)
    new = subcommands.add_parser("create", help="Create only a new disposable provider in a private session directory")
    new.add_argument("session")
    new.add_argument("repository")
    new.add_argument("origin")
    for command in ("status", "cleanup"):
        subcommands.add_parser(command).add_argument("session")
    failure = subcommands.add_parser("deletion-review-failure", help="Control one helper-owned synthetic review status failure")
    failure.add_argument("session")
    failure.add_argument("action", choices=("arm", "restore", "state"))
    failure.add_argument("request_id", nargs="?")
    code = subcommands.add_parser("totp-code", help="Return only the current code for one synthetic account's newest TOTP factor")
    code.add_argument("session")
    code.add_argument("user_id")
    args = parser.parse_args()
    try:
        session = private_session(args.session)
        if args.command == "totp-code":
            result = totp_code(session, args.user_id)
        elif args.command == "deletion-review-failure":
            result = deletion_review_failure(session, args.action, args.request_id)
        else:
            result = create(session, args.repository, args.origin) if args.command == "create" else globals()[args.command](session)
        print(json.dumps(result))
    except Exception as error:
        message = str(error) if isinstance(error, Blocked) else "Provider prerequisite or ownership check failed; check local tooling and the private session marker, then retry cleanup."
        print(json.dumps({"status": "BLOCKED", "code": "PROVIDER_UNAVAILABLE_OR_UNOWNED", "message": message}))
        raise SystemExit(2) from None


if __name__ == "__main__":
    def interrupted(_signum, _frame):
        raise Blocked("Provider operation interrupted; run cleanup for this session.")

    for termination in (signal.SIGINT, signal.SIGTERM):
        signal.signal(termination, interrupted)
    main()
