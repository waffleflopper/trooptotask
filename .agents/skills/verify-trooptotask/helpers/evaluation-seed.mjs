import { randomUUID } from 'node:crypto';

const CHAIN = [
	'rater_person_id',
	'rater_name',
	'intermediate_rater_person_id',
	'intermediate_rater_name',
	'senior_rater_person_id',
	'senior_rater_name',
	'reviewer_person_id',
	'reviewer_name'
];

/**
 * Splits seed rows written as one Evaluation with its rating chain into rating_schemes and evaluations rows, as the
 * split migration does. A Person's first row names their scheme's chain. A Person who already has a listed scheme
 * keeps it, since they may have only one. A completed row, or one whose chain differs from its scheme's, keeps its
 * own chain as a snapshot.
 */
export async function evaluationSeedRows(client, entries) {
	const { data, error } = await client
		.from('rating_schemes')
		.select(['id', 'organization_id', 'rated_person_id', ...CHAIN].join(','))
		.in('rated_person_id', [...new Set(entries.map((entry) => entry.rated_person_id))])
		.is('archived_at', null);
	if (error) throw new Error(`Rating scheme seed lookup failed: ${error.message}`);
	const listed = new Map(data.map((scheme) => [`${scheme.organization_id}:${scheme.rated_person_id}`, scheme]));
	const schemes = [];
	const evaluations = entries.map((entry) => {
		const key = `${entry.organization_id}:${entry.rated_person_id}`;
		const chain = Object.fromEntries(CHAIN.map((column) => [column, entry[column] ?? null]));
		let scheme = listed.get(key);
		if (!scheme) {
			scheme = {
				id: randomUUID(),
				organization_id: entry.organization_id,
				rated_person_id: entry.rated_person_id,
				eval_type: entry.eval_type,
				...chain,
				notes: entry.scheme_notes ?? null
			};
			schemes.push(scheme);
			listed.set(key, scheme);
		}
		const evaluation = Object.fromEntries(
			Object.entries(entry).filter(([column]) => !CHAIN.includes(column) && column !== 'scheme_notes')
		);
		const keeps =
			entry.workflow_status === 'completed' || CHAIN.some((column) => chain[column] !== (scheme[column] ?? null));
		return {
			...evaluation,
			rating_scheme_id: scheme.id,
			...(keeps
				? {
						chain_snapshot_at: entry.chain_snapshot_at ?? new Date().toISOString(),
						...Object.fromEntries(CHAIN.map((column) => [`snapshot_${column}`, chain[column]]))
					}
				: {})
		};
	});
	return { schemes, evaluations };
}
