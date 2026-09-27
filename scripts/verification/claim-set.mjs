import { candidate, checkReceipt, readJSON, Blocked } from './core.mjs';
import { claimNames } from './claims.mjs';

/** Check exactly the issue's declared behaviors; neither this file nor receipts define product intent. */
export async function checkClaims(file, receipts = []) {
	const plan = await readJSON(file);
	const text = (value) => typeof value === 'string' && value.trim().length > 0;
	if (
		!plan ||
		plan.schema !== 1 ||
		!text(plan.issue) ||
		!Array.isArray(plan.requirements) ||
		!plan.requirements.length ||
		plan.requirements.some(
			(item) =>
				!item ||
				!['claim', 'behavior', 'acceptance', 'contract'].every((key) => text(item[key])) ||
				!Array.isArray(item.coverage) ||
				!item.coverage.every(text)
		) ||
		new Set(plan.requirements.map((item) => item.claim)).size !== plan.requirements.length
	)
		throw new Blocked(
			'CLAIM_SET',
			'Provide schema 1, an issue, and nonempty unique requirements with claim, behavior, acceptance, contract, and coverage (an array; empty means missing).'
		);
	const current = await candidate();
	const supplied = new Map();
	const rejected = [];
	for (const receipt of receipts) {
		try {
			const checked = await checkReceipt(receipt);
			if (checked.candidate !== current) throw new Blocked('STALE_EVIDENCE', 'Candidate changed during checking.');
			if (!plan.requirements.some((item) => item.claim === checked.claim))
				throw new Blocked('UNRELATED_CLAIM', `${checked.claim} is not a required claim for this issue.`);
			if (supplied.has(checked.claim))
				throw new Blocked('DUPLICATE_RECEIPT', `Supply one current receipt for ${checked.claim}.`);
			supplied.set(checked.claim, receipt);
		} catch (error) {
			rejected.push({
				receipt,
				code: error.code ?? 'INVALID_RECEIPT',
				message:
					error instanceof Blocked
						? error.message
						: 'Receipt file unavailable or invalid. Run prove again and use its returned receipt path.'
			});
		}
	}
	const requirements = plan.requirements.map(({ claim, coverage }) => {
		if (!claimNames.includes(claim) || !coverage.length)
			return {
				claim,
				status: 'BLOCKED',
				code: 'MISSING_COVERAGE',
				message:
					'Add the reusable fixture/check and record its coverage, then prove the unchanged application baseline before refactoring.'
			};
		if (!supplied.has(claim))
			return {
				claim,
				status: 'BLOCKED',
				code: 'MISSING_RECEIPT',
				message: `Run prove ${claim} on this candidate; inspect rejected receipts and retain any existing defect.`
			};
		return { claim, status: 'PASS', receipt: supplied.get(claim) };
	});
	if ((await candidate()) !== current)
		throw new Blocked('STALE_CANDIDATE', 'Candidate changed during checking. Rerun against one unchanged candidate.');
	return {
		status: rejected.length || requirements.some((item) => item.status !== 'PASS') ? 'BLOCKED' : 'PASS',
		issue: plan.issue,
		candidate: current,
		requirements,
		rejected,
		scope:
			'Declared claims only. Review the issue-to-contract mapping for completeness; CI, independent review, and release gates remain required.'
	};
}
