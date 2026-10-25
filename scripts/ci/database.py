#!/usr/bin/env python3
"""Replay migrations and SQL contracts in a new, disposable Supabase project."""

import errno
import argparse
from functools import partial
import hashlib
import json
import os
from pathlib import Path
import random
import re
import shutil
import signal
import socket
import stat
import subprocess
import tempfile
import time
import tomllib
from urllib.parse import urlsplit


EXCLUDED_SERVICES = (
    "studio,imgproxy,realtime,storage-api,edge-runtime,logflare,vector,"
    "postgres-meta,mailpit,supavisor"
)
# Matches Supabase CLI 2.101.0's pgTAP runner. Unlike `test db <file>`,
# mounting the copied tree lets migration tests resolve relative psql includes.
PG_PROVE_IMAGE = "public.ecr.aws/supabase/pg_prove:3.36"
# Pinned setup-cli also supports the same image through its GHCR mirror.
PG_PROVE_IMAGES = (PG_PROVE_IMAGE, "ghcr.io/" + PG_PROVE_IMAGE.split('/', 1)[1])
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
    "20260926001000_personnel_extended_info_scope.sql",
    "20260926001100_personnel_sensitive_artifact_reads.sql",
    "20260926001200_atomic_counseling_deletion_approval.sql",
    "20260926001300_calendar_catalog_scope.sql",
    "20260929000100_critical_tasks_library_configure_scope.sql",
    "20260929000200_training_catalog_configuration_scope.sql",
    "20260929000300_personnel_group_reference_integrity.sql",
    "20260930000100_rating_scheme_evaluator_integrity.sql",
    "20261001000100_personnel_archive_retention.sql",
    "20261001000200_atomic_onboarding_reconciliation.sql",
    "20261002001000_organization_storage_cleanup.sql",
    "20261002002000_organization_file_upload_registration.sql",
    "20261002001100_atomic_onboarding_start.sql",
    "20261003000100_cancel_own_deletion_request.sql",
    "20261003000200_platform_organization_membership_commands.sql",
    "20261004000200_critical_task_archive_retention.sql",
    "20261004000100_scope_getting_started_progress.sql",
    "20261004100618_training_readiness_goal.sql",
    "20261006000100_atomic_calendar_availability_removal.sql",
    "20261012000100_invitation_grant_liveness.sql",
    "20261012000400_governance_direct_write_authority.sql",
    "20261012000500_suspension_sql_admission.sql",
    "20261012000600_feature_direct_write_authority.sql",
    "20261012000700_group_catalog_scope.sql",
    "20261013000100_personnel_file_retirement.sql",
    "20261013000200_onboarding_step_progress_changed_at.sql",
    "20261013000300_atomic_deletion_request_submission.sql",
    "20261013000400_atomic_personnel_lifecycle.sql",
    "20261013000500_atomic_onboarding_template_commands.sql",
    "20261013000600_sign_in_roster_scan_lifecycle.sql",
    "20261014000100_atomic_calendar_configuration_commands.sql",
    "20261014000200_atomic_critical_task_reorder.sql",
    "20261014000300_critical_task_reorder_preconditions.sql",
    "20261014000400_nonretryable_password_attempt_conflict.sql",
    "20261014000500_onboarding_local_completion_day.sql",
    "20261015000100_calendar_lanes.sql",
    "20261016000100_status_type_label_and_order.sql",
    "20261018000100_set_based_completion_read_scope.sql",
    "20261019000100_set_based_critical_tasks_read_models.sql",
    "20261020000100_personnel_training_history.sql",
    "20261020000200_personnel_data_sheet_columns.sql",
    "20261020000300_personnel_log_attribution.sql",
    "20261020000400_counseling_conducted_by.sql",
    "20261020000500_personnel_extended_info_saver_stamp.sql",
    "20261020000600_set_based_calendar_read_scope.sql",
    "20261021000100_organization_feature_switches.sql",
    "20261021000200_organization_feature_switch_enforcement.sql",
    "20261022000100_calendar_availability_import.sql",
    "20261023000100_duty_roster_settings.sql",
    "20261023000200_personnel_attribute_history.sql",
    "20261023000300_status_type_roster_effect.sql",
    "20261023000400_daily_assignment_source.sql",
    "20261023000600_roster_assignment_writes.sql",
    "20261023000700_roster_starting_numbers.sql",
    "20261023000800_roster_inaugural_start_and_bounded_history.sql",
    "20261023000900_roster_close_server_only.sql",
    "20261023001000_calendar_availability_import_overlap_guard.sql",
    "20261023001100_preserve_daily_assignment_identity.sql",
    "20261023001200_roster_swaps.sql",
    "20261023001300_roster_signal_reads.sql",
    "20261024000500_group_editor_commands.sql",
    "20261025000100_platform_operator_safety.sql",
    "20261025050100_platform_organization_directory.sql",
)
STAGED_UPGRADE_FIXTURES = (
    "account_setup_populated_before.sql",
    "training_record_populated_before.sql",
    "critical_tasks_populated_before.sql",
    "critical_tasks_library_configure_before.sql",
    "calendar_unassigned_populated_before.sql",
    "personnel_unassigned_populated_before.sql",
    "personnel_counseling_file_populated_before.sql",
    "rating_scheme_populated_before.sql",
    "personnel_extended_info_populated_before.sql",
    "calendar_catalog_scope_before.sql",
    "training_catalog_configuration_before.sql",
    "personnel_group_reference_before.sql",
    "rating_scheme_evaluator_before.sql",
    "onboarding_reconciliation_before.sql",
    "organization_storage_cleanup_before.sql",
    "organization_file_upload_before.sql",
    "onboarding_start_before.sql",
    "deletion_request_cancellation_before.sql",
    "platform_membership_before.sql",
    "critical_task_archive_retention_before.sql",
    "account_preferences_scope_before.sql",
    "training_readiness_goal_before.sql",
    "calendar_availability_removal_before.sql",
    "access_request_approval_basis_before.sql",
    "governance_direct_writes_before.sql",
    "suspension_sql_admission_before.sql",
    "feature_direct_write_authority_before.sql",
    "group_catalog_scope_before.sql",
    "personnel_file_retirement_before.sql",
    "atomic_personnel_lifecycle_before.sql",
    "sign_in_roster_scan_lifecycle_before.sql",
    "calendar_lanes_before.sql",
    "status_type_label_order_before.sql",
    "organization_feature_switches_before.sql",
    "duty_roster_settings_before.sql",
    "status_type_roster_effect_before.sql",
    "daily_assignment_source_before.sql",
    "platform_operator_before.sql",
    "platform_organization_directory_before.sql",
)
STAGED_UPGRADE_CONTRACTS = (
    "account_setup_populated_after.sql",
    "training_record_populated_after.sql",
    "critical_tasks_populated_after.sql",
    "critical_tasks_library_configure_after.sql",
    "critical_tasks_task_reference_after.sql",
    "calendar_unassigned_populated_after.sql",
    "personnel_unassigned_populated_after.sql",
    "personnel_counseling_file_populated_after.sql",
    "rating_scheme_populated_after.sql",
    "personnel_extended_info_populated_after.sql",
    "calendar_catalog_scope_after.sql",
    "training_catalog_configuration_after.sql",
    "personnel_group_reference_after.sql",
    "rating_scheme_evaluator_after.sql",
    "personnel_archive_retention_after.sql",
    "onboarding_reconciliation_after.sql",
    "organization_storage_cleanup_after.sql",
    "organization_file_upload_after.sql",
    "onboarding_start_after.sql",
    "deletion_request_cancellation_after.sql",
    "platform_membership_after.sql",
    "critical_task_archive_retention_after.sql",
    "account_preferences_scope_after.sql",
    "training_readiness_goal_after.sql",
    "calendar_availability_removal_after.sql",
    "access_request_approval_basis_after.sql",
    "governance_direct_writes_after.sql",
    "suspension_sql_admission_after.sql",
    "feature_direct_write_authority_after.sql",
    "group_catalog_scope_after.sql",
    "personnel_file_retirement_after.sql",
    "atomic_personnel_lifecycle_after.sql",
    "sign_in_roster_scan_lifecycle_after.sql",
    "calendar_lanes_after.sql",
    "status_type_label_order_after.sql",
    "organization_feature_switches_after.sql",
    "duty_roster_settings_after.sql",
    "status_type_roster_effect_after.sql",
    "daily_assignment_source_after.sql",
    "platform_operator_after.sql",
    "platform_organization_directory_after.sql",
)
# Fresh SQL contracts that must also hold after the staged upgrade.
STAGED_UPGRADE_SQL_TESTS = (
    "platform_operator_authorization.sql",
    "platform_organization_directory.sql",
    "calendar_assignment_atomic_replacement.sql",
    "calendar_assignment_atomic_concurrency.sql",
    "daily_assignment_source.sql",
    "roster_close_server_only.sql",
    "roster_inaugural_start_and_bounded_history.sql",
    "password_attempt_reconciliation.sql",
    "calendar_availability_import.sql",
    "calendar_availability_import_concurrency.sql",
    "roster_swaps.sql",
    "roster_swaps_concurrency.sql",
)

