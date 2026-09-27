#!/usr/bin/env python3
"""Owned, disposable provider lifecycle; composes the existing CI isolation code."""

import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import signal
import subprocess
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


def execute(command, directory, environment):
    result = subprocess.run(command, cwd=directory, env=environment, capture_output=True, text=True)
    if result.returncode:
        # The controlled psql command contains no provider tokens. Other outputs
        # (especially Supabase startup and Docker inspect) may contain credentials.
        diagnostic = result.stderr[-4000:] if command[:2] == ["docker", "exec"] else "Credential-bearing provider output suppressed."
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
    required = [f"supabase_{name}_{state['project']}" for name in ("db", "auth", "rest", "kong")]
    missing = [name for name in required if name not in running]
    if state["phase"] != "running" or missing:
        raise Blocked("Owned provider is unavailable or incomplete; cleanup this session and launch a new one.")
    return {"status": "PASS", "project": state["project"], "phase": "running", "ports": state["ports"]}


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
        config["auth"]["site_url"] = origin
        config["auth"]["additional_redirect_urls"] = [origin]
        # Keep signup, password policies, and all abuse limits exactly as configured.
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
        execute(["supabase", "start", "--exclude", database.EXCLUDED_SERVICES], workdir, environment)
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
    args = parser.parse_args()
    try:
        session = private_session(args.session)
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
