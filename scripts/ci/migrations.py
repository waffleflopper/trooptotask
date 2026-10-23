#!/usr/bin/env python3
"""Check migration versions, PR ordering and database runner references without a database."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess

import database


def git(repository, *args):
    return subprocess.check_output(['git', *args], cwd=repository, text=True).strip()


def migration_names(repository, ref):
    return git(repository, 'ls-tree', '--name-only', ref, 'supabase/migrations/').splitlines()


def check(repository, base):
    directory = repository / 'supabase/migrations'
    files = sorted(path.name for path in directory.iterdir() if path.is_file())
    errors = []
    versions = {}
    valid = []
    for name in files:
        match = re.fullmatch(r'([0-9]{14})_.+\.sql', name)
        if not match:
            errors.append(f'{name}: use a migration filename <version>_<name>.sql with a 14-digit UTC timestamp version.')
            continue
        version = match[1]
        valid.append((version, name))
        if version in versions:
            errors.append(f'{name}: duplicate migration version {version}, also used by {versions[version]}. '
                          'Give the new migration a unique, later version.')
        versions[version] = name

    for label, names in vars(database).items():
        if label.endswith('_MIGRATIONS'):
            for name in names:
                if name not in files:
                    errors.append(f'scripts/ci/database.py {label}: {name} does not exist in '
                                  'supabase/migrations/. Update the migration reference.')

    base_files = migration_names(repository, base)
    base_versions = [Path(name).name.split('_', 1)[0] for name in base_files
                     if re.fullmatch(r'[0-9]{14}_.+\.sql', Path(name).name)]
    if base_versions:
        newest = max(base_versions)
        ancestor = git(repository, 'merge-base', 'HEAD', base)
        inherited = {Path(name).name for name in migration_names(repository, ancestor)}
        # A feature branch syncing from main inherits main's migrations, which already sort on main.
        if subprocess.run(['git', 'rev-parse', '--verify', '--quiet', 'origin/main'], cwd=repository,
                          capture_output=True).returncode == 0:
            inherited |= {Path(name).name for name in migration_names(repository, 'origin/main')}
        for version, name in valid:
            if name not in inherited and version <= newest:
                errors.append(f'{name}: new migration version must sort after {newest}, the newest version '
                              f'on base {base}. Rename the new migration and update any reference in '
                              'scripts/ci/database.py.')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', help='PR base ref; defaults to the event base SHA or origin/main')
    args = parser.parse_args()
    try:
        base = args.base
        if not base and os.environ.get('GITHUB_EVENT_NAME') == 'pull_request':
            event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
            base = event['pull_request']['base']['sha']
            if not base:
                raise ValueError('Pull request base SHA is missing')
        errors = check(Path(__file__).resolve().parents[2], base or 'origin/main')
        if errors:
            raise ValueError('\n'.join(errors))
        print('Migration versions, base ordering and database runner references passed.')
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        parser.exit(1, f'Migration checks failed: {error}\n')


if __name__ == '__main__':
    main()
