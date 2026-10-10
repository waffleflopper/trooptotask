"""Review-failure ownership and recovery at filesystem/provider boundaries, without Docker."""

import copy
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import tomllib
import unittest
from unittest.mock import Mock, patch

from scripts.verification import environment


REQUEST = "11111111-1111-4111-8111-111111111111"
OTHER_REQUEST = "22222222-2222-4222-8222-222222222222"
ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
RESOURCE = "33333333-3333-4333-8333-333333333333"
PROJECT = "t2t-verify-" + "a" * 24
DATABASE_ID = "d" * 64


class SyntheticReviewDatabase:
    """A provider port with independently known request/control outcomes."""

    project = PROJECT
    container_id = DATABASE_ID

    def __init__(self, session):
        self.session = session
        self.request = {"id": REQUEST, "organization_id": ORG_A, "resource_type": "training_type",
                        "resource_id": RESOURCE, "status": "pending"}
        self.constraints = []
        self.mutations = []
        self.fail_arm = None
        self.fail_restore = None
        self.fail_readback = False

    def snapshot(self, _request_id=None):
        if self.fail_readback and self.mutations:
            self.fail_readback = False
            raise environment.Blocked("Synthetic readback interruption")
        return copy.deepcopy({"request": self.request, "constraints": self.constraints})

    def constraint(self, control):
        return {"name": control["constraint"], "type": "c", "validated": False,
                "definition": f"CHECK (((id <> '{REQUEST}'::uuid) OR (status <> 'approved'::text))) NOT VALID",
                "comment": f"{PROJECT}:{control['nonce']}:{REQUEST}"}

    def arm(self, control):
        # Recovery ownership must exist even if the provider commits then disconnects.
        receipt = json.loads((self.session / "deletion-review-failure.json").read_text())
        if receipt["request_id"] != REQUEST or receipt["phase"] != "arming":
            raise AssertionError("The mutation was dispatched before a recoverable ownership receipt")
        self.mutations.append(("arm", control["request_id"]))
        if self.fail_arm == "before":
            raise environment.Blocked("Synthetic install interruption")
        self.constraints = [self.constraint(control)]
        if self.fail_arm == "after":
            raise environment.Blocked("Synthetic install acknowledgement lost")

    def restore(self, control):
        receipt = json.loads((self.session / "deletion-review-failure.json").read_text())
        if receipt["phase"] != "restoring":
            raise AssertionError("The removal was dispatched before a recoverable ownership receipt")
        self.mutations.append(("restore", control["request_id"]))
        if self.fail_restore == "before":
            raise environment.Blocked("Synthetic restore interruption")
        self.constraints = []
        if self.fail_restore == "after":
            raise environment.Blocked("Synthetic restore acknowledgement lost")


class ReviewFailureOwnershipTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.session = Path(directory.name)
        self.receipt = self.session / "deletion-review-failure.json"
        environment.save(self.session / "fixtures.json", {"ids": {"orgA": ORG_A, "orgB": ORG_B}})
        environment.save(self.session / "verify-trooptotask-owned.json", {"seeded": [
            {"kind": "deletion-sources", "organization": "orgA", "table": "training_types", "ids": [RESOURCE]}
        ]})
        self.database = SyntheticReviewDatabase(self.session)
        provider = patch.object(environment, "ReviewFailureDatabase", return_value=self.database)
        self.provider = provider.start()
        self.addCleanup(provider.stop)

    def call(self, action, request_id=None):
        return environment.deletion_review_failure(self.session, action, request_id)

    def test_invalid_uuid_is_rejected_before_any_provider_operation(self):
        for value in ("not-a-uuid", ORG_A.upper(), REQUEST.replace("-", ""), "x'; DROP TABLE personnel;--"):
            with self.subTest(value=value), self.assertRaises(environment.Blocked):
                self.call("arm", value)
        self.provider.assert_not_called()
        self.assertEqual(self.database.mutations, [])
        self.assertFalse(self.receipt.exists())

    def test_nonpending_missing_foreign_and_unowned_targets_never_dispatch_mutations(self):
        original = copy.deepcopy(self.database.request)
        cases = [None, {**original, "status": "approved"}, {**original, "status": "cancelled"},
                 {**original, "id": OTHER_REQUEST},
                 {**original, "organization_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc"},
                 {**original, "organization_id": ORG_B}, {**original, "resource_id": OTHER_REQUEST},
                 {**original, "resource_type": "personnel"}, {**original, "resource_type": "unsupported"}]
        for request in cases:
            with self.subTest(request=request), self.assertRaises(environment.Blocked):
                self.database.request = request
                self.call("arm", REQUEST)
            self.assertEqual(self.database.mutations, [])
            self.assertFalse(self.receipt.exists())

    def test_a_source_from_another_seed_kind_is_not_adopted(self):
        environment.save(self.session / "verify-trooptotask-owned.json", {"seeded": [
            {"kind": "personnel-lifecycle", "organization": "orgA", "table": "training_types", "ids": [RESOURCE]}
        ]})
        with self.assertRaises(environment.Blocked):
            self.call("arm", REQUEST)
        self.assertEqual(self.database.mutations, [])

    def test_valid_saved_source_arms_without_requiring_a_surviving_resource_row(self):
        result = self.call("arm", REQUEST)
        self.assertTrue(result["armed"])
        self.assertEqual(result["target"], {"request_id": REQUEST, "organization_id": ORG_A,
                                          "resource_type": "training_type", "resource_id": RESOURCE})
        self.assertEqual(self.database.mutations, [("arm", REQUEST)])
        self.assertEqual(self.receipt.stat().st_mode & 0o077, 0)
        self.assertEqual(self.call("state")["phase"], "armed")
        self.assertTrue(self.call("restore")["restored"])
        self.assertEqual(self.database.constraints, [])
        self.assertFalse(self.receipt.exists())

    def test_org_b_has_its_own_explicit_seed_ownership(self):
        self.database.request["organization_id"] = ORG_B
        environment.save(self.session / "verify-trooptotask-owned.json", {"seeded": [
            {"kind": "deletion-sources", "organization": "orgB", "table": "training_types", "ids": [RESOURCE]}
        ]})
        self.assertEqual(self.call("arm", REQUEST)["target"]["organization_id"], ORG_B)

    def test_preexisting_constraint_without_owned_receipt_is_never_adopted_or_dropped(self):
        self.database.constraints = [{"name": "t2t_verify_review_fail_foreign"}]
        for action in ("arm", "state", "restore"):
            with self.subTest(action=action), self.assertRaises(environment.Blocked):
                self.call(action, REQUEST if action == "arm" else None)
        self.assertEqual(self.database.mutations, [])
        self.assertFalse(self.receipt.exists())

    def test_foreign_receipt_or_changed_constraint_preserves_provider_state(self):
        self.call("arm", REQUEST)
        original = json.loads(self.receipt.read_text())
        mutations = list(self.database.mutations)
        for field, value in (("session", "/foreign"), ("project", "foreign-project"),
                             ("container_id", "f" * 64), ("constraint", "unrelated_check")):
            with self.subTest(field=field):
                environment.save(self.receipt, {**original, field: value})
                with self.assertRaises(environment.Blocked):
                    self.call("restore")
                self.assertEqual(self.database.mutations, mutations)
                self.assertTrue(self.receipt.exists())
        environment.save(self.receipt, original)
        observed = copy.deepcopy(self.database.constraints[0])
        for field, value in (("type", "f"), ("validated", True), ("comment", "someone else's control"),
                             ("definition", "CHECK ((status <> 'denied'::text)) NOT VALID")):
            with self.subTest(field=field):
                self.database.constraints = [{**observed, field: value}]
                with self.assertRaises(environment.Blocked):
                    self.call("restore")
                self.assertEqual(self.database.mutations, mutations)
                self.assertTrue(self.receipt.exists())

    def test_symlinked_ownership_is_refused_without_mutation(self):
        ledger = self.session / "verify-trooptotask-owned.json"
        saved = self.session / "ledger.json"
        ledger.rename(saved)
        ledger.symlink_to(saved)
        with self.assertRaises(environment.Blocked):
            self.call("arm", REQUEST)
        self.assertEqual(self.database.mutations, [])

    def test_empty_restore_is_safe_and_does_not_claim_a_drop(self):
        result = self.call("restore")
        self.assertEqual(result, {"status": "PASS", "armed": False, "restored": False, "phase": "clear", "target": None})
        self.assertEqual(self.database.mutations, [])

    def test_interrupted_arm_recovers_before_or_after_a_committed_install(self):
        for interruption in ("before", "after", "readback"):
            with self.subTest(interruption=interruption):
                self.database = SyntheticReviewDatabase(self.session)
                self.provider.return_value = self.database
                self.database.fail_arm = interruption if interruption != "readback" else None
                self.database.fail_readback = interruption == "readback"
                with self.assertRaises(environment.Blocked):
                    self.call("arm", REQUEST)
                self.assertTrue(self.receipt.exists())
                self.assertEqual(json.loads(self.receipt.read_text())["phase"], "arming")
                self.database.fail_arm = None
                self.assertTrue(self.call("arm", REQUEST)["armed"])
                self.assertEqual(sum(action == "arm" for action, _ in self.database.mutations),
                                 2 if interruption == "before" else 1)
                self.call("restore")
                self.assertFalse(self.receipt.exists())

    def test_interrupted_restore_retains_recovery_receipt_until_absence_is_confirmed(self):
        for interruption in ("before", "after", "readback"):
            with self.subTest(interruption=interruption):
                self.database = SyntheticReviewDatabase(self.session)
                self.provider.return_value = self.database
                self.call("arm", REQUEST)
                self.database.fail_restore = interruption if interruption != "readback" else None
                self.database.fail_readback = interruption == "readback"
                if interruption == "readback":
                    # Fail the post-drop readback, rather than the initial snapshot.
                    real_snapshot = self.database.snapshot
                    reads = 0

                    def after_drop(request_id=None):
                        nonlocal reads
                        reads += 1
                        if reads == 2:
                            raise environment.Blocked("Synthetic restore readback interruption")
                        self.database.fail_readback = False
                        return real_snapshot(request_id)

                    with patch.object(self.database, "snapshot", side_effect=after_drop), self.assertRaises(environment.Blocked):
                        self.call("restore")
                else:
                    with self.assertRaises(environment.Blocked):
                        self.call("restore")
                self.assertTrue(self.receipt.exists())
                self.assertEqual(json.loads(self.receipt.read_text())["phase"], "restoring")
                self.database.fail_restore = None
                self.call("restore")
                self.assertEqual(self.database.constraints, [])
                self.assertFalse(self.receipt.exists())

    def test_a_different_request_cannot_replace_or_restore_an_active_control(self):
        self.call("arm", REQUEST)
        before = copy.deepcopy(self.database.constraints)
        for action in ("arm", "state", "restore"):
            with self.subTest(action=action), self.assertRaises(environment.Blocked):
                self.call(action, OTHER_REQUEST)
        self.assertEqual(self.database.constraints, before)
        self.assertEqual(self.database.mutations, [("arm", REQUEST)])

    def interrupt_phase_write(self, phase):
        write = json.dump

        def interrupted(value, output, *args, **kwargs):
            if value.get("phase") == phase:
                # Fail after bytes have reached the real file, not before opening it.
                self.assertEqual(os.fstat(output.fileno()).st_mode & 0o077, 0)
                output.write('{"version": 1, "phase": "')
                output.flush()
                raise environment.Blocked("Synthetic interrupted receipt write")
            return write(value, output, *args, **kwargs)

        return patch.object(json, "dump", side_effect=interrupted)

    def test_post_commit_phase_write_interruption_retains_ownership_for_restore(self):
        original_files = set(self.session.iterdir())
        with self.interrupt_phase_write("armed"), self.assertRaises(environment.Blocked):
            self.call("arm", REQUEST)
        self.assertEqual(self.database.mutations, [("arm", REQUEST)])
        self.assertEqual(len(self.database.constraints), 1)
        receipt = json.loads(self.receipt.read_text())
        self.assertEqual(receipt["phase"], "arming")
        self.assertEqual(receipt["request_id"], REQUEST)
        self.assertEqual(set(self.session.iterdir()), original_files | {self.receipt})
        self.assertTrue(self.call("restore")["restored"])
        self.assertEqual(self.database.constraints, [])
        self.assertEqual(set(self.session.iterdir()), original_files)

    def test_pre_drop_phase_write_interruption_preserves_old_receipt_and_constraint(self):
        self.call("arm", REQUEST)
        original_receipt = self.receipt.read_bytes()
        original_files = set(self.session.iterdir())
        with self.interrupt_phase_write("restoring"), self.assertRaises(environment.Blocked):
            self.call("restore")
        self.assertEqual(self.receipt.read_bytes(), original_receipt)
        self.assertEqual(self.database.mutations, [("arm", REQUEST)])
        self.assertEqual(len(self.database.constraints), 1)
        self.assertEqual(set(self.session.iterdir()), original_files)
        self.assertTrue(self.call("restore")["restored"])
        self.assertEqual(self.database.constraints, [])
        self.assertFalse(self.receipt.exists())

    def test_initial_receipt_write_interruption_dispatches_no_constraint_mutation(self):
        original_files = set(self.session.iterdir())
        with self.interrupt_phase_write("arming"), self.assertRaises(environment.Blocked):
            self.call("arm", REQUEST)
        self.assertEqual(self.database.mutations, [])
        self.assertEqual(self.database.constraints, [])
        self.assertEqual(set(self.session.iterdir()), original_files)
        self.assertTrue(self.call("arm", REQUEST)["armed"])
        self.assertTrue(self.call("restore")["restored"])


class ReviewFailureProcessBoundaryTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.session = environment.private_session(directory.name)
        self.workdir = self.session / "provider"
        (self.workdir / "supabase").mkdir(parents=True)
        config = self.workdir / "supabase/config.toml"
        config.write_text(f'project_id = "{PROJECT}"\n')
        provider = self.session / "provider.json"
        environment.save(provider, {"API_URL": "http://127.0.0.1:54321", "ANON_KEY": "private-anon",
                                    "SERVICE_ROLE_KEY": "private-service"})
        self.records = []
        for index, service in enumerate(("db", "auth", "rest", "kong", "storage")):
            self.records.append({"Id": DATABASE_ID if service == "db" else str(index) * 64,
                                 "Name": f"/supabase_{service}_{PROJECT}", "State": {"Running": True},
                                 "Config": {"Labels": {"com.supabase.cli.project": PROJECT,
                                                       "com.docker.compose.project": PROJECT}}})
        self.state = {"version": 1, "session": str(self.session), "repository": str(Path(__file__).resolve().parents[2]),
                      "project": PROJECT, "docker_host": "unix:///var/run/docker.sock", "phase": "running",
                      "ports": {"api.port": 54321}, "config_sha256": environment.digest(config),
                      "provider_sha256": environment.digest(provider), "container_ids": [item["Id"] for item in self.records]}
        environment.save(self.session / "environment.json", self.state)
        self.commands = []

    def process(self, command, _directory, _environment, **_kwargs):
        self.commands.append(command)
        if command[:2] == ["docker", "ps"]:
            return "\n".join(item["Id"] for item in self.records)
        if command[:2] == ["docker", "inspect"]:
            return json.dumps(self.records)
        if command[:2] == ["docker", "exec"]:
            return json.dumps({"request": None, "constraints": []})
        self.fail(f"Unexpected process operation: {command[:2]}")

    def test_fixed_provider_reads_use_the_original_database_identity_and_local_connection(self):
        with patch.object(environment, "execute", side_effect=self.process):
            database = environment.ReviewFailureDatabase(self.session)
            self.assertEqual(database.snapshot(), {"request": None, "constraints": []})
        calls = [command for command in self.commands if command[:2] == ["docker", "exec"]]
        self.assertEqual(len(calls), 1)
        command = calls[0]
        self.assertEqual(command[4], DATABASE_ID)
        self.assertEqual(command[command.index("-h") + 1], "127.0.0.1")
        self.assertEqual(command[command.index("-p") + 1], "5432")
        self.assertIn("ON_ERROR_STOP=1", command)
        self.assertIn("-X", command)

    def test_foreign_socket_or_replaced_container_never_reaches_psql(self):
        for mismatch in ("socket", "container", "label"):
            with self.subTest(mismatch=mismatch):
                self.commands = []
                state = copy.deepcopy(self.state)
                records = copy.deepcopy(self.records)
                if mismatch == "socket":
                    state["docker_host"] = "tcp://production.invalid:2376"
                elif mismatch == "container":
                    records[0]["Id"] = "f" * 64
                else:
                    records[0]["Config"]["Labels"]["com.docker.compose.project"] = "existing-local"
                environment.save(self.session / "environment.json", state)
                original = self.records
                self.records = records
                with patch.object(environment, "execute", side_effect=self.process), self.assertRaises(environment.Blocked):
                    environment.ReviewFailureDatabase(self.session)
                self.assertFalse(any(command[:2] == ["docker", "exec"] for command in self.commands))
                self.records = original

    def test_new_control_process_failure_suppresses_credential_bearing_diagnostics(self):
        result = subprocess.CompletedProcess(["docker", "exec"], 1, "private-service", "private-service password failure")
        with patch.object(subprocess, "run", return_value=result), self.assertRaises(environment.Blocked) as blocked:
            environment.execute(["docker", "exec"], self.workdir, {}, suppress_diagnostic=True)
        self.assertNotIn("private-service", str(blocked.exception))
        self.assertNotIn("private-service", (self.workdir / "last-error.json").read_text())

    def test_cli_failure_is_json_only_and_does_not_expose_provider_output(self):
        output = io.StringIO()
        arguments = ["environment.py", "deletion-review-failure", str(self.session), "state"]
        with patch.object(sys, "argv", arguments), patch.object(environment, "ReviewFailureDatabase", side_effect=ValueError("private-service")), contextlib.redirect_stdout(output), self.assertRaises(SystemExit) as stopped:
            environment.main()
        self.assertEqual(stopped.exception.code, 2)
        self.assertEqual(json.loads(output.getvalue())["status"], "BLOCKED")
        self.assertNotIn("private-service", output.getvalue())


