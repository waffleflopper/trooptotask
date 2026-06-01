export type ReportRunStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ReportRun<TResult> {
	readonly status: ReportRunStatus;
	readonly result: TResult | null;
	readonly error: string | null;
	readonly canRun: boolean;
	run(): Promise<void>;
	reset(): void;
}

export function createReportRun<TRaw, TResult>(config: {
	validate: () => string | null;
	load: () => Promise<TRaw>;
	compute: (raw: TRaw) => TResult;
}): ReportRun<TResult> {
	let status = $state<ReportRunStatus>('idle');
	let result = $state<TResult | null>(null);
	let error = $state<string | null>(null);
	let runGeneration = 0;
	const canRun = $derived(config.validate() === null && status !== 'loading');

	return {
		get status() {
			return status;
		},
		get result() {
			return result;
		},
		get error() {
			return error;
		},
		get canRun() {
			return canRun;
		},
		async run() {
			const currentGeneration = ++runGeneration;
			const validationError = config.validate();
			if (validationError) {
				status = 'error';
				error = validationError;
				result = null;
				return;
			}

			status = 'loading';
			error = null;
			result = null;

			try {
				const raw = await config.load();
				if (currentGeneration !== runGeneration) return;
				result = config.compute(raw);
				status = 'ready';
			} catch (cause: unknown) {
				if (currentGeneration !== runGeneration) return;
				status = 'error';
				error = cause instanceof Error ? cause.message : 'Failed to generate report.';
			}
		},
		reset() {
			status = 'idle';
			result = null;
			error = null;
		}
	};
}
