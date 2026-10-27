// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CoachMark from './coach-mark.svelte';

/** Stands in for the dialog that closes on an Escape reaching the document. */
const outside = vi.fn();

beforeEach(() => document.addEventListener('keydown', outside));
afterEach(() => {
	cleanup();
	document.removeEventListener('keydown', outside);
	outside.mockClear();
});

const field = createRawSnippet(() => ({
	render: () => '<input aria-label="Name" aria-describedby="hint" />'
}));

function renderHint(open: boolean) {
	const onDismiss = vi.fn();
	render(CoachMark, {
		open,
		id: 'hint',
		title: 'Type a name here.',
		body: 'Enter works too.',
		onDismiss,
		children: field
	});
	return onDismiss;
}

describe('CoachMark', () => {
	it('describes the control it points at', () => {
		renderHint(true);

		expect(screen.getByLabelText('Name')).toHaveAccessibleDescription(/Type a name here\..*Enter works too\./);
	});

	it('takes Escape from the control so the surface around it stays open', async () => {
		const onDismiss = renderHint(true);

		await fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' });

		expect(onDismiss).toHaveBeenCalledOnce();
		expect(outside).not.toHaveBeenCalled();
	});

	it('dismisses from its close button', async () => {
		const onDismiss = renderHint(true);

		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss hint' }));

		expect(onDismiss).toHaveBeenCalledOnce();
	});

	it('leaves Escape alone once closed', async () => {
		const onDismiss = renderHint(false);

		expect(screen.getByLabelText('Name')).not.toHaveAccessibleDescription();
		await fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' });

		expect(onDismiss).not.toHaveBeenCalled();
		expect(outside).toHaveBeenCalledOnce();
	});
});
