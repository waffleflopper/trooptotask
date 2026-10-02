import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { seedArtifactRetention } from './artifact-retention.mjs';

const fixture = {
	ids: {
		orgA: '10000000-0000-4000-8000-000000000001',
		orgB: '10000000-0000-4000-8000-000000000002',
		groupA: '20000000-0000-4000-8000-000000000001',
		groupForeign: '20000000-0000-4000-8000-000000000002'
	},
	actors: {
		manager: { id: '30000000-0000-4000-8000-000000000001' },
		personnelForeign: { id: '30000000-0000-4000-8000-000000000002' }
	}
};

for (const failure of ['insert', 'upload']) {
	test(`a failed ${failure} leaves the complete cleanup manifest persisted before any row or object effect`, async () => {
		const ownedState = { seeded: [] };
		let persisted;
		let firstManifest;
		const attemptedRows = [];
		const attemptedFiles = [];
		const insertedRows = [];
		const uploadedFiles = [];
		let followUpBatches = 0;
		const beforeEffect = () => {
			assert.ok(persisted, 'Cleanup ownership must be persisted before the first provider operation.');
			firstManifest ??= structuredClone(persisted);
			assert.deepEqual(persisted, firstManifest, 'The complete manifest must precede all setup effects.');
			for (const table of [
				'personnel',
				'personnel_follow_ups',
				'counseling_records',
				'personnel_documents',
				'leader_notes'
			]) {
				for (const organization of ['orgA', 'orgB'])
					assert.ok(persisted.seeded.some((item) => item.table === table && item.organization === organization));
			}
		};
		const registrations = new Set();
		const client = {
			async rpc(name, args) {
				beforeEffect();
				const owned = persisted.seeded
					.flatMap((item) => item.files ?? [])
					.find((file) => file.uploadId === args.p_upload_id);
				assert.ok(owned, 'Registration must already have persisted ownership.');
				assert.equal(owned.path, args.p_object_name);
				assert.equal(owned.bucket, args.p_bucket_id);
				if (name === 'register_organization_file_upload') {
					registrations.add(args.p_upload_id);
					return { data: args.p_upload_id, error: null };
				}
				assert.equal(name, 'settle_organization_file_upload');
				assert.ok(
					uploadedFiles.some((file) => file.uploadId === args.p_upload_id),
					'Never settle a failed or unknown upload.'
				);
				return { data: registrations.delete(args.p_upload_id), error: null };
			},
			from(table) {
				return {
					async insert(rows) {
						beforeEffect();
						for (const row of rows) {
							const owner = persisted.seeded.find(
								(item) => item.table === table && fixture.ids[item.organization] === row.organization_id
							);
							assert.ok(owner.ids.includes(row.id), 'Every attempted row must already have scoped cleanup ownership.');
							attemptedRows.push({ table, row });
						}
						if (table === 'personnel_follow_ups') followUpBatches++;
						if (failure === 'insert' && followUpBatches === 2)
							return { error: { message: 'deliberate insert failure' } };
						insertedRows.push(...rows.map((row) => ({ table, row })));
						return { data: null, error: null };
					}
				};
			},
			storage: {
				from(bucket) {
					return {
						async upload(path, bytes) {
							beforeEffect();
							const owners = persisted.seeded.filter((item) =>
								(item.files ?? []).some((file) => file.bucket === bucket && file.path === path)
							);
							assert.equal(owners.length, 1, 'Every attempted object must have one persisted cleanup owner.');
							assert.equal(owners[0].table, 'personnel');
							assert.equal(owners[0].organization, 'orgA');
							const file = owners[0].files.find((file) => file.bucket === bucket && file.path === path);
							assert.equal(file.size, bytes.length);
							assert.equal(file.sha256, createHash('sha256').update(bytes).digest('hex'));
							attemptedFiles.push(file);
							if (failure === 'upload' && attemptedFiles.length === 2)
								return { error: { message: 'deliberate upload failure' } };
							uploadedFiles.push(file);
							return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
						}
					};
				}
			}
		};
		await assert.rejects(
			seedArtifactRetention({
				client,
				fixture,
				kind: 'artifact-retention-1001',
				tag: 'recovery',
				ownedState,
				save: async (state) => {
					persisted = structuredClone(state);
				}
			}),
			new RegExp('deliberate ' + failure + ' failure')
		);
		assert.deepEqual(ownedState, persisted);
		assert.equal(
			registrations.size,
			failure === 'upload' ? 1 : 0,
			'Unknown file results retain their recorded registration.'
		);
		assert.ok(insertedRows.length > 0, 'The test must leave genuine partial row effects.');
		const files = persisted.seeded.flatMap((item) => item.files ?? []);
		assert.ok(files.some((file) => file.organizationId === fixture.ids.orgB));
		assert.ok(files.some((file) => file.classification === 'unrelated' && file.rowId === null));
		if (failure === 'insert') {
			assert.ok(attemptedRows.length > insertedRows.length, 'The rejected batch must also remain recoverable.');
			assert.equal(attemptedFiles.length, 0);
		} else {
			assert.ok(uploadedFiles.length > 0, 'The test must leave genuine partial object effects.');
			assert.ok(attemptedFiles.length > uploadedFiles.length, 'The rejected upload must also remain recoverable.');
			const persistedRows = persisted.seeded.flatMap((item) =>
				item.ids.map((id) => `${item.table}/${fixture.ids[item.organization]}/${id}`)
			);
			assert.deepEqual(
				new Set(attemptedRows.map(({ table, row }) => `${table}/${row.organization_id}/${row.id}`)),
				new Set(persistedRows)
			);
			const attemptedPaths = new Set(attemptedFiles.map((file) => `${file.bucket}/${file.path}`));
			assert.ok(
				files.some((file) => !attemptedPaths.has(`${file.bucket}/${file.path}`)),
				'Not-yet-attempted objects must also be recorded.'
			);
		}
	});
}
