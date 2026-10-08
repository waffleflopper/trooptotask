/** Aggregates already-classified facts for Critical Tasks. Callers own classification, exclusions and latest-record selection. */

/** One already-classified (subject × requirement) cell. Keys are opaque join keys. */
export interface ReadinessFact<S extends string = string> {
	/** Soldier / Personnel Record id (or any subject the feature folds over). */
	subjectKey: string;
	/** Training Type id / Critical Task id (or any requirement key). */
	requirementKey: string;
	/** Feature-owned, already-classified state. Opaque to this module. */
	state: S;
}

/** The divergence knobs. Build ONE const per feature context and share it across folds. */
export interface ReadinessTallyConfig<S extends string = string, Z extends 0 | null = 0 | null> {
	/** Percent numerator. Need not mean "good" — see module header. */
	readyStates: readonly S[];
	/**
	 * Counted in stateCounts, excluded from applicable AND ready
	 * (Training: 'not-required', 'exempt'). Default: none. Keep disjoint from
	 * readyStates; on overlap, inapplicable wins.
	 */
	inapplicableStates?: readonly S[];
	/** Reported percent when applicable === 0. Training: 0. ICT matrix: null. */
	zeroApplicablePercent: Z;
}

/** The accumulated result for one fold bucket. */
export interface ReadinessTally<S extends string = string, Z extends 0 | null = 0 | null> {
	/** Facts not in inapplicableStates. */
	applicable: number;
	/** Applicable facts whose state is in readyStates. */
	ready: number;
	/** Math.round((ready / applicable) * 100), else zeroApplicablePercent. */
	percent: number | Z;
	/** Every fact's state, INCLUDING inapplicable ones. Missing key = 0. */
	stateCounts: ReadonlyMap<S, number>;
}

export interface ReadinessFoldOptions {
	/** Keys guaranteed present in the result (empty tally if no facts), iterated first, in this order. */
	seedKeys?: readonly string[];
}

export interface ReadinessGridOptions {
	seedRowKeys?: readonly string[];
	/** Every row receives a cell for every column key (seeded ∪ encountered). */
	seedColKeys?: readonly string[];
}

interface MutableTally<S extends string> {
	applicable: number;
	ready: number;
	stateCounts: Map<S, number>;
}

function newMutableTally<S extends string>(): MutableTally<S> {
	return { applicable: 0, ready: 0, stateCounts: new Map() };
}

function accumulate<S extends string>(
	tally: MutableTally<S>,
	state: S,
	readyStates: ReadonlySet<S>,
	inapplicableStates: ReadonlySet<S>
): void {
	tally.stateCounts.set(state, (tally.stateCounts.get(state) ?? 0) + 1);
	if (inapplicableStates.has(state)) return;
	tally.applicable += 1;
	if (readyStates.has(state)) tally.ready += 1;
}

function finalize<S extends string, Z extends 0 | null>(
	tally: MutableTally<S>,
	zeroApplicablePercent: Z
): ReadinessTally<S, Z> {
	return {
		applicable: tally.applicable,
		ready: tally.ready,
		percent: tally.applicable === 0 ? zeroApplicablePercent : Math.round((tally.ready / tally.applicable) * 100),
		stateCounts: tally.stateCounts
	};
}

function configSets<S extends string>(
	config: ReadinessTallyConfig<S, 0 | null>
): {
	readyStates: ReadonlySet<S>;
	inapplicableStates: ReadonlySet<S>;
} {
	return {
		readyStates: new Set(config.readyStates),
		inapplicableStates: new Set(config.inapplicableStates ?? [])
	};
}

/** 0D: the overall tally. */
export function tallyReadiness<S extends string, Z extends 0 | null>(
	facts: readonly ReadinessFact<S>[],
	config: ReadinessTallyConfig<S, Z>
): ReadinessTally<S, Z> {
	const { readyStates, inapplicableStates } = configSets(config);
	const tally = newMutableTally<S>();
	for (const fact of facts) {
		accumulate(tally, fact.state, readyStates, inapplicableStates);
	}
	return finalize(tally, config.zeroApplicablePercent);
}

