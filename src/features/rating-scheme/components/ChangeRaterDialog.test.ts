import '@testing-library/jest-dom/vitest';
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChangeRaterDialog from './ChangeRaterDialog.svelte';
import { evaluation, line, linePersonnel } from '../utils/ratingSchemeLineTestData';

type Props = ComponentProps<typeof ChangeRaterDialog>;

function renderDialog(overrides: Partial<Props> = {}) {
	const props: Props = {
		line: { ...line('scheme-1'), open: evaluation('eval-1', 'scheme-1') },
		personnel: linePersonnel,
		isCurrentWorkspace: () => true,
		onChange: vi.fn().mockResolvedValue(undefined),
		onClose: vi.fn(),
		...overrides
	};
	render(ChangeRaterDialog, { props });
	return props;
}

async function chooseNewRater(name: string) {
	await fireEvent.click(screen.getByRole('button', { name: 'New rater' }));
	await fireEvent.click(await screen.findByRole('option', { name }));
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-06-15T12:00:00'));
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('ChangeRaterDialog', () => {
	it('refuses to submit until a new rater is chosen', async () => {
		const props = renderDialog();

		await fireEvent.click(screen.getByRole('button', { name: 'Change rater' }));

		expect(props.onChange).not.toHaveBeenCalled();
		expect((await screen.findByRole('alert')).textContent).toContain('Choose the new rater');
	});

	it('sends the chosen rater with the last day under the current one', async () => {
		const props = renderDialog();

		await chooseNewRater('SGT Park, Lena');
		await fireEvent.click(screen.getByRole('button', { name: 'Change rater' }));

		await waitFor(() => expect(props.onChange).toHaveBeenCalledTimes(1));
		expect(props.onChange).toHaveBeenCalledWith(
			'eval-1',
			{ changeDate: '2026-06-15', raterPersonId: 'park', raterName: null },
			expect.any(Function)
		);
	});

	it('keeps the dialog open and shows the server reason when the change is refused', async () => {
		const props = renderDialog({ onChange: vi.fn().mockRejectedValue(new Error('The rater is already assigned.')) });

		await chooseNewRater('SGT Park, Lena');
		await fireEvent.click(screen.getByRole('button', { name: 'Change rater' }));

		expect((await screen.findByRole('alert')).textContent).toContain('The rater is already assigned.');
		expect(props.onClose).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Change rater' })).not.toBeDisabled();
	});

	it('still submits a Change of Rater shorter than the 90 rated days a report needs', async () => {
		vi.setSystemTime(new Date('2026-01-20T12:00:00'));
		const props = renderDialog();

		await chooseNewRater('SGT Park, Lena');
		await fireEvent.click(screen.getByRole('button', { name: 'Change rater' }));

		await waitFor(() => expect(props.onChange).toHaveBeenCalledTimes(1));
		expect(vi.mocked(props.onChange).mock.calls[0][1].changeDate).toBe('2026-01-20');
	});

	it('closes from Cancel without calling the server', async () => {
		const props = renderDialog();

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(props.onClose).toHaveBeenCalledTimes(1);
		expect(props.onChange).not.toHaveBeenCalled();
	});
});
