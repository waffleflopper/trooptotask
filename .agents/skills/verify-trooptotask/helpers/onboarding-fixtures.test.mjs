import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { seedOnboarding } from './onboarding-fixtures.mjs';

const fixture = {
	ids: new Proxy({}, { get: (_target, key) => String(key) }),
	actors: new Proxy({}, { get: (_target, key) => ({ id: String(key) }) }),
	dates: { ui: '2026-10-13', trainingCompleted: '2026-10-06', trainingExpires: '2027-10-06' }
};

async function seed(kind) {
	const written = new Map();
	const client = {
		from: (table) => ({
			insert: async (rows) => {
				written.set(table, [...(written.get(table) ?? []), ...rows]);
				return { error: null };
			}
		})
	};
	await seedOnboarding({ client, fixture, kind, tag: 'tag', ownedState: { seeded: [] }, save: async () => {} });
	return written;
}

test('Active-page seeds count start dates from the local date even after the UTC date has rolled over', async () => {
	mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-14T00:17:46Z') });
	try {
		const status = (await seed('onboarding-status')).get('personnel_onboardings');
		const started = Object.fromEntries(
			status
				.filter((packet) => packet.status === 'in_progress')
				.map((packet) => [packet.personnel_id, packet.started_at])
		);
		assert.equal(Math.max(...Object.values(started).map((date) => Date.parse(date))), Date.parse('2026-10-13'));
		assert.ok(Object.values(started).includes('2026-10-13'), 'the New packet started today, not tomorrow');
		assert.ok(Object.values(started).includes('2026-09-23'), 'the Stalled packet started 20 days ago');

		const matrix = (await seed('onboarding-matrix')).get('personnel_onboardings');
		assert.deepEqual(matrix.map((packet) => packet.started_at).sort(), [
			'2026-09-23',
			'2026-10-03',
			'2026-10-07',
			'2026-10-10',
			'2026-10-11',
			'2026-10-13'
		]);

		const longText = (await seed('onboarding-long-text')).get('personnel_onboardings');
		assert.equal(longText[0].started_at, '2026-10-10');
	} finally {
		mock.timers.reset();
	}
});

test('History seeds keep UTC finish dates because History counts in UTC', async () => {
	mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-14T00:17:46Z') });
	try {
		const packets = (await seed('onboarding-history-view')).get('personnel_onboardings');
		const fast = packets.find((packet) => packet.status === 'completed' && packet.started_at === '2026-09-04');
		assert.equal(fast.completed_at, '2026-09-13');
	} finally {
		mock.timers.reset();
	}
});