/**
 * 1D: one tally per key. Covers by-requirement, by-subject, and
 * by-subject-group (Group / MOS) — the key function closes over whatever
 * feature-owned join it needs (e.g. personId → groupId).
 */
export function tallyReadinessBy<S extends string, Z extends 0 | null>(
	facts: readonly ReadinessFact<S>[],
	config: ReadinessTallyConfig<S, Z>,
	keyOf: (fact: ReadinessFact<S>) => string,
	options: ReadinessFoldOptions = {}
): ReadonlyMap<string, ReadinessTally<S, Z>> {
	const { readyStates, inapplicableStates } = configSets(config);
	const buckets = new Map<string, MutableTally<S>>();
	for (const key of options.seedKeys ?? []) {
		if (!buckets.has(key)) buckets.set(key, newMutableTally());
	}
	for (const fact of facts) {
		const key = keyOf(fact);
		let bucket = buckets.get(key);
		if (!bucket) {
			bucket = newMutableTally();
			buckets.set(key, bucket);
		}
		accumulate(bucket, fact.state, readyStates, inapplicableStates);
	}
	const result = new Map<string, ReadinessTally<S, Z>>();
	for (const [key, bucket] of buckets) {
		result.set(key, finalize(bucket, config.zeroApplicablePercent));
	}
	return result;
}

/**
 * 2D: row × column tallies (MOS × task-category). Rectangular — every row
 * holds every column key. Row totals are the coarser 1D fold; call
 * `tallyReadinessBy(facts, config, rowKeyOf)` rather than widening this shape.
 */
export function tallyReadinessGrid<S extends string, Z extends 0 | null>(
	facts: readonly ReadinessFact<S>[],
	config: ReadinessTallyConfig<S, Z>,
	rowKeyOf: (fact: ReadinessFact<S>) => string,
	colKeyOf: (fact: ReadinessFact<S>) => string,
	options: ReadinessGridOptions = {}
): ReadonlyMap<string, ReadonlyMap<string, ReadinessTally<S, Z>>> {
	const { readyStates, inapplicableStates } = configSets(config);

	// Column domain first (seeded ∪ encountered) so every row can be rectangular.
	const colKeys: string[] = [];
	const colKeySet = new Set<string>();
	const addColKey = (key: string) => {
		if (!colKeySet.has(key)) {
			colKeySet.add(key);
			colKeys.push(key);
		}
	};
	for (const key of options.seedColKeys ?? []) addColKey(key);

	const rowKeys: string[] = [];
	const rowKeySet = new Set<string>();
	const addRowKey = (key: string) => {
		if (!rowKeySet.has(key)) {
			rowKeySet.add(key);
			rowKeys.push(key);
		}
	};
	for (const key of options.seedRowKeys ?? []) addRowKey(key);

	const cells = new Map<string, Map<string, MutableTally<S>>>();
	for (const fact of facts) {
		const rowKey = rowKeyOf(fact);
		const colKey = colKeyOf(fact);
		addRowKey(rowKey);
		addColKey(colKey);
		let row = cells.get(rowKey);
		if (!row) {
			row = new Map();
			cells.set(rowKey, row);
		}
		let cell = row.get(colKey);
		if (!cell) {
			cell = newMutableTally();
			row.set(colKey, cell);
		}
		accumulate(cell, fact.state, readyStates, inapplicableStates);
	}

	const result = new Map<string, ReadonlyMap<string, ReadinessTally<S, Z>>>();
	for (const rowKey of rowKeys) {
		const sourceRow = cells.get(rowKey);
		const row = new Map<string, ReadinessTally<S, Z>>();
		for (const colKey of colKeys) {
			const cell = sourceRow?.get(colKey) ?? newMutableTally<S>();
			row.set(colKey, finalize(cell, config.zeroApplicablePercent));
		}
		result.set(rowKey, row);
	}
	return result;
}
