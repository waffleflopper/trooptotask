// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { CatalogUsageView } from '$lib/stores/core/catalogUsage.svelte';
import type { CatalogUsage } from '$lib/stores/core/catalogArchive';
import { ArchivedTypes } from '.';

afterEach(cleanup);

const types = [
	{ id: 'used', name: 'CPR', archivedAt: '2030-01-02T03:04:05Z' },
	{ id: 'unused', name: 'SHARP', archivedAt: '2030-02-03T04:05:06Z' }
];

function mount(
	options: {
		load?: () => Promise<CatalogUsage>;
		onRestore?: (id: string) => Promise<void>;
		onDelete?: (id: string) => void;
	} = {}
) {
	const usage = new CatalogUsageView(() => 'org-1', options.load ?? (async () => ({ used: 1, unused: 0 })));
	const onRestore = options.onRestore ?? vi.fn(async () => {});
	const onDelete = options.onDelete ?? vi.fn();
	render(ArchivedTypes, {
		props: {
			title: 'Archived training types',
			types,
			usage,
			recordNoun: { one: 'record', many: 'records' },
			onOpen: () => void usage.load(),
			onRestore,
			onDelete
		}
	});
	return { usage, onRestore, onDelete };
}

const open = () => fireEvent.click(screen.getByRole('button', { name: /^Archived training types/ }));
const rowOf = (name: string) => screen.getByRole('button', { name: `Restore ${name}` }).closest('li') as HTMLElement;

describe('ArchivedTypes', () => {
	it('shows its title with the count and starts collapsed', () => {
		mount();

		expect(screen.getByRole('button', { name: /^Archived training types/ }).textContent).toContain('2');
		expect(screen.queryByRole('button', { name: 'Restore CPR' })).toBeNull();
	});

	it('loads the counts when opened and offers Delete only to a type with none', async () => {
		const { usage } = mount();

		await open();
		await waitFor(() => expect(usage.status).toBe('ready'));

		expect(rowOf('CPR').textContent).toContain('1 record');
		expect(within(rowOf('CPR')).queryByRole('button', { name: 'Delete CPR' })).toBeNull();
		expect(rowOf('SHARP').textContent).toContain('0 records');
		expect(within(rowOf('SHARP')).getByRole('button', { name: 'Delete SHARP' })).toBeTruthy();
	});

	it('offers Restore at once but no Delete while the counts load', async () => {
		let release!: (counts: CatalogUsage) => void;
		mount({ load: () => new Promise<CatalogUsage>((resolve) => (release = resolve)) });

		await open();

		expect(within(rowOf('SHARP')).getByRole('button', { name: 'Restore SHARP' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();
		release({ used: 1, unused: 0 });
		expect(await screen.findByRole('button', { name: 'Delete SHARP' })).toBeTruthy();
	});

	it('says the counts failed, keeps Restore, and reloads on Try again', async () => {
		let failing = true;
		mount({
			load: async () => {
				if (failing) throw new Error('offline');
				return { used: 1, unused: 0 };
			}
		});

		await open();
		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('Could not load how many records each type has');
		expect(screen.getByRole('button', { name: 'Restore CPR' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();

		failing = false;
		await fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

		expect(await screen.findByRole('button', { name: 'Delete SHARP' })).toBeTruthy();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('disables every row while one restores, then frees them', async () => {
		let finish!: () => void;
		const onRestore = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
		mount({ onRestore });

		await open();
		await fireEvent.click(await screen.findByRole('button', { name: 'Restore CPR' }));

		expect((screen.getByRole('button', { name: 'Restore SHARP' }) as HTMLButtonElement).disabled).toBe(true);
		expect(onRestore).toHaveBeenCalledExactlyOnceWith('used');
		finish();
		await waitFor(() =>
			expect((screen.getByRole('button', { name: 'Restore SHARP' }) as HTMLButtonElement).disabled).toBe(false)
		);
	});

	it('hands the id of the type to delete to its owner', async () => {
		const { onDelete } = mount();

		await open();
		await fireEvent.click(await screen.findByRole('button', { name: 'Delete SHARP' }));

		expect(onDelete).toHaveBeenCalledExactlyOnceWith('unused');
	});
});
