"""Offline fault ownership/cleanup guards; no database or byte-removal proof."""

import copy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location(
    "destruction_provider", Path(__file__).with_name("organization-destruction-provider.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def owned_fault():
    return {"function_oid": 42, "function_comment": "owned-marker",
            "trigger": {"function_oid": 42, "relation": "storage.objects", "comment": "owned-marker"}}


class FaultCleanup(unittest.TestCase):
    def test_foreign_or_missing_binding_never_reaches_drop(self):
        variants = []
        for field, value in (("function_oid", 99), ("relation", "public.organizations"),
                             ("comment", "foreign-marker")):
            current = owned_fault()
            current["trigger"][field] = value
            variants.append(current)
        for field, value in (("function_oid", None), ("function_comment", "foreign-marker"), ("trigger", None)):
            current = owned_fault()
            current[field] = value
            variants.append(current)
        for current in variants:
            with self.subTest(current=current):
                sql = Mock(return_value=json.dumps(current))
                with self.assertRaises(RuntimeError):
                    probe.remove_owned_fault(sql, "owned_fault", "owned-marker")
                self.assertFalse(any("DROP " in call.args[0] for call in sql.call_args_list))

    def test_owned_pair_requires_final_function_and_trigger_absence(self):
        absent = {"function_oid": None, "function_comment": None, "trigger": None}
        for after in (absent, owned_fault(), {**absent, "trigger": copy.deepcopy(owned_fault()["trigger"])},
                      {**absent, "function_oid": 42}, {}, {"function_oid": None}):
            with self.subTest(after=after):
                sql = Mock(side_effect=[json.dumps(owned_fault()), "", json.dumps(after)])
                if after == absent:
                    self.assertEqual(probe.remove_owned_fault(sql, "owned_fault", "owned-marker"), absent)
                else:
                    with self.assertRaises(RuntimeError):
                        probe.remove_owned_fault(sql, "owned_fault", "owned-marker")
                mutation = [call.args[0] for call in sql.call_args_list if "DROP " in call.args[0]]
                self.assertTrue(mutation)


if __name__ == "__main__":
    unittest.main()
