import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { GitHubSlicesConfig, SliceWidgetConfig } from './types.js';

const CONFIG_FILE = join('.pi', 'github-slices.json');
const DEFAULT_WIDGET: SliceWidgetConfig = {
	placement: 'aboveEditor',
	windowSize: 5
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function getConfigPath(cwd: string): string {
	return join(cwd, CONFIG_FILE);
}

export function normalizeIssueNumbers(numbers: number[]): number[] {
	const unique = new Set<number>();
	for (const number of numbers) {
		if (!Number.isInteger(number) || number <= 0) {
			continue;
		}

		unique.add(number);
	}

	return [...unique];
}

function parseWidget(value: unknown): SliceWidgetConfig {
	if (!isRecord(value)) {
		return { ...DEFAULT_WIDGET };
	}

	const placement = value.placement === 'aboveEditor' ? 'aboveEditor' : DEFAULT_WIDGET.placement;
	const windowSize =
		typeof value.windowSize === 'number' && Number.isInteger(value.windowSize) && value.windowSize >= 1
			? value.windowSize
			: DEFAULT_WIDGET.windowSize;

	return { placement, windowSize };
}

function parseConfig(value: unknown): GitHubSlicesConfig | undefined {
	if (!isRecord(value) || typeof value.repo !== 'string' || !Array.isArray(value.issues)) {
		return undefined;
	}

	const repo = value.repo.trim();
	const issues = normalizeIssueNumbers(value.issues.filter((issue): issue is number => typeof issue === 'number'));
	if (!repo || issues.length === 0) {
		return undefined;
	}

	return {
		repo,
		issues,
		widget: parseWidget(value.widget)
	};
}

export async function loadSlicesConfig(cwd: string): Promise<GitHubSlicesConfig | undefined> {
	try {
		const content = await readFile(getConfigPath(cwd), 'utf8');
		return parseConfig(JSON.parse(content));
	} catch (error) {
		const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
		if (code === 'ENOENT') {
			return undefined;
		}

		throw error;
	}
}

export async function saveSlicesConfig(cwd: string, config: GitHubSlicesConfig): Promise<void> {
	const normalized: GitHubSlicesConfig = {
		repo: config.repo.trim(),
		issues: normalizeIssueNumbers(config.issues),
		widget: parseWidget(config.widget)
	};

	if (!normalized.repo || normalized.issues.length === 0) {
		throw new Error('Cannot save github slices config without a repo and at least one issue.');
	}

	const path = getConfigPath(cwd);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(normalized, null, '\t')}\n`, 'utf8');
}
