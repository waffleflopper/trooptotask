"""Protect isolation and cleanup at the process/filesystem boundary, without Docker."""

import contextlib
import errno
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import tomllib
import unittest
from unittest.mock import patch

import database


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
        with patch.dict(os.environ, {**secrets, "PATH": os.defpath}, clear=True), \
                contextlib.redirect_stdout(io.StringIO()):
            result = database.run(
                [sys.executable, "-c", "import json, os; print(json.dumps(dict(os.environ)))"],
                self.repository, quiet=True,
            )
        inherited = json.loads(result.stdout)
        self.assertTrue(secrets.keys().isdisjoint(inherited))
        self.assertEqual(inherited["PATH"], os.defpath)

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


if __name__ == "__main__":
    unittest.main()
