// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import TooltipTest from './TooltipTest.svelte';

describe('Tooltip accessible descriptions', () => {
	afterEach(cleanup);

	it('connects keyboard-focused triggers to distinct descriptions and dismisses without moving focus', async () => {
		render(TooltipTest);
		const first = screen.getByRole('button', { name: 'First help' });
		const second = screen.getByRole('button', { name: 'Second help' });
		first.focus();
		const firstContent = await screen.findByRole('tooltip');
		expect(firstContent).toHaveTextContent('First details');
		expect(firstContent.id).not.toBe('');
		expect(document.getElementById(first.getAttribute('aria-describedby')!)).toBe(firstContent);
		expect(first).toHaveAccessibleDescription('First details');
		const firstId = firstContent.id;

		await fireEvent.keyDown(first, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
		expect(document.activeElement).toBe(first);
		expect(first).not.toHaveAttribute('aria-describedby');

		second.focus();
		const secondContent = await screen.findByRole('tooltip');
		expect(secondContent).toHaveTextContent('Second details');
		expect(secondContent.id).not.toBe(firstId);
		expect(document.getElementById(second.getAttribute('aria-describedby')!)).toBe(secondContent);
		expect(second).toHaveAccessibleDescription('Second details');
		await fireEvent.click(second);
		await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
		expect(document.activeElement).toBe(second);
	});

	it('preserves caller IDs, child rendering, references and Escape callbacks', async () => {
		render(TooltipTest, { customContent: true });
		const trigger = screen.getByRole('button', { name: 'Second help' });
		trigger.focus();
		const content = await screen.findByRole('tooltip');
		expect(content).toHaveAttribute('id', 'caller-help');
		expect(trigger).toHaveAccessibleDescription('Second details');
		expect(screen.getByLabelText('Content reference')).toHaveTextContent('caller-help');
		await fireEvent.keyDown(trigger, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
		expect(screen.getByLabelText('Escape events')).toHaveTextContent('1');
		expect(document.activeElement).toBe(trigger);
	});
});
