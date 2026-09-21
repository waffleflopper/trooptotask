# Phase 04 pre-retirement replay baseline

Owned by [D01 #1309](https://github.com/waffleflopper/trooptotask/issues/1309), leaf 04-01a. This reproduces the immutable pre-retirement chain and its existing SQL contracts. Effective dependency classification/generation belongs to 04-01b; populated retained/commercial upgrade fixtures and owner preflight belong to 04-01c. No retirement migration or production readiness is claimed.

## Inputs and isolation

Run from the repository root with Python 3.11+, Docker, Supabase CLI 2.101.0 and npm 11.12.1 available. The replay uses the installed `public.ecr.aws/supabase/postgres:17.6.1.155` image. The 156 [input hashes](replay-inputs.sha256) cover all 133 migrations, 19 SQL tests, two auth templates, `package.json` and source `supabase/config.toml`; verify with `sha256sum --check docs/stabilization/phase-04/replay-inputs.sha256`. Do not read or copy `supabase/seed.sql`, repository `.env*`, remote links or existing local database state.

The original execution receipts covered 154 inputs. PR review added the two unchanged configuration/package inputs to close that provenance gap; those historical receipts remain unchanged. Setup now rejects input drift before allocating a workspace and records both source hashes and exact copied hashes, including the intentionally transformed disposable configuration. Do not refresh expected hashes merely to pass a changed input; review a changed replay candidate and its commands first.

The setup refuses an existing workspace/project and occupied IPv4/IPv6 ports. It copies only the audited inputs, changes the project and all service ports, disables seeds with an empty path list, and pins the local image. Run the following once in a new receipt directory. For another run, change the receipt path/project/port allocation together after checking availability; never reuse/reset an existing stack. The recorded run uses `/tmp/t3-phase04-01a-final/isolated`, project `t3-phase04-01a-final`, ports 60320–60327 and 60329 plus 24383. Existing 543xx/553xx/563xx stacks are excluded.

```bash
mkdir -p /tmp/t3-phase04-01a-final
python - <<'PY'
from pathlib import Path
import hashlib, json, os, re, shutil, socket, subprocess, tomllib

repo = Path.cwd()
receipt = Path('/tmp/t3-phase04-01a-final')
work = receipt / 'isolated'
project = 't3-phase04-01a-final'
ports = [60320, 60321, 60322, 60323, 60324, 60325, 60326, 60327, 60329, 24383]
inputs = [repo / 'package.json', repo / 'supabase/config.toml']
for directory in ['migrations', 'tests', 'templates']:
    inputs.extend(file for file in sorted((repo / 'supabase' / directory).glob('*')) if file.is_file())
manifest = {str(file.relative_to(repo)): hashlib.sha256(file.read_bytes()).hexdigest() for file in inputs}
expected = {}
for line in (repo / 'docs/stabilization/phase-04/replay-inputs.sha256').read_text().splitlines():
    digest, relative = line.split('  ', 1)
    expected[relative] = digest
assert manifest == expected, 'Replay inputs differ from the reviewed manifest; stop for review'
assert not work.exists(), 'Refusing to reuse an existing database workspace'
for resource in ['container', 'volume', 'network']:
    result = subprocess.run(['docker', resource, 'ls', '-a'] if resource == 'container' else ['docker', resource, 'ls'], capture_output=True, text=True, check=True)
    assert project not in result.stdout, 'Project already exists: ' + resource
    (receipt / (resource + '-before.txt')).write_text(result.stdout)
for port in ports:
    for family, address in [(socket.AF_INET, '0.0.0.0'), (socket.AF_INET6, '::')]:
        with socket.socket(family) as sock:
            sock.bind((address, port))
config = (repo / 'supabase/config.toml').read_text()
config = re.sub(r'^project_id = .*$', 'project_id = "' + project + '"', config, flags=re.M)
for old in [56320, 56321, 56322, 56323, 56324, 56325, 56326, 56327, 56329]:
    config = config.replace(str(old), str(old + 4000))
config = config.replace('inspector_port = 8283', 'inspector_port = 24383')
config = re.sub(r'\[db.seed\].*?(?=\n\[)', '[db.seed]\nenabled = false\nsql_paths = []\n', config, flags=re.S)
parsed = tomllib.loads(config)
assert parsed['db']['seed'] == {'enabled': False, 'sql_paths': []}
assert parsed['project_id'] == project and parsed['db']['port'] == 60322
(work / 'supabase').mkdir(parents=True)
(work / 'supabase/config.toml').write_text(config)
for directory in ['migrations', 'templates', 'tests']:
    shutil.copytree(repo / 'supabase' / directory, work / 'supabase' / directory)
shutil.copyfile(repo / 'package.json', work / 'package.json')
(work / 'supabase/.temp').mkdir()
(work / 'supabase/.temp/postgres-version').write_text('17.6.1.155')
copied = {}
for relative, digest in manifest.items():
    data = (work / relative).read_bytes()
    copied[relative] = hashlib.sha256(data).hexdigest()
    if relative == 'supabase/config.toml':
        assert data == config.encode(), 'Disposable configuration copy changed'
    else:
        assert copied[relative] == digest, 'Copied input changed: ' + relative
(receipt / 'source-sha256.json').write_text(json.dumps(manifest, indent=2) + '\n')
(receipt / 'copied-sha256.json').write_text(json.dumps(copied, indent=2) + '\n')
(receipt / 'allocation.json').write_text(json.dumps({'project': project, 'workdir': str(work), 'ports': ports, 'postgres_image': '17.6.1.155'}, indent=2) + '\n')
print('Prepared new seed-disabled workspace:', work)
print('Verified source and copied inputs:', len(manifest))
PY
```

## Replay and retained SQL contracts

Inspect the current lifecycle/configuration before running. `npm run db:test` invokes `supabase test db` for each SQL suite; it must execute with the copied workspace as its working directory. No npm install or lifecycle hook is needed there. Migration history includes destructive historical transformations, so never point this replay at an existing database. The concurrency suite opens two connections to its own server and commits then deletes synthetic fixtures; transaction rollback alone would not ensure isolation.

Start with a minimal environment so shell/provider settings cannot select another target. Startup logs may contain disposable credentials: keep raw logs outside the repository and publish only reviewed receipts. Ensure the selected PATH resolves npm 11.12.1.

```bash
python - <<'PY'
from pathlib import Path
import os, subprocess
out = Path('/tmp/t3-phase04-01a-final')
work = out / 'isolated'
env = {k: os.environ[k] for k in ['PATH', 'HOME', 'USER', 'XDG_RUNTIME_DIR'] if k in os.environ}
with (out / 'db-start.log').open('w') as log:
    subprocess.run(['supabase', 'start', '--workdir', str(work)], env=env,
                   stdout=log, stderr=subprocess.STDOUT, check=True)
with (out / 'db-test.log').open('w') as log:
    subprocess.run(['npm', 'run', 'db:test'], cwd=work, env=env,
                   stdout=log, stderr=subprocess.STDOUT, check=True)
PY
```

Inspect the migration ledger and baseline through the exact newly created container; `-X` ignores any psql startup file. Use `ON_ERROR_STOP` so query failure is visible:

```bash
docker exec supabase_db_t3-phase04-01a-final psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version'
docker exec supabase_db_t3-phase04-01a-final psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc 'SHOW server_version'
docker exec supabase_db_t3-phase04-01a-final psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc 'SELECT count(*) FROM auth.users; SELECT count(*) FROM public.organizations'
```

Compare every ledger version in order with the 133 migration filename prefixes, before and after SQL tests. Confirm all 19 suites report PASS and preserve their actual assertion totals. Validate copied/source hashes again. Capture before/after public-table and auth-user row counts to identify test fixture residue; do not label the unpopulated replay as the future populated upgrade proof.

## Owned cleanup

Run cleanup even after a failed replay/test, but only after confirming the container and volume names belong to this new project. Never use `--all` or point `--workdir` at repository/existing-stack configuration.

```bash
supabase stop --workdir /tmp/t3-phase04-01a-final/isolated --project-id t3-phase04-01a-final --no-backup
```

Read back Docker container/volume/network names and confirm this project's resources are gone and pre-existing container identities and their original running/exited states are preserved. Preserve receipt files outside Docker. [Execution evidence](../EVIDENCE.md#task-04-01a--immutable-chain-replay-and-sql-baseline) records the actual candidate, results, versions, artifact paths and verification; unavailable checks remain blockers.
