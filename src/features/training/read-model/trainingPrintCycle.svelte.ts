import { flushSync } from 'svelte';
import type { TrainingBriefingDetail, TrainingBriefingReportData } from '../contracts';

interface TrainingPrintData {
	report: TrainingBriefingReportData;
	detail: TrainingBriefingDetail | null;
}

export class TrainingPrintCycle {
	data = $state.raw<TrainingPrintData | null>(null);
	#disposed = false;
	readonly #read: () => TrainingPrintData;

	constructor(read: () => TrainingPrintData) {
		this.#read = read;
	}

	capture(): boolean {
		if (this.#disposed || this.data !== null) return false;
		flushSync(() => {
			this.data = this.#read();
		});
		return true;
	}

	print(invoke: () => void): void {
		if (!this.capture()) return;
		try {
			invoke();
		} catch (error) {
			this.release();
			throw error;
		}
	}

	release(): void {
		this.data = null;
	}

	dispose(): void {
		this.#disposed = true;
		this.release();
	}
}
