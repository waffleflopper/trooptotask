import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Run only inside database.py's new seed-disabled disposable project. Setup and
// observations use its private provider; all Start calls use ordinary GoTrue users.
const url = process.env.T2T_PROBE_API_URL;
const serviceKey = process.env.T2T_PROBE_SERVICE_KEY;
const anonKey = process.env.T2T_PROBE_ANON_KEY;
assert.ok(url && serviceKey && anonKey, 'Disposable provider coordinates are required');
assert.equal(new URL(url).hostname, '127.0.0.1');
assert.match(process.env.DOCKER_HOST ?? '', /^unix:\/\//, 'Only the guarded local Docker socket is allowed');
assert.equal(process.env.DOCKER_CONTEXT, undefined);
const config = readFileSync('supabase/config.toml', 'utf8');
const project = /^project_id = "(t2t-ci-db-[a-zA-Z0-9_-]+)"$/m.exec(config)?.[1];
assert.ok(project, 'The copied disposable project identity is required');
assert.match(config, /\[db\.seed\]\s+enabled = false\s+sql_paths = \[\]/);
const container = `supabase_db_${project}`;
assert.equal(
	execFileSync('docker', ['inspect', '--format', '{{.Name}}', container], { encoding: 'utf8' }).trim(),
	`/${container}`
);
const psqlArgs = [
	'exec',
	'-i',
	'-e',
	'PGPASSWORD=postgres',
	container,
	'psql',
	'-X',
	'-qAt',
	'-U',
	'postgres',
	'-d',
	'postgres',
	'-v',
	'ON_ERROR_STOP=1'
];
const sql = (text) => execFileSync('docker', [...psqlArgs, '-c', text], { encoding: 'utf8', timeout: 15000 }).trim();
const jsonSql = (text) => JSON.parse(sql(text));
const id = (n) => `d1509000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const password = `StartProbe9!${randomUUID()}`;
const actors = [];
const holders = new Set();
const pendingCalls = new Set();
const observations = [];
const requests = [];
const laneMap = (level) => ({
	onboarding: level,
	personnel: 'none',
	training: 'none',
	calendar: 'none',
	criticalTasks: 'none',
	ratingScheme: 'none'
});
const resultData = (result) => {
	if (result.error) throw new Error(`Synthetic setup/read failed (${result.error.code}): ${result.error.message}`);
	return result.data;
};
const insert = async (table, rows) => resultData(await service.from(table).insert(rows));
const steps = [
	{
		template_step_id: id(501),
		step_name: 'Prepared Orientation',
		step_type: 'checkbox',
		training_type_id: null,
		stages: null,
		sort_order: 10,
		completed: true
	},
	{
		template_step_id: id(502),
		step_name: 'Prepared Paperwork',
		step_type: 'paperwork',
		training_type_id: null,
		stages: ['Submitted', 'Reviewed', 'Filed'],
		sort_order: 20,
		completed: true
	},
	{
		template_step_id: id(503),
		step_name: 'Prepared expired Training',
		step_type: 'training',
		training_type_id: id(601),
		stages: null,
		sort_order: 30,
		completed: true
	}
];
const start = async (actor, person, prepared = steps, template = id(401)) => {
	const request = {
		actor_id: actor.userId,
		organization_id: id(101),
		personnel_id: id(person),
		template_id: template,
		started_at: '2026-02-03',
		steps: prepared
	};
	requests.push(request);
	const pending = Promise.resolve(
		actor.client.rpc('start_onboarding_packet', {
			p_organization_id: id(101),
			p_personnel_id: id(person),
			p_template_id: template,
			p_started_at: '2026-02-03',
			p_steps: prepared
		})
	);
	pendingCalls.add(pending);
	try {
		return await pending;
	} finally {
		pendingCalls.delete(pending);
	}
};
const state = async () => ({
	parents: resultData(
		await service
			.from('personnel_onboardings')
			.select('*')
			.in('organization_id', [id(101), id(102)])
			.order('id')
	),
	progress: resultData(
		await service
			.from('onboarding_step_progress')
			.select('*')
			.in('organization_id', [id(101), id(102)])
			.order('id')
	),
	training: resultData(
		await service
			.from('personnel_trainings')
			.select('*')
			.in('organization_id', [id(101), id(102)])
			.order('id')
	)
});
const personState = (value, person) => {
	const parents = value.parents.filter((row) => row.personnel_id === id(person));
	return {
		parents,
		progress: value.progress.filter((row) => parents.some((parent) => parent.id === row.onboarding_id))
	};
};
function savedResponse(result, value, person, templateSteps = steps) {
	assert.equal(result.error, null);
	assert.equal(result.status, 200);
	const saved = personState(value, person);
	assert.equal(saved.parents.length, 1);
	assert.equal(saved.progress.length, templateSteps.length);
	assert.deepEqual(result.data.onboarding, saved.parents[0]);
	assert.deepEqual(
		result.data.steps,
		saved.progress.toSorted((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
	);
	assert.equal(saved.parents[0].started_at, '2026-02-03');
	assert.equal(saved.parents[0].status, 'in_progress');
	assert.equal(saved.parents[0].completed_at, null);
	assert.equal(saved.parents[0].cancelled_at, null);
	for (const row of saved.progress) {
		assert.equal(row.organization_id, id(101));
		assert.equal(row.active, true);
		assert.deepEqual(row.notes, []);
	}
	if (templateSteps.length)
		assert.deepEqual(
			saved.progress
				.toSorted((a, b) => a.sort_order - b.sort_order)
				.map(({ step_name, completed, current_stage }) => [step_name, completed, current_stage]),
			[
				['Current Prepared Orientation', false, null],
				['Current Prepared Paperwork', false, 'Submitted'],
				['Current Prepared expired Training', person === 301, null]
			]
		);
}
function failure(result, code, text) {
	assert.equal(result.data, null);
	assert.equal(result.error?.code, code);
	if (text) assert.match(result.error.message, text);
}
async function hold(table, rowId) {
	assert.ok(['personnel', 'training_types'].includes(table));
	const child = spawn('docker', psqlArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
	let output = '';
	let errors = '';
	child.stdout.setEncoding('utf8').on('data', (chunk) => {
		output += chunk;
	});
	child.stderr.setEncoding('utf8').on('data', (chunk) => {
		errors += chunk;
	});
	const finished = new Promise((resolve, reject) => {
		child.once('error', reject);
		child.once('close', (code) => {
			holders.delete(owned);
			code === 0 ? resolve() : reject(new Error(`Owned holder failed (${code}): ${errors}`));
		});
	});
	const owned = { child, finished };
	holders.add(owned);
	child.stdin.write(
		`BEGIN; SET LOCAL statement_timeout='15s'; SELECT id FROM public.${table} WHERE id='${rowId}' FOR UPDATE; SELECT 'holder_pid='||pg_backend_pid();\n`
	);
	const deadline = Date.now() + 5000;
	while (!output.includes('holder_pid=')) {
		if (Date.now() > deadline) throw new Error('Owned holder did not reach its row lock');
		await Promise.race([
			new Promise((resolve) => setTimeout(resolve, 20)),
			finished.then(() => {
				throw new Error('Owned holder ended before lock');
			})
		]);
	}
	const pid = Number(/holder_pid=(\d+)/.exec(output)[1]);
	return {
		pid,
		async release(extra = '') {
			child.stdin.end(`${extra}\nCOMMIT;\n\\q\n`);
			await finished;
		}
	};
}
async function observedWait(holder, count = 1) {
	const deadline = Date.now() + 5000;
	while (Date.now() < deadline) {
		const witnesses = jsonSql(`WITH RECURSIVE chain(root,pid,path) AS (
      SELECT a.pid,a.pid,ARRAY[a.pid] FROM pg_stat_activity a WHERE a.pid<>pg_backend_pid()
        AND a.wait_event_type='Lock' AND a.query LIKE '%start_onboarding_packet%'
      UNION ALL SELECT c.root,b.pid,c.path||b.pid FROM chain c,LATERAL unnest(pg_blocking_pids(c.pid)) b(pid) WHERE NOT b.pid=ANY(c.path)
    ) SELECT coalesce(jsonb_agg(jsonb_build_object('waiter',root,'blocking_path',path)),'[]') FROM chain WHERE pid=${holder.pid}`);
		if (new Set(witnesses.map((row) => row.waiter)).size >= count) return witnesses;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(`Expected ${count} ordinary RPC waits on owned holder ${holder.pid}`);
}
const record = (label, before, results, after, waits = []) =>
	observations.push({
		label,
		before,
		results: results.map(({ data, error, status }) => ({ data, error, status })),
		after,
		waits
	});
let original;
try {
	for (const [label, level, groups] of [
		['operate', 'operate', null],
		['configure', 'configure', null],
		['scoped', 'operate', [id(201)]],
		['revokable', 'operate', null],
		['view', 'view', null]
	]) {
		const email = `atomic-start-${label}-${randomUUID()}@example.test`;
		const user = resultData(await service.auth.admin.createUser({ email, password, email_confirm: true })).user;
		const actor = {
			userId: user.id,
			level,
			groups,
			client: createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
		};
		actors.push(actor); // Record before later setup can fail, for exact cleanup.
		resultData(await actor.client.auth.signInWithPassword({ email, password }));
	}
	await insert('organizations', [
		{ id: id(101), name: 'Start Probe Alpha', created_by: actors[0].userId },
		{ id: id(102), name: 'Start Probe Foreign', created_by: actors[0].userId }
	]);
	await insert('groups', [
		{ id: id(201), organization_id: id(101), name: 'Alpha' },
		{ id: id(202), organization_id: id(101), name: 'Bravo' }
	]);
	await insert(
		'organization_memberships',
		actors.map((actor) => ({
			organization_id: id(101),
			user_id: actor.userId,
			role: 'member',
			member_preset: 'viewer',
			capability_overrides: laneMap(actor.level),
			access_scope_kind: actor.groups === null ? 'organization' : 'groups',
			access_scope_group_ids: actor.groups ?? []
		}))
	);
	await insert(
		'personnel',
		Array.from({ length: 11 }, (_, n) => ({
			id: id(301 + n),
			organization_id: id(101),
			group_id: id(201),
			rank: 'SPC',
			first_name: 'Start',
			last_name: `Probe${n}`,
			slug: `start-probe-${n}`
		}))
	);
	await insert('onboarding_templates', [
		{ id: id(401), organization_id: id(101), name: 'Prepared template' },
		{ id: id(402), organization_id: id(102), name: 'Foreign template' },
		{ id: id(403), organization_id: id(101), name: 'Empty template' }
	]);
	await insert('training_types', [{ id: id(601), organization_id: id(101), name: 'Expired Training' }]);
	await insert('personnel_trainings', [
		{
			id: id(901),
			organization_id: id(101),
			personnel_id: id(301),
			training_type_id: id(601),
			completion_date: '2020-01-01',
			expiration_date: '2020-02-01'
		}
	]);
	await insert(
		'onboarding_template_steps',
		steps.map((row) => ({
			id: row.template_step_id,
			organization_id: id(101),
			template_id: id(401),
			name: `Current ${row.step_name}`,
			step_type: row.step_type,
			training_type_id: row.training_type_id,
			stages: row.stages,
			sort_order: row.sort_order
		}))
	);
	await insert('personnel_onboardings', [
		{
			id: id(701),
			organization_id: id(101),
			personnel_id: id(311),
			template_id: null,
			started_at: '2026-01-01',
			status: 'completed',
			completed_at: '2026-01-03',
			cancelled_at: null
		}
	]);
	await insert('onboarding_step_progress', [
		{
			id: id(801),
			organization_id: id(101),
			onboarding_id: id(701),
			template_step_id: null,
			step_name: 'Deleted definition history',
			step_type: 'paperwork',
			training_type_id: null,
			stages: ['Draft', 'Archived review'],
			sort_order: 20,
			completed: true,
			current_stage: 'Archived review',
			notes: [
				{
					text: 'Original retained note',
					timestamp: '2026-01-02T01:00:00.123Z',
					userId: actors[0].userId,
					extra: [true, null]
				}
			],
			active: false
		}
	]);
	original = await state();
	const assertOriginal = (value) => {
		assert.deepEqual(
			value.parents.filter((row) => row.id === id(701)),
			original.parents
		);
		assert.deepEqual(
			value.progress.filter((row) => row.id === id(801)),
			original.progress
		);
		assert.deepEqual(value.training, original.training);
	};
	for (const [label, actor, prepared, template, code] of [
		['view-denied', actors[4], steps, id(401), '42501'],
		['foreign-template', actors[0], steps, id(402), 'P0002']
	]) {
		const before = await state();
		const result = await start(actor, 301, prepared, template);
		failure(result, code);
		const after = await state();
		assert.deepEqual(after, before);
		record(label, before, [result], after);
	}

	// Parent FK holder forces both real requests into an observed blocking chain.
	let before = await state();
	let holder = await hold('personnel', id(301));
	const first = start(actors[0], 301);
	const firstWait = await observedWait(holder);
	const second = start(actors[1], 301);
	const bothWait = await observedWait(holder, 2);
	assert.deepEqual(await state(), before);
	await holder.release();
	const results = await Promise.all([first, second]);
	let after = await state();
	savedResponse(results[0], after, 301);
	failure(results[1], '23505', /"personnel_onboardings_active_idx"/);
	assert.equal(results[1].status, 409);
	assertOriginal(after);
	record('same-Person-winner-complete-loser-conflict', before, results, after, [...firstWait, ...bothWait]);

	// First contender fails after parent/prior child; the awaiting second can win.
	sql(`CREATE FUNCTION public.atomic_start_probe_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
    IF auth.uid()='${actors[0].userId}' AND NEW.step_name='Current Prepared Paperwork' AND EXISTS(SELECT 1 FROM public.personnel_onboardings WHERE id=NEW.onboarding_id AND personnel_id='${id(302)}') THEN
      IF NOT EXISTS(SELECT 1 FROM public.onboarding_step_progress WHERE onboarding_id=NEW.onboarding_id AND step_name='Current Prepared Orientation') THEN RAISE EXCEPTION 'Missing partial fault witness' USING ERRCODE='XX000'; END IF;
      RAISE EXCEPTION 'Controlled provider Start failure witnessed parent and prior child' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER atomic_start_probe_fault BEFORE INSERT ON public.onboarding_step_progress FOR EACH ROW EXECUTE FUNCTION public.atomic_start_probe_fault();`);
	before = await state();
	holder = await hold('personnel', id(302));
	const failedFirst = start(actors[0], 302);
	await observedWait(holder);
	const succeedsSecond = start(actors[1], 302);
	const failedWait = await observedWait(holder, 2);
	assert.deepEqual(await state(), before);
	await holder.release();
	const failResults = await Promise.all([failedFirst, succeedsSecond]);
	after = await state();
	failure(failResults[0], '23514', /witnessed parent and prior child/);
	savedResponse(failResults[1], after, 302);
	assertOriginal(after);
	record('failed-first-contender-permits-second', before, failResults, after, failedWait);
	sql(
		'DROP TRIGGER atomic_start_probe_fault ON public.onboarding_step_progress; DROP FUNCTION public.atomic_start_probe_fault();'
	);

	before = await state();
	holder = await hold('personnel', id(303));
	const heldStart = start(actors[0], 303);
	const independentWait = await observedWait(holder);
	const independent = await start(actors[1], 304);
	after = await state();
	savedResponse(independent, after, 304);
	assert.deepEqual(personState(after, 303), personState(before, 303));
	await holder.release();
	const resumed = await heldStart;
	after = await state();
	savedResponse(resumed, after, 303);
	assertOriginal(after);
	record('different-Person-independent-before-release', before, [independent, resumed], after, independentWait);

	// Both actual FK boundaries must honor newly committed capability/scope loss.
	for (const [label, table, person, actor, change] of [
		['parent-FK-capability-loss', 'personnel', 305, actors[3], 'capability'],
		['parent-FK-Person-scope-loss', 'personnel', 306, actors[2], 'scope'],
		['child-FK-capability-loss', 'training_types', 307, actors[3], 'capability'],
		['child-FK-Person-scope-loss', 'training_types', 308, actors[2], 'scope']
	]) {
		before = await state();
		holder = await hold(table, table === 'personnel' ? id(person) : id(601));
		const pending = start(actor, person);
		const waits = await observedWait(holder);
		assert.deepEqual(await state(), before);
		if (change === 'capability')
			resultData(
				await service
					.from('organization_memberships')
					.update({ capability_overrides: laneMap('view') })
					.eq('organization_id', id(101))
					.eq('user_id', actor.userId)
			);
		if (change === 'scope' && table !== 'personnel')
			resultData(
				await service
					.from('personnel')
					.update({ group_id: id(202) })
					.eq('id', id(person))
					.eq('organization_id', id(101))
			);
		await holder.release(
			change === 'scope' && table === 'personnel'
				? `UPDATE public.personnel SET group_id='${id(202)}' WHERE id='${id(person)}';`
				: ''
		);
		const result = await pending;
		failure(result, '42501');
		after = await state();
		assert.deepEqual(after, before);
		assertOriginal(after);
		record(label, before, [result], after, waits);
		if (change === 'capability')
			resultData(
				await service
					.from('organization_memberships')
					.update({ capability_overrides: laneMap(actor.level) })
					.eq('organization_id', id(101))
					.eq('user_id', actor.userId)
			);
		else
			resultData(
				await service
					.from('personnel')
					.update({ group_id: id(201) })
					.eq('id', id(person))
					.eq('organization_id', id(101))
			);
	}

	// PostgREST must report a deferred commit failure, with no saved parent/child.
	sql(`CREATE FUNCTION public.atomic_start_probe_deferred() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
    IF EXISTS(SELECT 1 FROM public.personnel_onboardings WHERE id=NEW.onboarding_id AND personnel_id='${id(309)}') THEN
      IF (SELECT count(*) FROM public.onboarding_step_progress WHERE onboarding_id=NEW.onboarding_id)<>3 THEN RAISE EXCEPTION 'Missing full packet witness' USING ERRCODE='XX000'; END IF;
      RAISE EXCEPTION 'Controlled deferred provider Start failure witnessed full packet' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
    CREATE CONSTRAINT TRIGGER atomic_start_probe_deferred AFTER INSERT ON public.onboarding_step_progress DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.atomic_start_probe_deferred();`);
	before = await state();
	const deferred = await start(actors[0], 309);
	failure(deferred, '23514', /witnessed full packet/);
	after = await state();
	assert.deepEqual(after, before);
	record('deferred-commit-failure-no-rows', before, [deferred], after);
	sql(
		'DROP TRIGGER atomic_start_probe_deferred ON public.onboarding_step_progress; DROP FUNCTION public.atomic_start_probe_deferred();'
	);
	const retry = await start(actors[0], 309);
	after = await state();
	savedResponse(retry, after, 309);
	assertOriginal(after);
	record('deferred-failure-restored-retry', before, [retry], after);
	before = await state();
	const empty = await start(actors[0], 310, [], id(403));
	after = await state();
	savedResponse(empty, after, 310, []);
	assertOriginal(after);
	record('existing-empty-template', before, [empty], after);
	console.log(
		JSON.stringify({
			project,
			container,
			original,
			requests,
			observations,
			limits: [
				'Ordinary GoTrue/PostgREST RPC boundary; application status mapping and native UI remain separate.',
				'Training flags are supplied preflight facts; this RPC does not query or verify Training presence.',
				'No catalog serialization or response-loss idempotency claim.'
			]
		})
	);
	console.log(`Atomic Start ordinary provider scenarios passed in ${project}.`);
} finally {
	const remainingHolders = [...holders];
	for (const { child } of remainingHolders) child.stdin.end('ROLLBACK;\n\\q\n');
	await Promise.all(remainingHolders.map(({ finished }) => finished));
	await Promise.allSettled([...pendingCalls]);
	sql(
		'DROP TRIGGER IF EXISTS atomic_start_probe_fault ON public.onboarding_step_progress; DROP FUNCTION IF EXISTS public.atomic_start_probe_fault(); DROP TRIGGER IF EXISTS atomic_start_probe_deferred ON public.onboarding_step_progress; DROP FUNCTION IF EXISTS public.atomic_start_probe_deferred();'
	);
	resultData(
		await service
			.from('organizations')
			.delete()
			.in('id', [id(101), id(102)])
	);
	for (const actor of actors) resultData(await service.auth.admin.deleteUser(actor.userId));
	assert.deepEqual(await state(), { parents: [], progress: [], training: [] });
	assert.deepEqual(
		resultData(
			await service
				.from('personnel')
				.select('id')
				.in('organization_id', [id(101), id(102)])
		),
		[]
	);
	assert.deepEqual(
		resultData(
			await service
				.from('organization_memberships')
				.select('user_id')
				.in('organization_id', [id(101), id(102)])
		),
		[]
	);
	console.log(`Exact atomic Start synthetic cleanup passed in ${project}.`);
}
