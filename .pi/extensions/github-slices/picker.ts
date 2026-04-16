import { DynamicBorder } from '@mariozechner/pi-coding-agent';
import { Container, type SelectItem, SelectList, Text } from '@mariozechner/pi-tui';
import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import type { PickerSliceItem } from './types.js';

export async function showSlicesPicker(ctx: ExtensionContext, issues: PickerSliceItem[]): Promise<number | undefined> {
	if (issues.length === 0 || !ctx.hasUI) {
		return undefined;
	}

	const items: SelectItem[] = issues.map((issue) => ({
		value: String(issue.number),
		label: issue.isActive ? `#${issue.number} ${issue.title} (active)` : `#${issue.number} ${issue.title}`,
		description: issue.state.toLowerCase()
	}));

	const result = await ctx.ui.custom<number | undefined>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((text: string) => theme.fg('accent', text)));
		container.addChild(new Text(theme.fg('accent', theme.bold('Slice picker')), 1, 0));

		const selectList = new SelectList(items, Math.min(items.length, 10), {
			selectedPrefix: (text) => theme.fg('accent', text),
			selectedText: (text) => theme.fg('accent', text),
			description: (text) => theme.fg('muted', text),
			scrollInfo: (text) => theme.fg('dim', text),
			noMatch: (text) => theme.fg('warning', text)
		});
		selectList.onSelect = (item) => done(Number.parseInt(item.value, 10));
		selectList.onCancel = () => done(undefined);
		container.addChild(selectList);
		container.addChild(new Text(theme.fg('dim', '↑↓ navigate • enter focus • esc cancel'), 1, 0));
		container.addChild(new DynamicBorder((text: string) => theme.fg('accent', text)));

		return {
			render(width: number) {
				return container.render(width);
			},
			invalidate() {
				container.invalidate();
			},
			handleInput(data: string) {
				selectList.handleInput(data);
				tui.requestRender();
			}
		};
	});

	return result;
}