_receipt = None
_interrupt_signal = None
_deferred_signal = None
_spawning = False
PROC_ROOT = Path('/proc')


def process_identity(pid):
    """Linux PID start time prevents a recycled PID from being an owner."""
    fields = (Path('/proc') / str(pid) / 'stat').read_text().rsplit(')', 1)[1].split()
    return {'pid': pid, 'start': fields[19]}


def live_processes(workdir=None, group=None, denied=None):
    for proc in PROC_ROOT.iterdir():
        if not proc.name.isdigit():
            continue
        try:
            if proc.stat().st_uid != os.getuid():
                continue
            fields = (proc / 'stat').read_text().rsplit(')', 1)[1].split()
            if fields[0] == 'Z':
                continue
            if group is not None and int(fields[2]) == group:
                yield int(proc.name)
                continue
            if workdir is not None:
                try:
                    link = os.readlink(proc / 'cwd')
                except PermissionError:
                    if denied is None:
                        raise
                    denied[int(proc.name)] = int(fields[19])
                    continue
                cwd = Path(link.removesuffix(' (deleted)'))
                if cwd == workdir or workdir in cwd.parents:
                    yield int(proc.name)
        except (FileNotFoundError, ProcessLookupError):
            continue


def denied_cwd_excluded(pid, start, producer_start, inits):
    proc = PROC_ROOT / str(pid)
    try:
        cgroup = (proc / 'cgroup').read_text() if start >= producer_start else ''
        # Identity is read last, so an unchanged start proves the scanned process supplied the cgroup.
        current = int((proc / 'stat').read_text().rsplit(')', 1)[1].split()[19])
    except OSError:
        return False
    # Producer descendants start no earlier than the producer and never outlive the boot.
    return current == start and (start < producer_start or (pid in inits and inits[pid] in cgroup))


