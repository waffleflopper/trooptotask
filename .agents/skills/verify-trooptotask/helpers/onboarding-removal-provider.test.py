"""Offline target/ordering/cleanup guards; not provider concurrency acceptance."""

import copy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
import uuid

source = Path(__file__).with_name("onboarding-removal-provider.py")
spec = importlib.util.spec_from_file_location("removal_provider", source)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def cohort():
    org, group, author, person, packet, *steps = [str(uuid.uuid4()) for _ in range(8)]
    fixture = {"ids": {"orgA": org, "groupA": group}, "dates": {"ui": "2026-10-02"},
               "actors": {"onboardingConfigure": {"id": author}}}
    seed = {"kind": "onboarding-legacy", "tag": "deadbeef",
            "person": {"id": person, "organization_id": org, "group_id": group, "rank": "SPC",
                       "first_name": "Synthetic", "last_name": "MapLegacydeadbeef", "slug": "map-legacy-deadbeef"},
            "packets": [{"id": packet, "organization_id": org, "personnel_id": person,
                         "template_id": None, "started_at": "2026-10-02", "status": "in_progress"}],
            "progress": []}
    for index, (name, kind, done, stages, stage) in enumerate([
        ("Orientation", "checkbox", True, None, None),
        ("Paperwork", "paperwork", False, ["Submitted", "Reviewed", "Filed"], "Reviewed"),
        ("Historic task", "checkbox", True, None, None)
    ]):
        seed["progress"].append({"id": steps[index], "organization_id": org, "onboarding_id": packet,
                                 "template_step_id": None, "step_name": name, "step_type": kind,
                                 "completed": done, "stages": stages, "current_stage": stage,
                                 "sort_order": index, "active": True,
                                 "notes": [{"text": "Legacy retained work deadbeef",
                                            "timestamp": "2000-01-01T12:00:00.000Z", "userId": author}]})
    ledger = {"seeded": [{"kind": "onboarding-legacy", "tag": "deadbeef", "organization": "orgA",
                           "table": table, "ids": ids} for table, ids in [
        ("personnel", [person]), ("personnel_onboardings", [packet]), ("onboarding_step_progress", steps)
    ]]}
    return seed, fixture, ledger


def writer(pid, kind, paths):
    return {"pid": pid, "backend_start": "2026-10-02 12:00:00+00", "query_class": kind,
            "blocking_paths": paths}


class TargetGuards(unittest.TestCase):
    def test_original_ledger_cohort_selects_only_paperwork(self):
        seed, fixture, ledger = cohort()
        seed["progress"].reverse()
        org, person, packet, target = probe.validate_seed(seed, fixture, ledger)
        self.assertEqual((org, person["id"], packet["id"], target["id"]),
                         (fixture["ids"]["orgA"], seed["person"]["id"], seed["packets"][0]["id"], seed["progress"][1]["id"]))

    def test_missing_or_foreign_ledger_target_is_rejected(self):
        for change in ("missing", "foreign", "wrong-tag"):
            with self.subTest(change=change):
                seed, fixture, ledger = cohort()
                if change == "missing":
                    ledger["seeded"][-1]["ids"].remove(seed["progress"][1]["id"])
                elif change == "foreign":
                    ledger["seeded"][-1]["organization"] = "orgB"
                else:
                    ledger["seeded"][-1]["tag"] = "cafebabe"
                with self.assertRaises(probe.Blocked):
                    probe.validate_seed(seed, fixture, ledger)

    def test_forged_capture_or_saved_work_is_rejected(self):
        for field, value in (("active", False), ("completed", True), ("current_stage", "Filed"),
                             ("notes", []), ("organization_id", str(uuid.uuid4()))):
            with self.subTest(field=field):
                seed, fixture, ledger = cohort()
                seed["progress"][1][field] = value
                with self.assertRaises(probe.Blocked):
                    probe.validate_seed(seed, fixture, ledger)

    def test_noncanonical_uuid_is_rejected(self):
        for value in ("not-a-uuid", str(uuid.uuid4()).upper(), 4):
            with self.subTest(value=value), self.assertRaises(probe.Blocked):
                probe.uid(value)


class WriterOrdering(unittest.TestCase):
    def setUp(self):
        self.rpc = writer(120, "reconciliation-ordinary-rpc", [[120, 100]])
        self.delete = writer(130, "progress-ordinary-delete", [[130, 120, 100]])

    def test_requires_separate_first_rpc_observation_then_transitive_delete_wait(self):
        first, completed = probe.ordered_waits([self.rpc], None)
        self.assertFalse(completed)
        _, completed = probe.ordered_waits([self.rpc, self.delete], first)
        self.assertTrue(completed)

    def test_delete_started_before_checkpoint_is_inconclusive(self):
        with self.assertRaises(probe.Blocked):
            probe.ordered_waits([self.rpc, self.delete], None)

    def test_parallel_direct_holder_wait_does_not_prove_rpc_precedence(self):
        self.delete["blocking_paths"] = [[130, 100]]
        with self.assertRaises(probe.Blocked):
            probe.ordered_waits([self.rpc, self.delete], self.rpc)

    def test_reused_pid_other_backend_or_extra_writer_is_rejected(self):
        replacement = copy.deepcopy(self.rpc)
        replacement["backend_start"] = "2026-10-02 12:01:00+00"
        unknown = writer(140, None, [[140, 100]])
        for waiting in ([replacement], [self.rpc, self.delete, unknown], [self.rpc, copy.deepcopy(self.rpc)]):
            with self.subTest(waiting=waiting), self.assertRaises(probe.Blocked):
                probe.ordered_waits(waiting, self.rpc)


