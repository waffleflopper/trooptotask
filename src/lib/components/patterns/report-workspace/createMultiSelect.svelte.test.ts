import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { createMultiSelect } from './createMultiSelect.svelte';

interface Option {
	id: string;
	label: string;
}

describe('createMultiSelect', () => {
	it('selects all options when an empty option list loads later', () => {
		const cleanup = $effect.root(() => {
			let options = $state<Option[]>([]);
			const select = createMultiSelect(() => options);

			flushSync();
			expect(select.count).toBe(0);
			expect(select.allSelected).toBe(true);

			options = [
				{ id: 'alpha', label: 'Alpha' },
				{ id: 'bravo', label: 'Bravo' }
			];
			flushSync();

			expect(select.count).toBe(2);
			expect(select.has('alpha')).toBe(true);
			expect(select.has('bravo')).toBe(true);
		});

		cleanup();
	});

	it('preserves all-selected state as the option list changes', () => {
		const cleanup = $effect.root(() => {
			let options = $state<Option[]>([
				{ id: 'alpha', label: 'Alpha' },
				{ id: 'bravo', label: 'Bravo' }
			]);
			const select = createMultiSelect(() => options);

			flushSync();
			expect(select.count).toBe(2);

			options = [
				{ id: 'alpha', label: 'Alpha' },
				{ id: 'bravo', label: 'Bravo' },
				{ id: 'charlie', label: 'Charlie' }
			];
			flushSync();

			expect(select.count).toBe(3);
			expect(select.has('charlie')).toBe(true);
		});

		cleanup();
	});

	it('keeps a subset selection to ids that still exist', () => {
		const cleanup = $effect.root(() => {
			let options = $state<Option[]>([
				{ id: 'alpha', label: 'Alpha' },
				{ id: 'bravo', label: 'Bravo' },
				{ id: 'charlie', label: 'Charlie' }
			]);
			const select = createMultiSelect(() => options);

			flushSync();
			select.toggle('bravo');
			flushSync();
			expect(select.count).toBe(2);
			expect(select.has('bravo')).toBe(false);

			options = [
				{ id: 'bravo', label: 'Bravo' },
				{ id: 'charlie', label: 'Charlie' },
				{ id: 'delta', label: 'Delta' }
			];
			flushSync();

			expect(select.count).toBe(1);
			expect(select.has('charlie')).toBe(true);
			expect(select.has('alpha')).toBe(false);
			expect(select.has('delta')).toBe(false);
		});

		cleanup();
	});
});
