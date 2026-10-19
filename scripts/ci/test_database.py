"""Protect isolation and cleanup at the process/filesystem boundary, without Docker."""

import contextlib
import errno
import io
import json
import os
from pathlib import Path
import signal
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import tomllib
import unittest
from unittest.mock import patch

import database


class DatabaseCancellationTests(unittest.TestCase):
    def test_signal_during_launch_is_consumed_before_standalone_validation_continues(self):
        program = '''import os, pathlib, signal, subprocess, sys, tempfile
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import database
signum = int(sys.argv[2])
real_popen = subprocess.Popen
with tempfile.TemporaryDirectory() as directory:
    def launching(*args, **kwargs):
        os.kill(os.getpid(), signum)
        return real_popen(*args, **kwargs)
    def validate(*args, **kwargs):
        database.run([sys.executable, '-c', 'import time; time.sleep(0.1)'], pathlib.Path(directory))
        print('validation-continued', flush=True)
    with patch.object(sys, 'argv', ['database.py']), patch.object(database, 'validate', validate), patch.object(subprocess, 'Popen', launching):
        database.main()
'''
        for signum in (signal.SIGINT, signal.SIGTERM):
            with self.subTest(signal=signum):
                result = subprocess.run([sys.executable, '-c', program, str(Path(database.__file__).parent), str(signum)],
                                        capture_output=True, text=True, timeout=5)
                self.assertEqual(result.returncode, 128 + signum, result.stdout + result.stderr)
                self.assertNotIn('validation-continued', result.stdout)

    def make_receipt(self, root):
        workdir = Path(tempfile.mkdtemp(prefix='t2t-ci-db-'))
        self.addCleanup(lambda: shutil.rmtree(workdir, ignore_errors=True))
        (workdir / 'supabase').mkdir()
        (workdir / 'supabase/config.toml').write_text(
            'project_id = ' + json.dumps(workdir.name) + '\n[db.seed]\nenabled = false\nsql_paths = []\n')
        receipt = database.JobReceipt(root / 't2t-ci-db-123-1-database.json', create=True,
                                      endpoint='unix:///var/run/docker.sock')
        receipt.add(workdir)
        return workdir, receipt

    def test_label_selected_wrong_name_resource_is_preserved_without_stop(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            environment = {'RUNNER_TEMP': str(root), 'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1',
                           'GITHUB_JOB': 'database', 'GITHUB_REPOSITORY': 'example/synthetic'}
            view = root / 'processes'
            view.mkdir()
            with patch.dict(os.environ, environment), patch.object(database, 'PROC_ROOT', view):
                workdir, receipt = self.make_receipt(root)
                labels = {'com.supabase.cli.project': workdir.name, 'com.docker.compose.project': workdir.name}
                saved = [{'Id': 'a' * 64, 'Name': '/supabase_db_' + workdir.name, 'Config': {'Labels': labels}},
                         {'Id': 'b' * 64, 'Name': '/supabase_db_existing-local', 'Config': {'Labels': labels}}]
                rows = list(saved)

                def docker_model(command, _cwd, **_kwargs):
                    if command[:2] == ['docker', 'ps']:
                        selector = command[command.index('--filter') + 1]
                        key, value = selector.split('=', 1)
                        selected = [x for x in rows if (value in x['Name'] if key == 'name'
                                    else x['Config']['Labels'].get(value.split('=', 1)[0]) == value.split('=', 1)[1])]
                        stdout = '\n'.join(x['Id'] for x in selected)
                    elif command[:3] in (['docker', 'volume', 'ls'], ['docker', 'network', 'ls']):
                        stdout = ''
                    elif command[:3] == ['docker', 'container', 'inspect']:
                        stdout = json.dumps([x for x in rows if x['Id'] in command[3:]])
                    elif command[:2] == ['supabase', 'stop']:
                        rows[:] = [x for x in rows if x['Config']['Labels']['com.supabase.cli.project'] != workdir.name]
                        stdout = ''
                    elif command[:3] == ['docker', 'rm', '--force']:
                        stdout = ''
                    else:
                        self.fail(str(command))
                    return subprocess.CompletedProcess(command, 0, stdout=stdout)

                with patch.object(database, 'run', docker_model), self.assertRaises(ValueError):
                    database.cleanup_owned_projects(receipt, producer_may_run=True)
                self.assertEqual(rows, saved)
                self.assertTrue(receipt.path.exists())
                self.assertTrue(workdir.exists())

    def test_generated_cli_test_runner_cleanup_preserves_unowned_resources(self):
        cases = (
            ('ecr', 'public.ecr.aws/supabase/pg_prove:3.36', None, True),
            ('setup-cli mirror', 'ghcr.io/supabase/pg_prove:3.36', None, True),
            ('other version', 'public.ecr.aws/supabase/pg_prove:3.37', None, False),
            ('other registry', 'registry.invalid/supabase/pg_prove:3.36', None, False),
            ('other owner', 'public.ecr.aws/supabase/pg_prove:3.36', 'label', False),
            ('unowned attachment', 'public.ecr.aws/supabase/pg_prove:3.36', 'attachment', False),
        )
        for case, image, mismatch, allowed in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                environment = {'RUNNER_TEMP': str(root), 'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1',
                               'GITHUB_JOB': 'database', 'GITHUB_REPOSITORY': 'example/synthetic'}
                view = root / 'processes'
                view.mkdir()
                with patch.dict(os.environ, environment), patch.object(database, 'PROC_ROOT', view):
                    workdir, receipt = self.make_receipt(root)
                    labels = {'com.supabase.cli.project': workdir.name, 'com.docker.compose.project': workdir.name}
                    runner_labels = {**labels, 'com.docker.compose.project': 'existing-local'} if mismatch == 'label' else labels
                    db_id, test_id, sentinel_id = 'a' * 64, 'b' * 64, 'c' * 64
                    resources = {
                        'container': [
                            {'Id': db_id, 'Name': '/supabase_db_' + workdir.name, 'Config': {'Labels': labels}},
                            {'Id': test_id, 'Name': '/relaxed_archimedes', 'Config': {'Labels': runner_labels, 'Image': image}},
                            {'Id': sentinel_id, 'Name': '/supabase_db_existing-local', 'Config': {'Labels': {'com.supabase.cli.project': 'existing-local'}}},
                        ],
                        'volume': [{'Name': 'supabase_db_' + workdir.name, 'Labels': labels}],
                        'network': [{'Name': 'supabase_network_' + workdir.name, 'Labels': labels,
                                     'Containers': {db_id: {'Name': 'supabase_db_' + workdir.name},
                                                    test_id: {'Name': 'relaxed_archimedes'},
                                                    **({sentinel_id: {'Name': 'supabase_db_existing-local'}} if mismatch == 'attachment' else {})}}],
                    }
                    saved = json.loads(json.dumps(resources))

                    def docker_model(command, _cwd, **_kwargs):
                        if '--filter' in command:
                            kind = 'container' if command[1] == 'ps' else command[1]
                            key, value = command[command.index('--filter') + 1].split('=', 1)
                            selected = [x for x in resources[kind] if (value in x['Name'] if key == 'name'
                                        else (x['Config']['Labels'] if kind == 'container' else x['Labels']).get(value.split('=', 1)[0]) == value.split('=', 1)[1])]
                            stdout = '\n'.join(x['Id'] if kind == 'container' else x['Name'] for x in selected)
                        elif command[:1] == ['docker'] and command[2] == 'inspect':
                            kind = command[1]
                            stdout = json.dumps([x for x in resources[kind] if (x['Id'] if kind == 'container' else x['Name']) in command[3:]])
                        elif command[:3] == ['docker', 'rm', '--force']:
                            resources['container'][:] = [x for x in resources['container'] if x['Id'] not in command[3:]]
                            for network in resources['network']:
                                for identity in command[3:]:
                                    network['Containers'].pop(identity, None)
                            stdout = ''
                        elif command[:2] == ['supabase', 'stop']:
                            self.assertTrue(any(x['Id'] == db_id for x in resources['container']), 'Database must reach its scoped graceful stop')
                            if any(x['Id'] == test_id for x in resources['container']):
                                raise RuntimeError('Test runner was not removed by its discovered identity')
                            for kind in resources:
                                resources[kind][:] = [x for x in resources[kind] if (x['Config']['Labels'] if kind == 'container' else x['Labels']).get('com.supabase.cli.project') != workdir.name]
                            stdout = ''
                        else:
                            self.fail(str(command))
                        return subprocess.CompletedProcess(command, 0, stdout=stdout)

                    with patch.object(database, 'run', docker_model):
                        if allowed:
                            database.cleanup_owned_projects(receipt, producer_may_run=True)
                        else:
                            with self.assertRaises(ValueError):
                                database.cleanup_owned_projects(receipt, producer_may_run=True)
                    if allowed:
                        self.assertEqual(resources, {'container': [saved['container'][2]], 'volume': [], 'network': []})
                        self.assertFalse(receipt.path.exists())
                        self.assertFalse(workdir.exists())
                    else:
                        self.assertEqual(resources, saved)
                        self.assertTrue(receipt.path.exists())
                        self.assertTrue(workdir.exists())

    def test_denied_cwd_is_excluded_only_for_older_or_owned_init_processes(self):
        older, equal, newer = 'older', 'equal', 'newer'
        cases = (
            ('older host process', dict(start=older), True),
            ('older PID reused by newer process', dict(start=older, during_inventory='reuse'), False),
            ('older stat unreadable', dict(start=older, during_inventory='unreadable'), False),
            ('older in command group', dict(start=older, group=True), False),
            ('older readable cwd in project', dict(start=older, cwd='project'), False),
            ('equal host process', dict(start=equal), False),
            ('newer host process', dict(start=newer), False),
            ('owned database init', dict(init='db'), True),
            ('owned mounted test runner init', dict(init='runner'), True),
            ('owned init cgroup names unowned container', dict(init='db', cgroup='sentinel'), False),
            ('owned init records another PID', dict(init='db', init_pid=4343), False),
            ('owned init stopped', dict(init='db', running=False), False),
            ('unowned container init', dict(init='sentinel'), False),
            ('owned init PID reused', dict(init='db', during_inventory='reuse'), False),
            ('owned init vanished', dict(init='db', during_inventory='vanish'), False),
        )
        pid, group_pid = 4242, 4141
        for case, options, allowed in cases:
            options = {'start': newer, 'during_inventory': None, 'group': False, 'cwd': 'denied',
                       'init': None, 'init_pid': pid, 'running': True, **options}
            options.setdefault('cgroup', options['init'])
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                environment = {'RUNNER_TEMP': str(root), 'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1',
                               'GITHUB_JOB': 'database', 'GITHUB_REPOSITORY': 'example/synthetic'}
                view = root / 'processes'
                view.mkdir()
                with patch.dict(os.environ, environment), patch.object(database, 'PROC_ROOT', view):
                    workdir, receipt = self.make_receipt(root)
                    command = {'pid': group_pid, 'start': '1'}
                    receipt.data['command'] = command
                    receipt.save()
                    producer_start = int(receipt.data['producer']['start'])
                    start = {older: 1, equal: producer_start, newer: producer_start + 1}[options['start']]
                    labels = {'com.supabase.cli.project': workdir.name, 'com.docker.compose.project': workdir.name}
                    ids = {'db': 'a' * 64, 'runner': 'b' * 64, 'sentinel': 'c' * 64}
                    resources = {
                        'container': [
                            {'Id': ids['db'], 'Name': '/supabase_db_' + workdir.name, 'Config': {'Labels': labels}},
                            {'Id': ids['runner'], 'Name': '/relaxed_archimedes',
                             'Config': {'Labels': labels, 'Image': 'public.ecr.aws/supabase/pg_prove:3.36'}},
                            {'Id': ids['sentinel'], 'Name': '/supabase_db_existing-local',
                             'Config': {'Labels': {'com.supabase.cli.project': 'existing-local'}}},
                        ],
                        'volume': [{'Name': 'supabase_db_' + workdir.name, 'Labels': labels}],
                        'network': [{'Name': 'supabase_network_' + workdir.name, 'Labels': labels,
                                     'Containers': {ids['db']: {}, ids['runner']: {}}}],
                    }
                    for row in resources['container']:
                        if options['init'] and row['Id'] == ids[options['init']]:
                            row['State'] = {'Running': options['running'], 'Pid': options['init_pid']}
                    saved = json.loads(json.dumps(resources))

                    process = view / str(pid)
                    process.mkdir()
                    stat_file = process / 'stat'

                    def write_stat(ticks):
                        pgrp = group_pid if options['group'] else pid
                        stat_file.write_text(f'{pid} (synthetic) S 1 {pgrp} ' + '0 ' * 16 + str(ticks))

                    write_stat(start)
                    (process / 'cgroup').write_text(
                        f"0::/system.slice/docker-{ids[options['cgroup']]}.scope\n" if options['cgroup']
                        else '0::/user.slice/app.scope\n')
                    (process / 'cwd').symlink_to(workdir if options['cwd'] == 'project' else root)
                    real_readlink = os.readlink
                    real_read_text = Path.read_text
                    unreadable_stats = set()

                    def readlink(path, *args, **kwargs):
                        if options['cwd'] == 'denied' and Path(path) == process / 'cwd':
                            raise PermissionError(errno.EACCES, 'Permission denied', str(path))
                        return real_readlink(path, *args, **kwargs)

                    def read_text(path, *args, **kwargs):
                        if path in unreadable_stats:
                            raise PermissionError(errno.EACCES, 'Permission denied', str(path))
                        return real_read_text(path, *args, **kwargs)

                    def docker_model(command, _cwd, **_kwargs):
                        if '--filter' in command:
                            kind = 'container' if command[1] == 'ps' else command[1]
                            key, value = command[command.index('--filter') + 1].split('=', 1)
                            selected = [x for x in resources[kind] if (value in x['Name'] if key == 'name'
                                        else (x['Config']['Labels'] if kind == 'container' else x['Labels']).get(value.split('=', 1)[0]) == value.split('=', 1)[1])]
                            stdout = '\n'.join(x['Id'] if kind == 'container' else x['Name'] for x in selected)
                        elif command[:1] == ['docker'] and command[2] == 'inspect':
                            kind = command[1]
                            stdout = json.dumps([x for x in resources[kind] if (x['Id'] if kind == 'container' else x['Name']) in command[3:]])
                            if kind == 'container' and options['during_inventory'] == 'reuse':
                                write_stat(producer_start + 2)
                            elif kind == 'container' and options['during_inventory'] == 'vanish':
                                stat_file.unlink(missing_ok=True)
                            elif kind == 'container' and options['during_inventory'] == 'unreadable':
                                unreadable_stats.add(stat_file)
                        elif command[:3] == ['docker', 'rm', '--force']:
                            resources['container'][:] = [x for x in resources['container'] if x['Id'] not in command[3:]]
                            for network in resources['network']:
                                for identity in command[3:]:
                                    network['Containers'].pop(identity, None)
                            stdout = ''
                        elif command[:2] == ['supabase', 'stop']:
                            for kind in resources:
                                resources[kind][:] = [x for x in resources[kind] if (x['Config']['Labels'] if kind == 'container' else x['Labels']).get('com.supabase.cli.project') != workdir.name]
                            stdout = ''
                        else:
                            self.fail(str(command))
                        database._receipt.data['command'] = None
                        database._receipt.save()
                        return subprocess.CompletedProcess(command, 0, stdout=stdout)

                    with (patch.object(database, 'run', docker_model), patch.object(database, '_receipt', receipt),
                          patch.object(os, 'readlink', readlink), patch.object(Path, 'read_text', read_text)):
                        if allowed:
                            database.cleanup_owned_projects(receipt, producer_may_run=True)
                        else:
                            with self.assertRaises(RuntimeError):
                                database.cleanup_owned_projects(receipt, producer_may_run=True)
                    if allowed:
                        self.assertEqual(resources, {'container': [saved['container'][2]], 'volume': [], 'network': []})
                        self.assertFalse(receipt.path.exists())
                        self.assertFalse(workdir.exists())
                    else:
                        self.assertEqual(resources, saved)
                        self.assertTrue(receipt.path.exists())
                        self.assertTrue(workdir.exists())
                    if options['group']:
                        self.assertEqual(json.loads(receipt.path.read_text())['command'], command)

    def test_interrupted_directory_removal_resumes_after_deleted_cwd_writer_stops(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            environment = {'RUNNER_TEMP': str(root), 'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1',
                           'GITHUB_JOB': 'database', 'GITHUB_REPOSITORY': 'example/synthetic'}
            view = root / 'processes'
            view.mkdir()
            with patch.dict(os.environ, environment), patch.object(database, 'PROC_ROOT', view):
                workdir, receipt = self.make_receipt(root)
                active = None
                real_rmtree = shutil.rmtree

                def interrupted_remove(path):
                    nonlocal active
                    active = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'], cwd=path)
                    (view / str(active.pid)).symlink_to(Path('/proc') / str(active.pid))
                    real_rmtree(path)
                    os.kill(os.getpid(), signal.SIGTERM)

                def no_resources(command, _cwd, **_kwargs):
                    self.assertEqual(command[0], 'docker')
                    self.assertTrue('ps' in command or 'ls' in command)
                    return subprocess.CompletedProcess(command, 0, stdout='')

                previous = signal.signal(signal.SIGTERM, lambda sig, _: (_ for _ in ()).throw(SystemExit(128 + sig)))
                try:
                    with patch.object(database, 'run', no_resources), patch.object(database.shutil, 'rmtree', interrupted_remove), self.assertRaises(SystemExit):
                        database.cleanup_owned_projects(receipt, producer_may_run=True)
                    self.assertFalse(workdir.exists())
                    self.assertTrue(receipt.path.exists())
                    fresh = database.JobReceipt(receipt.path)
                    with patch.object(database, 'run', no_resources), self.assertRaises((ValueError, RuntimeError)):
                        database.cleanup_owned_projects(fresh, producer_may_run=True)
                    self.assertTrue(receipt.path.exists())
                    active.terminate()
                    active.wait()
                    with patch.object(database, 'run', no_resources):
                        database.cleanup_owned_projects(database.JobReceipt(receipt.path), producer_may_run=True)
                    self.assertFalse(receipt.path.exists())
                finally:
                    signal.signal(signal.SIGTERM, previous)
                    if active and active.poll() is None:
                        active.kill()
                        active.wait()

    def test_managed_cancellation_leaves_receipt_for_separate_scoped_finalizer(self):
        for signum, managed in ((signal.SIGINT, True), (signal.SIGTERM, True),
                                (signal.SIGINT, False), (signal.SIGTERM, False)):
            with self.subTest(signal=signum, managed=managed), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                binaries = root / 'bin'
                binaries.mkdir()
                process_view = root / 'processes'
                process_view.mkdir()
                sentinel_directory = root / 'existing-project'
                sentinel_directory.mkdir()
                sentinel = sentinel_directory / 'saved-data'
                sentinel.write_text('untouched')
                sentinel_process = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'],
                                                    cwd=sentinel_directory)
                (process_view / str(sentinel_process.pid)).symlink_to(Path('/proc') / str(sentinel_process.pid))
                # A stable Linux process-view fixture uses real /proc entries for
                # the test's processes, excluding unrelated workstation daemons.
                entry = root / 'entry.py'
                entry.write_text('''import os, pathlib, sys
sys.path.insert(0, sys.argv.pop(1))
import database
database.PROC_ROOT = pathlib.Path(os.environ['T2T_FAKE_ROOT']) / 'processes'
(database.PROC_ROOT / str(os.getpid())).symlink_to(pathlib.Path('/proc') / str(os.getpid()))
database.main()
''')
                cli = '''#!PYTHON
import hashlib, json, os, pathlib, signal, subprocess, sys, time
root = pathlib.Path(os.environ['T2T_FAKE_ROOT'])
proc = root / 'processes' / str(os.getpid())
if not proc.is_symlink(): proc.symlink_to(pathlib.Path('/proc') / str(os.getpid()))
args = sys.argv[1:]
def resource_file(project): return root / (project + '.json')
def objects(project):
    labels = {'com.supabase.cli.project': project, 'com.docker.compose.project': project}
    identity = hashlib.sha256(project.encode()).hexdigest()
    name = 'supabase_db_' + project
    return {'container': [{'Id': identity, 'Name': '/' + name, 'Config': {'Labels': labels}}],
            'volume': [{'Name': name, 'Labels': labels}],
            'network': [{'Id': hashlib.sha256(('network-' + project).encode()).hexdigest(),
                         'Name': 'supabase_network_' + project, 'Labels': labels,
                         'Containers': {identity: {'Name': name}}}]}
if pathlib.Path(sys.argv[0]).name == 'supabase':
    if args == ['--version']: print('2.101.0')
    elif args[0] == 'start':
        for sig in (signal.SIGINT, signal.SIGTERM): signal.signal(sig, signal.SIG_IGN)
        project = pathlib.Path.cwd().name
        child = subprocess.Popen([sys.executable, __file__, 'writer', project])
        child.wait()
    elif args[0] == 'stop':
        project = args[args.index('--project-id') + 1]
        assert args == ['stop', '--project-id', project, '--no-backup']
        assert pathlib.Path.cwd().name == project
        time.sleep(0.15)
        if not os.environ.get('T2T_FAKE_LEAVE_RESOURCE'):
            resource_file(project).unlink(missing_ok=True)
    elif args[0] == 'writer':
        project = args[1]
        for sig in (signal.SIGINT, signal.SIGTERM): signal.signal(sig, signal.SIG_IGN)
        resource_file(project).write_text(json.dumps(objects(project)))
        (root / 'started').write_text(project)
        (root / 'tracking').write_text(os.environ.get('RUNNER_TRACKING_ID', 'MISSING'))
        while True:
            if not resource_file(project).exists():
                (root / 'late-recreation').write_text('unsafe')
                resource_file(project).write_text(json.dumps(objects(project)))
            time.sleep(0.01)
    else: raise RuntimeError(args)
else:
    if args[:2] == ['context', 'inspect']: print('unix:///var/run/docker.sock')
    elif 'inspect' in args:
        kind = args[0]
        ids = args[2:]
        selected = [item for p in root.glob('t2t-ci-db-*.json')
                    for item in json.loads(p.read_text()).get(kind, [])
                    if (item['Id'] if kind == 'container' else item['Name']) in ids]
        print(json.dumps(selected))
    elif '--filter' in args:
        kind = 'container' if args[0] == 'ps' else args[0]
        key, value = args[args.index('--filter') + 1].split('=', 1)
        project = value if key == 'name' else value.split('=', 1)[1]
        values = json.loads(resource_file(project).read_text())[kind] if resource_file(project).exists() else []
        if key == 'label':
            label, wanted = value.split('=', 1)
            values = [item for item in values if (item['Config']['Labels'] if kind == 'container' else item['Labels']).get(label) == wanted]
        for item in values: print(item['Id'] if kind == 'container' else item['Name'])
    elif args[:2] != ['rm', '--force']: raise RuntimeError(args)
'''.replace('PYTHON', sys.executable)
                for name in ('docker', 'supabase'):
                    executable = binaries / name
                    executable.write_text(cli)
                    executable.chmod(0o700)
                environment = {**os.environ, 'PATH': str(binaries) + os.pathsep + os.environ['PATH'],
                               'T2T_FAKE_ROOT': str(root), 'RUNNER_TEMP': str(root),
                               'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_JOB': 'database',
                               'GITHUB_REPOSITORY': 'example/synthetic', 'RUNNER_TRACKING_ID': 'synthetic-job-owner'}
                environment.pop('DOCKER_CONTEXT', None)
                environment['DOCKER_HOST'] = 'unix:///var/run/docker.sock'
                receipt = root / 't2t-ci-db-123-1-database.json'
                command = [sys.executable, str(entry), str(Path(database.__file__).parent)]
                options = ['--receipt', str(receipt)] if managed else []
                producer = subprocess.Popen(['bash', '-c', 'exec "$@"', 'ci-entry', *command, *options], env=environment,
                                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                            start_new_session=True)
                project_directory = None
                try:
                    deadline = time.monotonic() + 5
                    while not (root / 'started').exists() and time.monotonic() < deadline:
                        if producer.poll() is not None:
                            self.fail(producer.communicate()[0])
                        time.sleep(0.01)
                    self.assertTrue((root / 'started').exists(), 'Fake CLI did not reach startup')
                    project = (root / 'started').read_text()
                    project_directory = Path(tempfile.gettempdir()) / project
                    if managed:
                        saved = json.loads(receipt.read_text())
                        self.assertEqual(saved['projects'][0]['id'], project)
                        self.assertEqual(Path(saved['projects'][0]['path']), project_directory)
                    self.assertEqual((root / 'tracking').read_text(), 'synthetic-job-owner')
                    producer.send_signal(signum)
                    output, _ = producer.communicate(timeout=3)
                    self.assertEqual(producer.returncode, 128 + signum, output)
                    if not managed:
                        self.assertFalse(receipt.exists())
                        self.assertFalse(project_directory.exists())
                        self.assertFalse((root / (project + '.json')).exists())
                        time.sleep(0.1)
                        self.assertFalse((root / 'late-recreation').exists())
                        self.assertIsNone(sentinel_process.poll())
                        self.assertEqual(sentinel.read_text(), 'untouched')
                        continue
                    self.assertTrue(receipt.exists())
                    self.assertTrue(project_directory.exists())
                    self.assertTrue((root / (project + '.json')).exists())

                    def finalize(env=environment):
                        return subprocess.run([*command, '--cleanup', str(receipt)], env=env,
                                              capture_output=True, text=True, timeout=5)

                    if signum == signal.SIGINT:
                        original = receipt.read_bytes()
                        for corruption in ('invalid json', 'wrong job', 'remote docker'):
                            data = json.loads(original)
                            if corruption == 'wrong job': data['owner']['GITHUB_RUN_ID'] = '999'
                            if corruption == 'remote docker': data['docker'] = 'tcp://remote.invalid:2376'
                            receipt.write_text('invalid' if corruption == 'invalid json' else json.dumps(data))
                            rejected = finalize()
                            self.assertNotEqual(rejected.returncode, 0, rejected.stdout + rejected.stderr)
                            self.assertTrue(receipt.exists())
                            self.assertTrue((root / (project + '.json')).exists())
                            receipt.write_bytes(original)
                        active = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'],
                                                  cwd=project_directory)
                        (process_view / str(active.pid)).symlink_to(Path('/proc') / str(active.pid))
                        try:
                            rejected = finalize()
                            self.assertNotEqual(rejected.returncode, 0, rejected.stdout + rejected.stderr)
                            self.assertTrue((root / (project + '.json')).exists())
                        finally:
                            active.terminate()
                            active.wait()
                        unreadable = process_view / '99999999'
                        unreadable.mkdir()
                        (unreadable / 'stat').write_text((Path('/proc') / str(sentinel_process.pid) / 'stat').read_text())
                        restricted = root / 'restricted'
                        restricted.mkdir()
                        (restricted / 'child').mkdir()
                        (unreadable / 'cwd').symlink_to(restricted / 'child')
                        unreadable.chmod(0)
                        try:
                            rejected = finalize()
                            self.assertNotEqual(rejected.returncode, 0, rejected.stdout + rejected.stderr)
                            self.assertTrue((root / (project + '.json')).exists())
                        finally:
                            unreadable.chmod(0o700)
                            shutil.rmtree(unreadable)
                        resource = root / (project + '.json')
                        original_resource = resource.read_bytes()
                        data = json.loads(original_resource)
                        data['volume'][0]['Labels']['com.supabase.cli.project'] = 'existing-local'
                        resource.write_text(json.dumps(data))
                        rejected = finalize()
                        self.assertNotEqual(rejected.returncode, 0, rejected.stdout + rejected.stderr)
                        self.assertTrue(resource.exists())
                        resource.write_bytes(original_resource)
                        rejected = finalize({**environment, 'T2T_FAKE_LEAVE_RESOURCE': '1'})
                        self.assertNotEqual(rejected.returncode, 0, rejected.stdout + rejected.stderr)
                        self.assertTrue(receipt.exists())
                        self.assertTrue(project_directory.exists())
                    result = finalize()
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertFalse(receipt.exists())
                    self.assertFalse(project_directory.exists())
                    self.assertFalse((root / (project + '.json')).exists())
                    time.sleep(0.1)
                    self.assertFalse((root / 'late-recreation').exists())
                    result = finalize()
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertIsNone(sentinel_process.poll())
                    self.assertEqual(sentinel.read_text(), 'untouched')
                finally:
                    for pid in process_view.iterdir():
                        if pid.name.isdigit() and int(pid.name) not in (os.getpid(), sentinel_process.pid):
                            try: os.kill(int(pid.name), signal.SIGKILL)
                            except ProcessLookupError: pass
                    if producer.stdout and not producer.stdout.closed:
                        producer.communicate()
                    sentinel_process.terminate()
                    sentinel_process.wait()
                    if project_directory is None and receipt.exists():
                        saved = json.loads(receipt.read_text())
                        if saved['projects']:
                            project_directory = Path(saved['projects'][0]['path'])
                    if project_directory and project_directory.exists():
                        shutil.rmtree(project_directory)

    def test_interrupt_quiesces_cli_wrapper_and_grandchild(self):
        """Cancellation must stop writers before a later cleanup can be safe."""
        for signum in (signal.SIGINT, signal.SIGTERM):
            with self.subTest(signal=signum), tempfile.TemporaryDirectory() as directory:
                workdir = Path(directory)
                sentinel = workdir / "existing-project"
                sentinel.write_text("untouched")
                grandchild = workdir / "grandchild.py"
                grandchild.write_text('''import os, pathlib, signal, sys, time
for sig in (signal.SIGINT, signal.SIGTERM):
    signal.signal(sig, signal.SIG_IGN)
root = pathlib.Path(sys.argv[1])
(root / 'grandchild.pid').write_text(str(os.getpid()))
(root / 'owned-resource').write_text('created')
while True:
    if not (root / 'owned-resource').exists():
        (root / 'late-recreation').write_text('unsafe')
        (root / 'owned-resource').write_text('recreated')
    time.sleep(0.01)
''')
                wrapper = workdir / "cli.py"
                wrapper.write_text('''import os, pathlib, signal, subprocess, sys
for sig in (signal.SIGINT, signal.SIGTERM):
    signal.signal(sig, signal.SIG_IGN)
root = pathlib.Path(sys.argv[1])
(root / 'wrapper.pid').write_text(str(os.getpid()))
subprocess.Popen([sys.executable, str(root / 'grandchild.py'), str(root)]).wait()
''')
                entry = workdir / "entry.py"
                entry.write_text('''import pathlib, signal, sys
sys.path.insert(0, sys.argv[1])
import database
def interrupted(signum, frame):
    raise SystemExit(128 + signum)
for sig in (signal.SIGINT, signal.SIGTERM):
    signal.signal(sig, interrupted)
root = pathlib.Path(sys.argv[2])
database.run([sys.executable, str(root / 'cli.py'), str(root)], root, quiet=True)
''')
                process = subprocess.Popen(
                    ["bash", "-c", 'exec "$@"', "ci-entry", sys.executable,
                     str(entry), str(Path(database.__file__).parent), str(workdir)],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                    start_new_session=True,
                )
                try:
                    deadline = time.monotonic() + 5
                    while not (workdir / "owned-resource").exists() and time.monotonic() < deadline:
                        if process.poll() is not None:
                            self.fail(process.communicate()[0])
                        time.sleep(0.01)
                    self.assertTrue((workdir / "owned-resource").exists(), "CLI did not reach startup")
                    process.send_signal(signum)
                    try:
                        output, _ = process.communicate(timeout=3)
                    except subprocess.TimeoutExpired:
                        self.fail("Cancelled entry did not quiesce its startup processes within grace")
                    self.assertEqual(process.returncode, 128 + signum, output)
                    (workdir / "owned-resource").unlink()
                    # Let a leaked writer attempt recreation; this observes an effect,
                    # rather than treating an exited entry PID as descendant cleanup.
                    time.sleep(0.1)
                    self.assertFalse((workdir / "late-recreation").exists())
                    self.assertFalse((workdir / "owned-resource").exists())
                    self.assertEqual(sentinel.read_text(), "untouched")
                finally:
                    for name in ("grandchild.pid", "wrapper.pid"):
                        if (workdir / name).exists():
                            try:
                                os.kill(int((workdir / name).read_text()), signal.SIGKILL)
                            except ProcessLookupError:
                                pass
                    if process.poll() is None:
                        os.killpg(process.pid, signal.SIGKILL)
                    process.communicate()


class DatabaseIsolationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.repository = Path(self.directory.name)
        self.source = self.repository / "supabase"
        for directory in ("migrations", "tests", "migration-tests", "templates"):
            (self.source / directory).mkdir(parents=True)
        (self.source / "config.toml").write_text('''project_id = "existing-local"
[api]
port = 56321
[db]
port = 56322
shadow_port = 56320
major_version = 17
[db.seed]
enabled = true
sql_paths = ["./private-seed.sql"]
[auth]
enable_signup = false
[edge_runtime]
inspector_port = 8283
''')
        (self.source / "migrations/20260101000000_initial.sql").write_text("SELECT 1;")
        (self.source / "private-seed.sql").write_text("DO NOT COPY")
        (self.source / ".env").write_text("SECRET=DO-NOT-COPY")
        (self.repository / "package.json").write_text(json.dumps({"scripts": {
            "db:test": "supabase test db supabase/tests",
            "prepare": "unsafe-install-hook",
        }}))

    def test_project_copy_cannot_load_existing_seeds_or_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            workdir = Path(directory)
            database.prepare_project(self.repository, workdir, "new-ci-only",
                                     [59001, 59002, 59003, 59004])
            config = tomllib.loads((workdir / "supabase/config.toml").read_text())
            self.assertEqual(config["project_id"], "new-ci-only")
            self.assertEqual(config["db"]["seed"], {"enabled": False, "sql_paths": []})
            self.assertEqual(config["db"]["port"], 59002)
            self.assertEqual(config["auth"]["enable_signup"], False)
            self.assertFalse((workdir / "supabase/private-seed.sql").exists())
            self.assertFalse((workdir / "supabase/.env").exists())
            package = json.loads((workdir / "package.json").read_text())
            self.assertEqual(package["scripts"], {"db:test": "supabase test db supabase/tests"})
            self.assertIn('project_id = "existing-local"',
                          (self.source / "config.toml").read_text())

    def test_existing_stack_ports_and_duplicate_allocations_are_rejected(self):
        source = (self.source / "config.toml").read_text()
        for ports in ([54321, 59002, 59003, 59004], [55321, 59002, 59003, 59004],
                      [56321, 59002, 59003, 59004], [59001] * 4):
            with self.subTest(ports=ports), self.assertRaises(ValueError):
                database.isolated_config(source, "new-ci", ports)

    def test_ipv4_only_runner_reserves_ports_against_other_processes(self):
        create_socket = socket.socket

        def ipv4_only(family, kind):
            if family == socket.AF_INET6:
                raise OSError(errno.EAFNOSUPPORT, "IPv6 unavailable")
            return create_socket(family, kind)

        with patch.object(database.socket, "socket", side_effect=ipv4_only):
            reservations = database.reserve_ports(2)
        try:
            for held in reservations:
                with create_socket(socket.AF_INET, socket.SOCK_STREAM) as competitor:
                    with self.assertRaises(OSError):
                        competitor.bind(("127.0.0.1", held.getsockname()[1]))
        finally:
            for held in reservations:
                held.close()

    def test_provider_credentials_are_not_inherited_by_subprocess(self):
        secrets = {
            "PUBLIC_SUPABASE_URL": "https://remote.invalid", "DATABASE_URL": "secret",
            "SUPABASE_ACCESS_TOKEN": "secret", "PGPASSWORD": "secret",
            "RESEND_API_KEY": "secret", "STRIPE_SECRET_KEY": "secret",
            "E2E_USER_PASSWORD": "secret", "S3_HOST": "https://remote.invalid",
            "S3_REGION": "region", "S3_ACCESS_KEY": "secret", "S3_SECRET_KEY": "secret",
            "OPENAI_API_KEY": "secret", "ACCOUNT_SETUP_LINK_SECRET": "secret",
        }
        settings = {"PATH": os.defpath, "SUPABASE_INTERNAL_IMAGE_REGISTRY": "ghcr.io"}
        with patch.dict(os.environ, {**secrets, **settings}, clear=True), \
                contextlib.redirect_stdout(io.StringIO()):
            result = database.run(
                [sys.executable, "-c", "import json, os; print(json.dumps(dict(os.environ)))"],
                self.repository, quiet=True,
            )
        inherited = json.loads(result.stdout)
        self.assertTrue(secrets.keys().isdisjoint(inherited))
        self.assertEqual(inherited["PATH"], os.defpath)
        self.assertEqual(inherited["SUPABASE_INTERNAL_IMAGE_REGISTRY"], "ghcr.io")

    def test_remote_docker_host_or_overriding_context_prevents_startup(self):
        for environment in ({"DOCKER_HOST": "tcp://remote.invalid:2376"},
                            {"DOCKER_HOST": "unix:///var/run/docker.sock",
                             "DOCKER_CONTEXT": "remote"}, {}):
            with self.subTest(environment=environment), \
                    patch.dict(os.environ, environment, clear=True), \
                    patch.object(database, "run", return_value=subprocess.CompletedProcess(
                        [], 0, stdout="ssh://remote.invalid\n"
                    )) as process, self.assertRaises(ValueError):
                database.validate(self.repository)
            self.assertTrue(all(call.args[0][:3] == ["docker", "context", "inspect"]
                                for call in process.call_args_list))

    def test_local_context_pins_cli_and_supabase_to_same_unix_socket(self):
        environment = {"DOCKER_HOST": "tcp://ignored.invalid:2376", "DOCKER_CONTEXT": "local"}
        with patch.dict(os.environ, environment, clear=True), \
                patch.object(database, "run", return_value=subprocess.CompletedProcess(
                    [], 0, stdout="unix:///run/user/1000/docker.sock\n"
                )):
            child_environment = database.local_docker_environment(self.repository)
            self.assertEqual(child_environment["DOCKER_HOST"], "unix:///run/user/1000/docker.sock")
            self.assertNotIn("DOCKER_CONTEXT", child_environment)
            self.assertEqual(os.environ["DOCKER_CONTEXT"], "local")

    def test_startup_test_failures_and_interruptions_clean_only_new_project(self):
        for failure in ("startup", "sql", "migration", "interruption"):
            with self.subTest(failure=failure):
                calls = []

                def process(command, workdir, **_kwargs):
                    calls.append((command, workdir))
                    if command[:3] == ["docker", "context", "inspect"]:
                        return subprocess.CompletedProcess(command, 0, stdout="unix:///var/run/docker.sock")
                    fails = (
                        failure == "startup" and command[:2] == ["supabase", "start"]
                        or failure == "sql" and command[:2] == ["npm", "run"]
                        or failure == "migration" and command[:2] == ["docker", "run"]
                    )
                    if fails:
                        raise subprocess.CalledProcessError(1, command)
                    if failure == "interruption" and command[:2] == ["npm", "run"]:
                        raise SystemExit(143)
                    return subprocess.CompletedProcess(command, 0)

                expected = SystemExit if failure == "interruption" else subprocess.CalledProcessError
                with patch.object(database, "run", side_effect=process), \
                        contextlib.redirect_stdout(io.StringIO()), self.assertRaises(expected):
                    database.validate(self.repository)
                workdir = next(path for command, path in calls if command == ["supabase", "--version"])
                stop = [command for command, _ in calls if command[:2] == ["supabase", "stop"]]
                self.assertEqual(stop, [["supabase", "stop", "--project-id", workdir.name,
                                         "--no-backup"]])
                self.assertNotEqual(workdir, self.repository)
                self.assertFalse(workdir.exists())
                self.assertTrue((self.source / "private-seed.sql").exists())

    def test_failed_staged_migration_stops_only_its_disposable_project(self):
        for name in database.STAGED_UPGRADE_MIGRATIONS:
            (self.source / "migrations" / name).write_text("SELECT 1;")
        for name in database.STAGED_UPGRADE_FIXTURES:
            (self.source / "migration-tests" / name).write_text("SELECT 'synthetic fixture';")
        calls = []

        def process(command, workdir, **kwargs):
            calls.append((command, workdir, kwargs))
            if command[:3] == ["docker", "context", "inspect"]:
                return subprocess.CompletedProcess(command, 0, stdout="unix:///var/run/docker.sock")
            if command[:3] == ["supabase", "migration", "up"]:
                self.assertEqual(command, ["supabase", "migration", "up", "--local", "--yes", "--include-all"])
                self.assertTrue(all((workdir / "supabase/migrations" / name).exists()
                                    for name in database.STAGED_UPGRADE_MIGRATIONS))
                raise subprocess.CalledProcessError(1, command)
            if command[:2] == ["supabase", "start"]:
                self.assertTrue(all(not (workdir / "supabase/migrations" / name).exists()
                                    for name in database.STAGED_UPGRADE_MIGRATIONS))
            return subprocess.CompletedProcess(command, 0)

        with patch.object(database, "run", side_effect=process), \
                contextlib.redirect_stdout(io.StringIO()), \
                self.assertRaises(subprocess.CalledProcessError):
            database.validate(self.repository, staged_upgrade=True)
        fixture_calls = [(command, kwargs) for command, _, kwargs in calls
                         if command[:3] == ["docker", "exec", "-i"]]
        self.assertEqual(len(fixture_calls), len(database.STAGED_UPGRADE_FIXTURES))
        self.assertTrue(all(kwargs["input_text"] == "SELECT 'synthetic fixture';"
                            for _, kwargs in fixture_calls))
        workdir = next(path for command, path, _ in calls if command == ["supabase", "--version"])
        self.assertEqual([command for command, _, _ in calls if command[:2] == ["supabase", "stop"]],
                         [["supabase", "stop", "--project-id", workdir.name, "--no-backup"]])
        self.assertFalse(workdir.exists())
        self.assertTrue(all((self.source / "migrations" / name).exists()
                            for name in database.STAGED_UPGRADE_MIGRATIONS))


if __name__ == "__main__":
    unittest.main()
