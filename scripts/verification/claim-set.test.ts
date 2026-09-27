import { beforeAll, expect, it } from 'vitest';
import { mkdtemp, mkdir, copyFile, symlink, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Real issuer and verifier in an isolated checkout: these synthetic protocol receipts
// cannot be accepted as application proof by the contributor's checkout.
let results: Record<string, { status: string; requirements?: { code?: string }[]; rejected?: { code: string }[] }>;
beforeAll(async () => {
	const directory = await mkdtemp(path.join(tmpdir(), 't2t-claim-set-'));
	try {
		await mkdir(path.join(directory, 'scripts/verification'), { recursive: true });
		for (const name of ['core', 'fixtures', 'claims', 'claim-set', 'cli'])
			await copyFile(`scripts/verification/${name}.mjs`, path.join(directory, `scripts/verification/${name}.mjs`));
		await symlink(path.resolve('node_modules'), path.join(directory, 'node_modules'), 'dir');
		await writeFile(path.join(directory, '.gitignore'), 'node_modules\n.verification\n');
		execFileSync('git', ['init', '-q', directory]);
		results = JSON.parse(
			execFileSync(
				process.execPath,
				[
					'--input-type=module',
					'-e',
					`
import { candidate, receipt, sessions, root } from './scripts/verification/core.mjs';
import { checkClaims } from './scripts/verification/claim-set.mjs';
import * as fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const requirement = claim => ({ claim, behavior: 'Independently specified behavior', acceptance: 'Issue acceptance', contract: 'Approved contract', coverage: ['Reusable check'] });
const file = root + '/plan.json';
const results = {};
try {
 const current = await candidate();
 const state = {candidate:current, artifact:current, revision:'test', id:'protocol-fixture', browser:{version:'no browser: gate test'}, origin:'http://127.0.0.1:1'};
 const issue = 'Gate protocol test, not product evidence';
 const issueReceipt = async (claim, status = 'PASS') => (await receipt(state, {claim, status, observations:[{fixture:'gate protocol only'}]})).receipt;
 const personnel = await issueReceipt('personnel-organization-scope');
 const group = await issueReceipt('group-persistence');
 async function check(name, claims, files) {
  await fs.writeFile(file, JSON.stringify({schema:1, issue, requirements:claims.map(requirement)}));
  results[name] = await checkClaims(file, files);
 }
 await check('complete', ['personnel-organization-scope', 'group-persistence'], [group, personnel]);
 await check('partial', ['personnel-organization-scope', 'group-persistence'], [group]);
 await check('missing', ['personnel-organization-scope'], []);
 await check('calendar', ['calendar-availability-persistence'], [group]);
 await check('unimplemented', ['unimplemented-contract'], [await issueReceipt('unimplemented-contract')]);
 await check('unrelated', ['personnel-organization-scope'], [group]);
 await check('extra', ['personnel-organization-scope'], [personnel, group]);
 await check('duplicate', ['personnel-organization-scope'], [personnel, personnel]);
 for (const status of ['FAIL','INCONCLUSIVE','BLOCKED'])
  await check(status, ['personnel-organization-scope'], [await issueReceipt('personnel-organization-scope', status)]);
 const edited = root + '/edited.json';
 await fs.writeFile(edited, JSON.stringify({...JSON.parse(await fs.readFile(group)), claim:'personnel-organization-scope'}));
 await check('edited', ['personnel-organization-scope'], [edited]);
 await check('absentFile', ['personnel-organization-scope'], [root + '/absent.json']);
 await fs.writeFile('changed-code.mjs', 'export const changed = true;');
 await check('stale', ['personnel-organization-scope'], [personnel]);
 await fs.unlink('changed-code.mjs');
 await fs.writeFile(file, JSON.stringify({schema:1, issue, requirements:[]}));
 try { await checkClaims(file, [personnel]); results.empty = {status:'PASS'}; }
 catch(error) { results.empty = {status:error.code}; }
 await fs.writeFile(file, JSON.stringify({schema:1, issue, requirements:[{...requirement('personnel-organization-scope'), coverage:[]}]}));
 results.noInventory = await checkClaims(file, [personnel]);
 const blocked = spawnSync(process.execPath, ['scripts/verification/cli.mjs','check-claims',file,personnel], {encoding:'utf8'});
 results.exit = {status:String(blocked.status)};
 await check('restored', ['personnel-organization-scope'], [personnel]);
 console.log(JSON.stringify(results));
} finally { await fs.rm(sessions, {recursive:true, force:true}); }
`
				],
				{ cwd: directory, encoding: 'utf8' }
			)
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}, 30000);

it('requires every exact claim, implemented coverage and a current receipt', () => {
	expect(results.complete.status).toBe('PASS');
	expect(results.restored.status).toBe('PASS');
	for (const name of [
		'partial',
		'missing',
		'calendar',
		'unimplemented',
		'unrelated',
		'extra',
		'duplicate',
		'noInventory'
	])
		expect(results[name].status, name).toBe('BLOCKED');
	expect(results.unimplemented.requirements?.[0].code).toBe('MISSING_COVERAGE');
	expect(results.calendar.rejected?.[0].code).toBe('UNRELATED_CLAIM');
	expect(results.exit.status).toBe('2');
	expect(results.empty.status).toBe('CLAIM_SET');
});

it('rejects failed, inconclusive, stale, edited and missing receipts without substituting another behavior', () => {
	for (const name of ['FAIL', 'INCONCLUSIVE', 'BLOCKED', 'stale', 'edited', 'absentFile'])
		expect(results[name].status, name).toBe('BLOCKED');
	expect(results.stale.rejected?.[0].code).toBe('STALE_EVIDENCE');
	expect(results.edited.rejected?.[0].code).toBe('EVIDENCE_EDITED');
});
