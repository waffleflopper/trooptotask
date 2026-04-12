import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { getAgentDir, parseFrontmatter } from '@mariozechner/pi-coding-agent';

export type AgentScope = 'user' | 'project' | 'both';

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: 'user' | 'project';
	filePath: string;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentDirs: string[];
	userAgentDirs: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function uniquePaths(paths: string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const path of paths) {
		if (!path || seen.has(path)) {
			continue;
		}
		seen.add(path);
		unique.push(path);
	}
	return unique;
}

function parseToolsField(value: unknown): string[] | undefined {
	if (typeof value === 'string') {
		const tools = value
			.split(',')
			.map((tool) => tool.trim())
			.filter(Boolean);
		return tools.length > 0 ? tools : undefined;
	}

	if (Array.isArray(value)) {
		const tools = value
			.filter((tool): tool is string => typeof tool === 'string')
			.map((tool) => tool.trim())
			.filter(Boolean);
		return tools.length > 0 ? tools : undefined;
	}

	return undefined;
}

function loadAgentsFromDir(dir: string, source: 'user' | 'project'): AgentConfig[] {
	if (!existsSync(dir) || !isDirectory(dir)) {
		return [];
	}

	const agents: AgentConfig[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (!entry.name.endsWith('.md')) {
			continue;
		}
		if (!entry.isFile() && !entry.isSymbolicLink()) {
			continue;
		}

		const filePath = join(dir, entry.name);
		let content: string;
		try {
			content = readFileSync(filePath, 'utf8');
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(content);
		if (!isRecord(frontmatter) || typeof frontmatter.name !== 'string' || typeof frontmatter.description !== 'string') {
			continue;
		}

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: parseToolsField(frontmatter.tools),
			model: typeof frontmatter.model === 'string' ? frontmatter.model : undefined,
			systemPrompt: body,
			source,
			filePath
		});
	}

	return agents;
}

function findNearestDir(cwd: string, relativeDir: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = join(currentDir, relativeDir);
		if (isDirectory(candidate)) {
			return candidate;
		}

		const parent = dirname(currentDir);
		if (parent === currentDir) {
			return null;
		}
		currentDir = parent;
	}
}

function getUserAgentDirs(): string[] {
	return uniquePaths([join(getAgentDir(), 'agents'), join(homedir(), '.claude', 'agents')]);
}

function getProjectAgentDirs(cwd: string): string[] {
	return uniquePaths([findNearestDir(cwd, '.pi/agents') ?? '', findNearestDir(cwd, '.claude/agents') ?? '']);
}

export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const userAgentDirs = getUserAgentDirs();
	const projectAgentDirs = getProjectAgentDirs(cwd);
	const agentMap = new Map<string, AgentConfig>();

	if (scope === 'user' || scope === 'both') {
		for (const dir of userAgentDirs) {
			for (const agent of loadAgentsFromDir(dir, 'user')) {
				agentMap.set(agent.name.toLowerCase(), agent);
			}
		}
	}

	if (scope === 'project' || scope === 'both') {
		for (const dir of projectAgentDirs) {
			for (const agent of loadAgentsFromDir(dir, 'project')) {
				agentMap.set(agent.name.toLowerCase(), agent);
			}
		}
	}

	return {
		agents: [...agentMap.values()],
		projectAgentDirs,
		userAgentDirs
	};
}

export function findAgentByName(agents: AgentConfig[], name: string): AgentConfig | undefined {
	const normalized = name.trim().toLowerCase();
	return agents.find((agent) => agent.name.trim().toLowerCase() === normalized);
}