class PreparedRows(unittest.TestCase):
    def setUp(self):
        seed, fixture, ledger = cohort()
        self.instance = probe.Probe.__new__(probe.Probe)
        self.instance.seed = seed
        (self.instance.org, self.instance.person, self.instance.packet,
         self.instance.target) = probe.validate_seed(seed, fixture, ledger)
        self.instance.target_id = self.instance.target["id"]
        org = fixture["ids"]["orgA"]
        old, current, definition = [str(uuid.uuid4()) for _ in range(3)]
        self.snapshot = {
            "person": {**seed["person"], "archived_at": None},
            "packets": [{**seed["packets"][0], "template_id": current,
                         "completed_at": None, "cancelled_at": None}],
            "progress": copy.deepcopy(seed["progress"]),
            "templates": [{"id": template, "organization_id": org} for template in (old, current)],
            "definitions": [{"id": definition, "organization_id": org, "template_id": old,
                             "name": "Paperwork", "step_type": "paperwork",
                             "stages": ["Submitted", "Reviewed", "Filed"]}]
        }
        self.snapshot["progress"][1].update(active=False, template_step_id=definition)

    def test_linked_inactive_work_from_another_template_can_be_observed(self):
        self.instance.validate_prepared(self.snapshot, wait=True)

    def test_wait_rejects_active_unlinked_current_or_changed_work(self):
        for change in ("active", "unlinked", "current", "note", "archived"):
            with self.subTest(change=change):
                snapshot = copy.deepcopy(self.snapshot)
                if change == "active":
                    snapshot["progress"][1]["active"] = True
                elif change == "unlinked":
                    snapshot["progress"][1]["template_step_id"] = None
                elif change == "current":
                    snapshot["packets"][0]["template_id"] = snapshot["definitions"][0]["template_id"]
                elif change == "note":
                    snapshot["progress"][1]["notes"] = []
                else:
                    snapshot["person"]["archived_at"] = "2026-10-01"
                with self.assertRaises(probe.Blocked):
                    self.instance.validate_prepared(snapshot, wait=True)


class ControlledOutputAndCleanup(unittest.TestCase):
    def test_multiline_json_rows_and_non_json_rejection(self):
        self.assertEqual(probe.decode_json_values(' {"rows":[{"id":1},\n {"id":2}]}\n {"ok":true}\n'),
                         [{"rows": [{"id": 1}, {"id": 2}]}, {"ok": True}])
        for stdout in ('{"ok":true}NOTICE: unexpected', '{}{}', 'NOTICE: not JSON'):
            with self.subTest(stdout=stdout), self.assertRaises((probe.Blocked, json.JSONDecodeError)):
                probe.decode_json_values(stdout)

    def fault_probe(self, state):
        instance = probe.Probe.__new__(probe.Probe)
        instance.function, instance.marker = "owned_fault", "owned-marker"
        instance.object_state = Mock(side_effect=[state, {"function_exists": False, "trigger": None}])
        instance.sql = Mock(return_value={"event": "fault-removed"})
        return instance

    def test_foreign_fault_marker_or_function_never_reaches_drop(self):
        for state in (
            {"function_exists": True, "function_marker": "other-owner", "function_oid": "4", "trigger": None},
            {"function_exists": True, "function_marker": "owned-marker", "function_oid": "4",
             "trigger": {"marker": "other-owner", "function_oid": "4"}},
            {"function_exists": True, "function_marker": "owned-marker", "function_oid": "4",
             "trigger": {"marker": "owned-marker", "function_oid": "5"}}
        ):
            with self.subTest(state=state):
                instance = self.fault_probe(state)
                with self.assertRaises(probe.Blocked):
                    instance.remove_fault()
                instance.sql.assert_not_called()

    def test_owned_fault_removal_requires_catalog_absence(self):
        state = {"function_exists": True, "function_marker": "owned-marker", "function_oid": "4",
                 "trigger": {"marker": "owned-marker", "function_oid": "4"}}
        instance = self.fault_probe(state)
        self.assertEqual(instance.remove_fault(), {"function_exists": False, "trigger": None})
        instance = self.fault_probe(state)
        instance.object_state.side_effect = [state, state]
        with self.assertRaises(probe.Blocked):
            instance.remove_fault()

    def test_cleanup_failure_is_explicit_and_preserves_original_failure(self):
        instance = probe.Probe.__new__(probe.Probe)
        instance.remove_fault = Mock(side_effect=probe.Blocked("Catalog unavailable"))
        instance.save = Mock()
        with patch.object(probe.signal, "signal"), self.assertRaises(probe.Blocked):
            instance.cleanup_failed_install(probe.Blocked("Installation interrupted"))
        recorded = instance.save.call_args.args[1]
        self.assertFalse(recorded["fault_absence_proven"])
        self.assertEqual(recorded["original_failure"]["message"], "Installation interrupted")
        self.assertEqual(recorded["cleanup_failure"]["message"], "Catalog unavailable")


if __name__ == "__main__":
    unittest.main()
