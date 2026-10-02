"""Owned target and cleanup guards; no live Start/transaction acceptance."""
import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock
import uuid

spec = importlib.util.spec_from_file_location("start_provider", Path(__file__).with_name("onboarding-start-provider.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def cohort():
    org, group, person, template, training_type, training = [str(uuid.uuid4()) for _ in range(6)]
    fixture = {"ids": {"orgA": org, "groupA": group, "onboardingTemplate": template, "trainingRequired": training_type}}
    person_row = {"id": person, "organization_id": org, "group_id": group, "rank": "SPC",
                  "first_name": "Synthetic", "last_name": "MapStartdeadbeef", "slug": "map-start-deadbeef"}
    seed = {"kind": "onboarding-start", "tag": "deadbeef", "person": person_row, "people": [person_row],
            "packets": [], "progress": [], "templateId": template,
            "training": [{"id": training, "organization_id": org, "personnel_id": person,
                          "training_type_id": training_type, "completion_date": "1999-01-01", "expiration_date": "2000-01-01"}]}
    ledger = {"seeded": [{"kind": "onboarding-start", "tag": "deadbeef", "organization": "orgA",
                           "table": table, "ids": [row_id]}
                          for table, row_id in (("personnel", person), ("personnel_trainings", training))]}
    return seed, fixture, ledger


class TargetGuards(unittest.TestCase):
    def test_only_the_exact_owned_fresh_cohort_is_admitted(self):
        seed, fixture, ledger = cohort()
        org, person = probe.validate_seed(seed, fixture, ledger)
        self.assertEqual(org, fixture["ids"]["orgA"])
        self.assertEqual(person["id"], seed["person"]["id"])

    def test_missing_foreign_and_replaced_ledger_targets_are_rejected(self):
        for change in ("missing-person", "missing-training", "foreign", "wrong-tag", "extra-target"):
            with self.subTest(change=change):
                seed, fixture, ledger = cohort()
                if change == "missing-person":
                    ledger["seeded"].pop(0)
                elif change == "missing-training":
                    ledger["seeded"].pop()
                elif change == "foreign":
                    ledger["seeded"][0]["organization"] = "orgB"
                elif change == "wrong-tag":
                    ledger["seeded"][0]["tag"] = "cafebabe"
                else:
                    ledger["seeded"][0]["ids"].append(str(uuid.uuid4()))
                with self.assertRaises(probe.Blocked):
                    probe.validate_seed(seed, fixture, ledger)

    def test_foreign_person_template_training_and_existing_packet_are_rejected(self):
        for change in ("person-org", "person-group", "template", "training-person", "training-type", "packet"):
            with self.subTest(change=change):
                seed, fixture, ledger = cohort()
                foreign = str(uuid.uuid4())
                if change == "person-org":
                    seed["person"]["organization_id"] = foreign
                elif change == "person-group":
                    seed["person"]["group_id"] = foreign
                elif change == "template":
                    seed["templateId"] = foreign
                elif change == "training-person":
                    seed["training"][0]["personnel_id"] = foreign
                elif change == "training-type":
                    seed["training"][0]["training_type_id"] = foreign
                else:
                    seed["packets"] = [{"id": foreign}]
                with self.assertRaises(probe.Blocked):
                    probe.validate_seed(seed, fixture, ledger)


class CleanupGuards(unittest.TestCase):
    def instance(self, states):
        instance = probe.Probe.__new__(probe.Probe)
        instance.marker = "owned-marker"
        instance.objects = [("owned_save", "onboarding_step_progress"), ("owned_delete", "personnel_onboardings")]
        instance.object_state = Mock(side_effect=states)
        instance.sql = Mock(return_value={"removed": True})
        return instance

    def entries(self):
        return [{"name": name, "function_exists": True, "function_marker": "owned-marker", "function_oid": "4",
                 "trigger": {"marker": "owned-marker", "function_oid": "4"}} for name in ("owned_save", "owned_delete")]

    def test_either_foreign_function_or_trigger_prevents_any_drop(self):
        for index in (0, 1):
            for change in ("function", "trigger", "replacement"):
                with self.subTest(index=index, change=change):
                    entries = self.entries()
                    if change == "function":
                        entries[index]["function_marker"] = "foreign"
                    elif change == "trigger":
                        entries[index]["trigger"]["marker"] = "foreign"
                    else:
                        entries[index]["trigger"]["function_oid"] = "5"
                    instance = self.instance([entries])
                    with self.assertRaises(probe.Blocked):
                        instance.remove_faults()
                    instance.sql.assert_not_called()

    def test_cleanup_requires_both_catalog_objects_to_be_absent(self):
        absent = [{"function_exists": False, "trigger": None} for _ in range(2)]
        instance = self.instance([self.entries(), absent])
        self.assertEqual(instance.remove_faults(), absent)
        remaining = copy.deepcopy(absent)
        remaining[1] = self.entries()[1]
        instance = self.instance([self.entries(), remaining])
        with self.assertRaises(probe.Blocked):
            instance.remove_faults()


if __name__ == "__main__":
    unittest.main()
