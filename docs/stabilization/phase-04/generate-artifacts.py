"""Capture metadata from an already-created Phase 04 disposable local replay.

Does not start, migrate, seed, reset or stop a database. See generation-baseline.md.
"""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tomllib


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def main():
    require(len(sys.argv) == 3, "Usage: generate-artifacts.py ISOLATED_WORKDIR NEW_OUTPUT_DIR")
    source = Path(__file__).resolve().parent
    repo = source.parents[2]
    work, output = [Path(arg).resolve() for arg in sys.argv[1:]]
    require(not work.is_relative_to(repo), "Workspace must be outside the repository")
    config = tomllib.loads((work / "supabase/config.toml").read_text())
    project = config["project_id"]
    require(re.fullmatch(r"t3-phase04-[a-z0-9-]+", project), "Expected a Phase 04 disposable project")
    require(config["db"]["seed"] == {"enabled": False, "sql_paths": []}, "Seeds must be disabled")
    require(not list(work.glob(".env*")), "Workspace must not contain environment files")
    require(not (work / "supabase/.temp/project-ref").exists(), "Linked projects are forbidden")
    port = config["db"]["port"]
    require(port >= 1024 and port // 100 not in (543, 553, 563), "Protected database port")
    container = "supabase_db_" + project
    env = {key: os.environ[key] for key in ("PATH", "HOME", "USER", "XDG_RUNTIME_DIR") if key in os.environ}

    def read(command):
        return subprocess.check_output(command, env=env, text=True).strip()

    info = json.loads(read(["docker", "inspect", container]))[0]
    require(info["State"]["Running"], "Disposable database must already be running")
    bindings = info["HostConfig"]["PortBindings"]["5432/tcp"]
    require(bindings and all(int(item["HostPort"]) == port for item in bindings), "Container port mismatch")
    psql = ["docker", "exec", "-i", container, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
    migrations = sorted((repo / "supabase/migrations").glob("*.sql"))
    copies = sorted((work / "supabase/migrations").glob("*.sql"))
    require([p.name for p in copies] == [p.name for p in migrations], "Migration file list mismatch")
    hashes = {}
    for original, copied in zip(migrations, copies):
        require(original.read_bytes() == copied.read_bytes(), "Migration content mismatch: " + original.name)
        hashes[original.name] = hashlib.sha256(original.read_bytes()).hexdigest()
    ledger = read(psql + ["-c", "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version"]).splitlines()
    require(ledger == [p.name.split("_")[0] for p in migrations], "Migration ledger mismatch")
    require(not output.exists(), "Refusing to overwrite an output directory")
    output.mkdir(parents=True)
    commands = [
        ("database-baseline.types.ts", ["supabase", "gen", "types", "--local", "--lang", "typescript", "--schema", "public", "--workdir", str(work)]),
        ("schema-baseline.sql", ["supabase", "db", "dump", "--local", "--schema", "public", "--workdir", str(work)]),
        ("catalog.jsonl", psql),
    ]
    receipts = []
    for name, command in commands:
        with (output / name).open("w") as stdout, (output / (name + ".stderr")).open("w") as stderr:
            result = subprocess.run(command, env=env, text=True,
                                    input=(source / "catalog.sql").read_text() if name == "catalog.jsonl" else None,
                                    stdout=stdout, stderr=stderr)
        receipts.append({"command": command, "exit": result.returncode})
        (output / "commands.json").write_text(json.dumps(receipts, indent=2) + "\n")
        require(result.returncode == 0, "Generation failed; inspect " + str(output / (name + ".stderr")))
        require((output / name).stat().st_size > 0, "Empty generated artifact: " + name)
    catalog, environment = [json.loads(line) for line in (output / "catalog.jsonl").read_text().splitlines()]
    (output / "catalog.json").write_text(json.dumps({**catalog, **environment}, indent=2) + "\n")
    receipt = {
        "workdir": str(work), "project": project, "database_port": port,
        "supabase": read(["supabase", "--version"]),
        "postgres": read(psql + ["-c", "SHOW server_version"]),
        "pg_dump": read(["docker", "exec", container, "pg_dump", "--version"]),
        "migration_sha256": hashes,
        "artifact_sha256": {name: hashlib.sha256((output / name).read_bytes()).hexdigest()
                            for name in ("database-baseline.types.ts", "schema-baseline.sql", "catalog.json")},
    }
    (output / "generation.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print("Captured schema, types and catalog:", output)


if __name__ == "__main__":
    main()