if __name__ == "__main__":
    unittest.main()


RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
USER = "44444444-4444-4444-8444-444444444444"


class TotpCodeTests(unittest.TestCase):
    def test_codes_match_rfc_6238_sha1_vectors(self):
        self.assertEqual(environment.totp(RFC_SECRET, 59), "287082")
        self.assertEqual(environment.totp(RFC_SECRET, 1111111109), "081804")

    def test_returns_only_the_current_code_for_the_newest_factor(self):
        database = Mock()
        database.totp_factor.return_value = {"secret": RFC_SECRET, "status": "unverified"}
        with patch.object(environment, "OwnedDatabase", return_value=database):
            result = environment.totp_code(Path("/unused"), USER, at=1111111109)
        self.assertEqual(result, {"status": "PASS", "factor": "unverified", "code": "081804"})
        database.totp_factor.assert_called_once_with(USER)

    def test_missing_factor_or_noncanonical_user_is_blocked(self):
        database = Mock()
        database.totp_factor.return_value = None
        with patch.object(environment, "OwnedDatabase", return_value=database) as owned:
            with self.assertRaises(environment.Blocked):
                environment.totp_code(Path("/unused"), USER)
            with self.assertRaises(environment.Blocked):
                environment.totp_code(Path("/unused"), ORG_A.upper())
        self.assertEqual(owned.call_count, 1)


class VerificationAuthConfigTests(unittest.TestCase):
    def test_enables_only_totp_and_owned_redirects(self):
        source = tomllib.loads((Path(__file__).resolve().parents[2] / "supabase/config.toml").read_text())
        config = environment.verification_auth_config(copy.deepcopy(source), "http://127.0.0.1:4100")
        self.assertEqual(config["auth"]["mfa"]["totp"], {"enroll_enabled": True, "verify_enabled": True})
        self.assertEqual(config["auth"]["site_url"], "http://127.0.0.1:4100")
        self.assertEqual(config["auth"]["additional_redirect_urls"], ["http://127.0.0.1:4100"])
        for changed in (config, source):
            changed["auth"]["mfa"].pop("totp")
            for key in ("site_url", "additional_redirect_urls"):
                changed["auth"].pop(key)
        self.assertEqual(config, source)
