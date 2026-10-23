"""Migration admission uses real Git histories and filenames, without Docker."""

from pathlib import Path
import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import database
import migrations


class MigrationTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.directory = self.root / 'supabase/migrations'
        self.directory.mkdir(parents=True)
        self.git('init', '--quiet')
        self.git('config', 'user.email', 'ci@example.test')
        self.git('config', 'user.name', 'CI fixture')
        self.add('20261020000100_initial.sql')
        self.commit()
        self.base = self.git('rev-parse', 'HEAD')
        self.git('update-ref', 'refs/remotes/origin/main', self.base)
        for label in ('STAGED_UPGRADE_MIGRATIONS', 'ACCOUNT_SETUP_UPGRADE_MIGRATIONS'):
            replacement = patch.object(database, label, ('20261020000100_initial.sql',))
            replacement.start()
            self.addCleanup(replacement.stop)

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, text=True).strip()

    def add(self, name):
        (self.directory / name).write_text('SELECT 1;\n')

    def commit(self):
        self.git('add', '.')
        self.git('commit', '--quiet', '-m', 'fixture')

    def test_accepts_existing_history_and_later_untracked_migration(self):
        self.add('20261021000100_new.sql')
        self.assertEqual(migrations.check(self.root, 'origin/main'), [])

    def test_rejects_duplicate_and_invalid_versions_with_repair_instructions(self):
        self.add('20261020000100_duplicate.sql')
        self.add('no_version.sql')
        errors = '\n'.join(migrations.check(self.root, self.base))
        self.assertIn('duplicate migration version 20261020000100', errors)
        self.assertIn('20261020000100_initial.sql', errors)
        self.assertIn('no_version.sql: use a migration filename', errors)

    def test_rejects_versions_that_are_not_fourteen_digits(self):
        self.add('202610200001000_long.sql')
        self.add('2026102000010_short.sql')
        errors = '\n'.join(migrations.check(self.root, self.base))
        self.assertIn('202610200001000_long.sql: use a migration filename', errors)
        self.assertIn('2026102000010_short.sql: use a migration filename', errors)

    def test_rejects_older_and_equal_additions_but_allows_edits_to_existing_migration(self):
        self.add('20261019000100_older.sql')
        self.add('20261020000100_equal.sql')
        (self.directory / '20261020000100_initial.sql').write_text('SELECT 2;\n')
        errors = migrations.check(self.root, self.base)
        ordering = [error for error in errors if 'new migration version' in error]
        self.assertEqual(len(ordering), 2)
        for name in ('20261019000100_older.sql', '20261020000100_equal.sql'):
            self.assertTrue(any(name in error and '20261020000100' in error
                                and 'scripts/ci/database.py' in error for error in ordering))

    def test_compares_against_current_base_tip_not_only_shared_ancestor(self):
        self.add('20261021000100_base_change.sql')
        self.commit()
        newer_base = self.git('rev-parse', 'HEAD')
        self.git('checkout', '--quiet', '--detach', self.base)
        self.add('20261021000000_branch_change.sql')
        self.commit()
        errors = migrations.check(self.root, newer_base)
        self.assertEqual(len(errors), 1)
        self.assertIn('20261021000000_branch_change.sql', errors[0])
        self.assertIn('20261021000100', errors[0])

    def test_feature_branch_sync_inherits_main_migrations_but_not_its_own_older_ones(self):
        self.git('checkout', '--quiet', '-b', 'feature')
        self.add('20261022000100_feature.sql')
        self.commit()
        feature = self.git('rev-parse', 'HEAD')
        self.git('checkout', '--quiet', '--detach', self.base)
        self.add('20261021000100_main.sql')
        self.commit()
        self.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
        self.git('checkout', '--quiet', '-b', 'sync', feature)
        self.git('merge', '--quiet', '--no-edit', 'origin/main')
        self.assertEqual(migrations.check(self.root, feature), [])
        self.add('20261021000200_slice.sql')
        errors = migrations.check(self.root, feature)
        self.assertEqual(len(errors), 1)
        self.assertIn('20261021000200_slice.sql', errors[0])

    def test_cli_uses_event_base_and_allows_explicit_local_override(self):
        self.add('20261021000100_base_change.sql')
        self.commit()
        event = self.root / 'event.json'
        event.write_text(json.dumps({'pull_request': {'base': {'sha': self.git('rev-parse', 'HEAD')}}}))
        self.git('checkout', '--quiet', '--detach', self.base)
        self.add('20261021000000_branch_change.sql')
        with patch.object(migrations, '__file__', str(self.root / 'scripts/ci/migrations.py')), \
                patch.dict(os.environ, {'GITHUB_EVENT_NAME': 'pull_request', 'GITHUB_EVENT_PATH': str(event)}), \
                contextlib.redirect_stderr(io.StringIO()) as error, \
                contextlib.redirect_stdout(io.StringIO()), \
                patch.object(sys, 'argv', ['migrations.py']):
            with self.assertRaises(SystemExit) as failed:
                migrations.main()
            self.assertEqual(failed.exception.code, 1)
            self.assertIn('20261021000100', error.getvalue())
            with patch.object(sys, 'argv', ['migrations.py', '--base', 'origin/main']):
                migrations.main()

    def test_cli_rejects_missing_pr_base_metadata(self):
        event = self.root / 'event.json'
        event.write_text('{}')
        with patch.dict(os.environ, {'GITHUB_EVENT_NAME': 'pull_request', 'GITHUB_EVENT_PATH': str(event)}), \
                patch.object(sys, 'argv', ['migrations.py']), contextlib.redirect_stderr(io.StringIO()), \
                self.assertRaises(SystemExit) as failed:
            migrations.main()
        self.assertEqual(failed.exception.code, 1)

    def test_checks_each_named_migration_list(self):
        with patch.object(database, 'ACCOUNT_SETUP_UPGRADE_MIGRATIONS', ('20261022000100_missing.sql',)):
            errors = migrations.check(self.root, self.base)
        self.assertEqual(len(errors), 1)
        self.assertIn('ACCOUNT_SETUP_UPGRADE_MIGRATIONS: 20261022000100_missing.sql', errors[0])

    def test_missing_base_fails_instead_of_skipping_ordering(self):
        with self.assertRaises(subprocess.CalledProcessError):
            migrations.check(self.root, 'missing-ref')
