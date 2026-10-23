import { describe, expect, it } from 'vitest';
import { nextActionState, type NeedsYouActionEvent, type NeedsYouActionState } from './needsYouAction';

type State = NeedsYouActionState<string>;

function run(...events: NeedsYouActionEvent<string>[]): State {
	return events.reduce<State>((state, event) => nextActionState(state, event), { status: 'idle' });
}

describe('nextActionState', () => {
	it('opens a panel, saves through it and returns to idle', () => {
		expect(run({ type: 'open' })).toEqual({ status: 'opening' });
		expect(run({ type: 'open' }, { type: 'opened', panel: 'fill' })).toEqual({ status: 'open', panel: 'fill' });
		expect(run({ type: 'open' }, { type: 'opened', panel: 'fill' }, { type: 'save' })).toEqual({
			status: 'saving',
			panel: 'fill'
		});
		expect(run({ type: 'open' }, { type: 'opened', panel: 'fill' }, { type: 'save' }, { type: 'saved' })).toEqual({
			status: 'idle'
		});
	});

	it('keeps the panel and the message when a save fails, and keeps the message once the panel closes', () => {
		const failed = run(
			{ type: 'open' },
			{ type: 'opened', panel: 'fill' },
			{ type: 'save' },
			{ type: 'failed', message: 'Archived type' }
		);
		expect(failed).toEqual({ status: 'failed', panel: 'fill', message: 'Archived type' });
		expect(nextActionState(failed, { type: 'close' })).toEqual({
			status: 'failed',
			panel: null,
			message: 'Archived type'
		});
	});

	it('retries a failed save from the open panel', () => {
		const retried = run(
			{ type: 'open' },
			{ type: 'opened', panel: 'fill' },
			{ type: 'save' },
			{ type: 'failed', message: 'Archived type' },
			{ type: 'save' }
		);
		expect(retried).toEqual({ status: 'saving', panel: 'fill' });
	});

	it('shows a failed open in the row, and opens again from there', () => {
		const failed = run({ type: 'open' }, { type: 'failed', message: 'Entry not found' });
		expect(failed).toEqual({ status: 'failed', panel: null, message: 'Entry not found' });
		expect(nextActionState(failed, { type: 'open' })).toEqual({ status: 'opening' });
	});

	it('runs a one-step save from the row without a panel', () => {
		expect(run({ type: 'save' })).toEqual({ status: 'saving', panel: null });
		expect(run({ type: 'save' }, { type: 'failed', message: 'Denied' })).toEqual({
			status: 'failed',
			panel: null,
			message: 'Denied'
		});
	});

	it('ignores a second save, and a close, while one is in flight', () => {
		const saving = run({ type: 'open' }, { type: 'opened', panel: 'fill' }, { type: 'save' });
		expect(nextActionState(saving, { type: 'save' })).toBe(saving);
		expect(nextActionState(saving, { type: 'close' })).toBe(saving);
	});

	it('drops a panel that finishes loading after the viewer cancelled', () => {
		expect(run({ type: 'open' }, { type: 'close' }, { type: 'opened', panel: 'late' })).toEqual({ status: 'idle' });
	});
});