def quiesce(process):
    """Stop the owned command session, including wrappers' grandchildren."""
    previous = {sig: signal.signal(sig, signal.SIG_IGN) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        deadline = time.monotonic() + 1
        while list(live_processes(group=process.pid)) and time.monotonic() < deadline:
            time.sleep(0.01)
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.communicate(timeout=1)
        if list(live_processes(group=process.pid)):
            raise RuntimeError('Owned command processes did not become quiescent')
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


class JobReceipt:
    """Only this Actions job's disposable projects may reach its finalizer."""
    def __init__(self, path, *, create=False, endpoint=None):
        owner = {key: os.environ[key] for key in ('GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_JOB', 'GITHUB_REPOSITORY')}
        if not all(re.fullmatch(r'[0-9]+', owner[key]) for key in ('GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT')):
            raise ValueError('Invalid Actions run identity')
        if not re.fullmatch(r'[A-Za-z0-9_-]+', owner['GITHUB_JOB']):
            raise ValueError('Invalid Actions job identity')
        expected = Path(os.environ['RUNNER_TEMP']).resolve() / (
            f"t2t-ci-db-{owner['GITHUB_RUN_ID']}-{owner['GITHUB_RUN_ATTEMPT']}-{owner['GITHUB_JOB']}.json")
        self.path = Path(path)
        if self.path != expected or self.path.is_symlink():
            raise ValueError('Receipt must be the exact current Actions job path')
        if create:
            if self.path.exists():
                raise ValueError('An existing cleanup receipt must be finalized first')
            self.data = {'version': 1, 'owner': owner, 'uid': os.getuid(),
                         'producer': process_identity(os.getpid()), 'command': None,
                         'docker': endpoint, 'projects': []}
            self.save()
        else:
            info = self.path.stat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
                raise ValueError('Cleanup receipt is not private to this runner user')
            self.data = json.loads(self.path.read_text())
            if (self.data['version'] != 1 or self.data['owner'] != owner or self.data['uid'] != os.getuid()):
                raise ValueError('Cleanup receipt belongs to another job')
        address = urlsplit(self.data['docker'])
        if (address.scheme != 'unix' or address.netloc or not address.path.startswith('/')
                or address.query or address.fragment):
            raise ValueError('Cleanup requires the original local Docker Unix socket')

    def save(self):
        temporary_name = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', dir=self.path.parent, delete=False) as temporary:
                temporary_name = temporary.name
                json.dump(self.data, temporary)
                temporary.flush()
                os.fsync(temporary.fileno())
            os.replace(temporary_name, self.path)
        finally:
            if temporary_name:
                Path(temporary_name).unlink(missing_ok=True)

    def add(self, workdir):
        config = workdir / 'supabase/config.toml'
        self.data['projects'].append({'path': str(workdir), 'id': workdir.name,
                                     'config': hashlib.sha256(config.read_bytes()).hexdigest(),
                                     'resourcesAbsent': False})
        self.save()

    def environment(self):
        environment = clean_environment()
        for key in ('DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
            environment.pop(key, None)
        environment['DOCKER_HOST'] = self.data['docker']
        return environment


def owned_resources(execute, workdir, project_id):
    resources = {'testContainer': [], 'init': {}}
    for kind, command in (('container', ['docker', 'ps', '-a', '--no-trunc']),
                          ('volume', ['docker', 'volume', 'ls']),
                          ('network', ['docker', 'network', 'ls'])):
        ids = []
        for selector in (f'name={project_id}', f'label=com.supabase.cli.project={project_id}'):
            result = execute([*command, '--filter', selector, '--format', '{{.ID}}' if kind == 'container' else '{{.Name}}'], workdir, quiet=True)
            ids.extend(result.stdout.split())
        ids = list(dict.fromkeys(ids))
        resources[kind] = ids
        if not ids:
            continue
        inspected = json.loads(execute(['docker', kind, 'inspect', *ids], workdir, quiet=True).stdout)
        if len(inspected) != len(ids):
            raise ValueError('Docker resource inventory could not be fully inspected')
        for item in inspected:
            name = item['Name'].lstrip('/')
            identity = item['Id'] if kind == 'container' else name
            if identity not in ids:
                raise ValueError('Docker inspection returned another resource')
            labels = item.get('Config', {}).get('Labels', {}) if kind == 'container' else item.get('Labels', {})
            canonical_name = name.startswith('supabase_') and name.endswith('_' + project_id)
            test_runner = kind == 'container' and item.get('Config', {}).get('Image') in PG_PROVE_IMAGES
            if ((not canonical_name and not test_runner)
                    or labels.get('com.supabase.cli.project') != project_id
                    or labels.get('com.docker.compose.project') != project_id):
                raise ValueError('Docker resource does not match the exact owned project')
            if test_runner:
                resources['testContainer'].append(identity)
            if kind == 'container':
                if item.get('State', {}).get('Running'):
                    resources['init'][item['State']['Pid']] = identity
                print(json.dumps({'project': project_id, 'container': name,
                                  'imageId': item.get('Image'), 'image': item.get('Config', {}).get('Image'),
                                  'hostMachine': os.uname().machine}), flush=True)
            if kind == 'network':
                for identity in item.get('Containers', {}):
                    if identity not in resources['container']:
                        raise ValueError('Owned network contains an unrelated container')
    return resources


def cleanup_owned_projects(receipt, *, producer_may_run=False):
    try:
        if (process_identity(receipt.data['producer']['pid']) == receipt.data['producer']
                and not (producer_may_run and receipt.data['producer']['pid'] == os.getpid())):
            raise RuntimeError('The database producer is still running')
    except FileNotFoundError:
        pass
    execute = partial(run, environment=receipt.environment())
    for project in list(receipt.data['projects']):
        workdir = Path(project['path'])
        present = workdir.exists()
        if (not re.fullmatch(r't2t-ci-db-[a-z0-9_]{8}', project['id'])
                or workdir.name != project['id'] or workdir.parent != Path(tempfile.gettempdir()).resolve()
                or workdir.is_symlink()
                or (present and (not workdir.is_dir() or workdir.stat().st_uid != os.getuid()))):
            raise ValueError('Project directory is not this job-owned disposable directory')
        if not project['resourcesAbsent']:
            if not present:
                raise ValueError('Disposable project directory disappeared before resource cleanup')
            config_path = workdir / 'supabase/config.toml'
            config = tomllib.loads(config_path.read_text())
            if (hashlib.sha256(config_path.read_bytes()).hexdigest() != project['config']
                    or config['project_id'] != project['id']
                    or config['db']['seed'] != {'enabled': False, 'sql_paths': []}):
                raise ValueError('Disposable project configuration changed')
        group = receipt.data['command']['pid'] if receipt.data['command'] else None
        denied = {}
        if list(live_processes(workdir, group, denied)):
            raise RuntimeError('Owned startup processes are still running')
        inspection_directory = workdir if present else receipt.path.parent
        resources = owned_resources(execute, inspection_directory, project['id'])
        if denied:
            producer_start = int(receipt.data['producer']['start'])
            if not all(denied_cwd_excluded(pid, start, producer_start, resources['init'])
                       for pid, start in denied.items()):
                raise RuntimeError('A process with an unreadable working directory may be an owned startup process')
        if project['resourcesAbsent']:
            if any(resources.values()):
                raise RuntimeError('Docker resources reappeared after verified cleanup')
        else:
            for identity in resources['testContainer']:
                execute(['docker', 'rm', '--force', identity], workdir, quiet=True, check=False)
            if any(resources.values()):
                execute(['supabase', 'stop', '--project-id', project['id'], '--no-backup'], workdir)
            if any(owned_resources(execute, workdir, project['id']).values()):
                raise RuntimeError('Disposable Docker resources remain after cleanup')
            project['resourcesAbsent'] = True
            receipt.save()
        if present:
            shutil.rmtree(workdir)
        if workdir.exists():
            raise RuntimeError('Disposable project directory remains after cleanup')
        receipt.data['projects'].remove(project)
        receipt.save()
        print(f"Cleaned up disposable project {project['id']}.", flush=True)
    receipt.path.unlink()


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


# Not a credential. supabase/setup-cli sets it so the CLI pulls its images from
# GHCR, because the ECR Public default rate-limits shared CI runners.
INHERITED_SUPABASE_SETTINGS = ("SUPABASE_INTERNAL_IMAGE_REGISTRY",)


def clean_environment():
    return {
        key: value for key, value in os.environ.items()
        if key in INHERITED_SUPABASE_SETTINGS or (not key.startswith("PG") and not any(
            marker in key for marker in (
                "SUPABASE", "DATABASE", "RESEND", "STRIPE", "E2E", "S3_",
                "OPENAI_API_KEY", "ACCOUNT_SETUP", "APP_PUBLIC_ORIGIN", "PUBLIC_APP_ORIGIN",
                "PUBLIC_SITE_URL",
            )
        ))
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


def startup_diagnostics(output):
    lines = []
    for line in output.splitlines():
        if not re.search(r'error|toomanyrequests|timeout|denied', line, re.IGNORECASE):
            continue
        line = re.sub(r'(://)[^/\s@]+@', r'\1[REDACTED]@', line)
        line = re.sub(
            r'\b(?:eyJ[\w-]*\.[\w-]+\.[\w-]+|sb_(?:secret|publishable)_[\w-]+|sbp_\w+|'
            r'gh[pousr]_\w+|github_pat_\w+|sk-[\w-]+)\b', '[REDACTED]', line)
        line = re.sub(r'\b(?:Bearer|Basic)\s+\S+', '[REDACTED]', line, flags=re.IGNORECASE)
        # Opaque or quoted credentials can contain spaces. Suppress the whole value suffix.
        line = re.sub(
            r'''(\b[\w-]*(?:key|token|jwt|password|secret|auth)[\w-]*\b["']?'''
            r'(?:\s*[:=]\s*|\s+)).*', r'\1[REDACTED]', line, flags=re.IGNORECASE)
        lines.append(line)
    return '\n'.join(lines)


def run(command, workdir, *, quiet=False, check=True, environment=None, input_text=None):
    global _spawning, _deferred_signal
    print("+ " + " ".join(command), flush=True)
    _spawning = True
    process = None
    try:
        process = subprocess.Popen(
            command, cwd=workdir, env=clean_environment() if environment is None else environment,
            stdout=subprocess.PIPE if quiet else None,
            stderr=subprocess.STDOUT if quiet else None,
            stdin=subprocess.PIPE if input_text is not None else None,
            text=True, start_new_session=True,
        )
        if _receipt:
            _receipt.data['command'] = process_identity(process.pid)
            _receipt.save()
    except BaseException:
        pending = _deferred_signal
        _deferred_signal = None
        if process is not None:
            quiesce(process)
        if pending:
            raise SystemExit(128 + pending)
        raise
    finally:
        _spawning = False
    try:
        pending = _deferred_signal
        _deferred_signal = None
        if pending:
            raise SystemExit(128 + pending)
        stdout, stderr = process.communicate(input_text)
    except BaseException:
        quiesce(process)
        raise
    finally:
        if _receipt and not list(live_processes(group=process.pid)):
            _receipt.data['command'] = None
            _receipt.save()
    result = subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
    if quiet and check and result.returncode:
        print("Command failed; credential-bearing startup output was suppressed.", flush=True)
        if command[:2] == ['supabase', 'start']:
            diagnostics = startup_diagnostics(result.stdout)
            if diagnostics:
                print(diagnostics, flush=True)
    if check and result.returncode:
        raise subprocess.CalledProcessError(result.returncode, command)
    return result


def _provider_environment(repository, workdir, execute):
    status_output = execute(["supabase", "status", "-o", "json"], workdir, quiet=True).stdout
    # CLI notices can surround the JSON in combined output. Never print the
    # credential-bearing body; expose only this disposable project's values.
    json_start = status_output.find("{")
    if json_start < 0:
        raise RuntimeError("Disposable Supabase status contained no JSON")
    status, _ = json.JSONDecoder().raw_decode(status_output[json_start:])
    environment = _receipt.environment() if _receipt else local_docker_environment(repository)
    environment.update({
        "T2T_PROBE_API_URL": status["API_URL"],
        "T2T_PROBE_SERVICE_KEY": status["SERVICE_ROLE_KEY"],
        "T2T_PROBE_ANON_KEY": status["ANON_KEY"],
    })
    return environment


def validate_seeds(repository, workdir, execute, psql):
    errors = []

    def check_seed(name, sql):
        print(f'Checking seed schema: {name}', flush=True)
        result = execute([*psql[:2], '-i', *psql[2:], '-X', '-q', '-v', 'VERBOSITY=terse'],
                         workdir, input_text=sql, quiet=True, check=False)
        if result.returncode:
            reason = '\n'.join(line for line in result.stdout.splitlines() if 'ERROR:' in line)
            errors.append(f'{name}: {reason or "psql failed"}. Update the seed for the replayed schema.')

    demo = (repository / 'scripts/demo-clinic/seed.sql').read_text()
    # The demo owns its transaction. Move its boundary around the prerequisite fixture too.
    demo, starts = re.subn(r'^BEGIN;\s*$', '', demo, count=1, flags=re.MULTILINE)
    demo, ends = re.subn(r'COMMIT;\s*$', '', demo)
    if starts != 1 or ends != 1:
        raise ValueError('Review scripts/demo-clinic/seed.sql transaction boundaries before seed validation')
    prerequisite = (repository / 'scripts/ci/demo-seed-before.sql').read_text()
    check_seed('scripts/demo-clinic/seed.sql', f'BEGIN;\n{prerequisite}\n{demo}\nROLLBACK;\n')
    generated = execute(['node', str(repository / 'scripts/ci/seed-columns.mjs')], workdir, quiet=True).stdout
    check_seed('perf-workloads.mjs generated columns', generated)
    if errors:
        raise ValueError('\n'.join(errors))
    print('SQL seeds rolled back and generated performance seed columns resolved.', flush=True)


def validate(repository, *, staged_upgrade=False):
    global _spawning, _deferred_signal
    execute = partial(run, environment=_receipt.environment() if _receipt else local_docker_environment(repository))
    source = tomllib.loads((repository / "supabase/config.toml").read_text())
    held_ports = reserve_ports(len(list(port_fields(source))))
    workdir = Path(tempfile.mkdtemp(prefix="t2t-ci-db-"))
    project_id = workdir.name
    container = f"supabase_db_{project_id}"
    runner = f"supabase_pgprove_{project_id}"
    started = False
    runner_started = False
    registered = False
    try:
        ports = [sock.getsockname()[1] for sock in held_ports]
        config = prepare_project(repository, workdir, project_id, ports)
        if _receipt:
            _spawning = True
            try:
                _receipt.add(workdir)
                registered = True
            finally:
                _spawning = False
            pending = _deferred_signal
            _deferred_signal = None
            if pending:
                raise SystemExit(128 + pending)
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
            for path in (*(f"migration-tests/{name}" for name in STAGED_UPGRADE_CONTRACTS),
                         *(f"tests/{name}" for name in STAGED_UPGRADE_SQL_TESTS)):
                execute([
                    "docker", "run", "--rm", "--name", runner,
                    "--label", f"com.supabase.cli.project={project_id}",
                    "--label", f"com.docker.compose.project={project_id}",
                    "--network", f"supabase_network_{project_id}",
                    "--mount", f"type=bind,src={workdir / 'supabase'},dst=/tests,readonly",
                    "-e", "PGHOST=db", "-e", "PGPORT=5432", "-e", "PGUSER=postgres",
                    "-e", "PGPASSWORD=postgres", "-e", "PGDATABASE=postgres",
                    PG_PROVE_IMAGE, "pg_prove", "--verbose",
                    f"/tests/{path}",
                ], workdir)
            run(["node", str(repository / "scripts/ci/personnel_group_upgrade_provider_probe.mjs")],
                workdir, environment=_provider_environment(repository, workdir, execute))
            run(["node", str(repository / "scripts/ci/personnel_retention_provider_probe.mjs"),
                 "--staged-upgrade"], workdir,
                environment=_provider_environment(repository, workdir, execute))
            run(["node", str(repository / "scripts/ci/onboarding_start_provider_probe.mjs")],
                workdir, environment=_provider_environment(repository, workdir, execute))
            print("Populated account setup, Training, Critical Tasks, Calendar, Personnel, counseling file, Rating Scheme, extended info, Onboarding, Organization Storage and account preference scope upgrades passed.", flush=True)
            return
        execute(["npm", "run", "db:test"], workdir)
        runner_started = True
        for migration_test in (
            "calendar_group_assignees.sql",
            "account_setup_claim_gate.sql",
            "account_setup_staff_release.sql",
            "organization_storage_cleanup_fresh.sql",
            "organization_file_upload_fresh.sql",
            "training_readiness_goal_fresh.sql",
        ):
            execute([
                "docker", "run", "--rm", "--name", runner,
                "--label", f"com.supabase.cli.project={project_id}",
                "--label", f"com.docker.compose.project={project_id}",
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
        provider_environment = _provider_environment(repository, workdir, execute)
        run(["node", str(repository / "scripts/ci/account_setup_provider_probe.mjs")],
            workdir, environment=provider_environment)
        run(["node", str(repository / "scripts/ci/personnel_roster_provider_probe.mjs")],
            workdir, environment=provider_environment)
        run(["node", str(repository / "scripts/ci/personnel_retention_provider_probe.mjs")],
            workdir, environment=provider_environment)
        run(["node", str(repository / "scripts/ci/onboarding_start_provider_probe.mjs")],
            workdir, environment=provider_environment)
        # The legacy dump advances sequences even when rolled back. Keep it after contracts.
        validate_seeds(repository, workdir, execute, psql)
        print("Fresh replay, SQL contracts, migration regressions and provider probes passed.", flush=True)
    finally:
        for sock in held_ports:
            sock.close()
        if registered and _interrupt_signal:
            print(f"Cancellation quiesced; finalizer retains disposable project {project_id}.", flush=True)
        elif registered:
            cleanup_owned_projects(_receipt, producer_may_run=True)
        else:
            cleanup_standalone(execute, workdir, project_id, runner, started, runner_started)


def cleanup_standalone(execute, workdir, project_id, runner, started, runner_started):
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
    global _receipt, _interrupt_signal
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--receipt', type=Path)
    modes.add_argument('--cleanup', type=Path)
    args = parser.parse_args()

    def interrupted(signum, _frame):
        global _interrupt_signal, _deferred_signal
        _interrupt_signal = signum
        if _spawning:
            _deferred_signal = signum
        else:
            raise SystemExit(128 + signum)

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, interrupted)
    try:
        repository = Path(__file__).resolve().parents[2]
        if args.cleanup:
            if not args.cleanup.exists() and not args.cleanup.is_symlink():
                print('No pending disposable database receipt.', flush=True)
                return
            cleanup_owned_projects(JobReceipt(args.cleanup))
            return
        if args.receipt:
            environment = local_docker_environment(repository)
            _receipt = JobReceipt(args.receipt, create=True, endpoint=environment['DOCKER_HOST'])
        validate(repository)
        validate(repository, staged_upgrade=True)
    except (subprocess.CalledProcessError, OSError, ValueError, RuntimeError, KeyError, TypeError) as error:
        print(f"Database validation failed: {error}", flush=True)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
