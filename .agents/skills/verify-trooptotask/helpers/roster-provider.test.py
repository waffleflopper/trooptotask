import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('roster_provider', Path(__file__).with_name('roster-provider.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TargetTests(unittest.TestCase):
    def test_owned_prefix_and_rejected_targets(self):
        fixture = {'ids': {'orgA': '00000000-0000-4000-8000-000000000001'}}
        roster = '00000000-0000-4000-8000-000000000002'
        self.assertEqual(module.target(fixture, 'orgA', roster), (
            '00000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000001/sign-in-rosters/00000000-0000-4000-8000-000000000002/'))
        for org, value in [('production', roster), ('orgA', "x';delete from public.sign_in_rosters;--"),
                           ('orgA', '../foreign')]:
            with self.assertRaises((RuntimeError, ValueError)):
                module.target(fixture, org, value)


class RecordedKeyTests(unittest.TestCase):
    fixture = {'ids': {'orgA': '00000000-0000-4000-8000-000000000001', 'orgB': '00000000-0000-4000-8000-000000000002'}}
    roster = '00000000-0000-4000-8000-000000000003'

    def test_manifest_keys_are_bound_to_the_fixture_and_bucket(self):
        manifest = {'files': [
            {'case': 'ownerRelease', 'bucket': 'counseling-files',
             'path': f'00000000-0000-4000-8000-000000000001/sign-in-rosters/{self.roster}/a-ownerRelease.pdf'},
            {'case': 'crossPersonDocument', 'bucket': 'personnel-documents',
             'path': f'00000000-0000-4000-8000-000000000001/personnel/{self.roster}/documents/b.pdf'},
            {'case': 'foreignUnreleased', 'bucket': 'counseling-files',
             'path': f'00000000-0000-4000-8000-000000000002/counseling-records/{self.roster}/c.pdf'}]}
        keys = module.recorded_keys(self.fixture, manifest)
        self.assertEqual([case for case, _, _ in keys], ['ownerRelease', 'crossPersonDocument', 'foreignUnreleased'])
        sql = module.keys_sql(keys)
        self.assertIn(f"('crossPersonDocument','personnel-documents','{manifest['files'][1]['path']}')", sql)
        self.assertIn("organization_private.file_retirements r WHERE r.key_digest = d.digest", sql)

    def test_foreign_injected_or_misfiled_keys_are_refused(self):
        prefix = '00000000-0000-4000-8000-000000000001'
        rejected = [
            {'case': 'x', 'bucket': 'counseling-files', 'path': f'00000000-0000-4000-8000-000000000009/sign-in-rosters/{self.roster}/a.pdf'},
            {'case': 'x', 'bucket': 'counseling-files', 'path': f"{prefix}/sign-in-rosters/{self.roster}/a');delete from storage.objects;--"},
            {'case': "x'),('y", 'bucket': 'counseling-files', 'path': f'{prefix}/sign-in-rosters/{self.roster}/a.pdf'},
            {'case': 'x', 'bucket': 'personnel-documents', 'path': f'{prefix}/sign-in-rosters/{self.roster}/a.pdf'},
            {'case': 'x', 'bucket': 'counseling-files', 'path': f'{prefix}/../{self.roster}/a.pdf'}]
        for file in rejected:
            with self.assertRaises((RuntimeError, ValueError)):
                module.recorded_keys(self.fixture, {'files': [file]})
        many = [{'case': 'x', 'bucket': 'counseling-files', 'path': f'{prefix}/sign-in-rosters/{self.roster}/{n}.pdf'} for n in range(33)]
        for manifest in [None, {}, {'files': many}]:
            with self.assertRaises((RuntimeError, ValueError)):
                module.recorded_keys(self.fixture, manifest)

if __name__ == '__main__':
    unittest.main()
