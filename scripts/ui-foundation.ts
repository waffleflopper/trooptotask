import ts from 'typescript';
import { sourceSections } from './module-imports.ts';

type Edge = { from: string; to?: string; classification: string; specifier: string };
type Graph = { sourcePaths: string[]; edges: Edge[]; contents: Record<string, string> };
type Finding = { kind: string; file: string; message: string };

const COMPONENTS = 'src/lib/components/';
const FAMILY_LAYERS = ['ui', 'patterns'];
const COMPONENT_LAYERS = new Set([...FAMILY_LAYERS, 'public']);
const PRIMITIVE_PACKAGE = /^bits-ui(?:\/|$)/;
const PROVIDER_SPECIFIER = /^(?:@supabase\/|\$env\/|\$app\/server$|node:)/;
const PRIVILEGED_TARGET =
	/^src\/(?:features|routes|lib\/server|lib\/storage|lib\/access)\/|\.server\.[^/]+$|\/\+server\.[jt]s$/;

/** `src/lib/components/<ui|patterns>/<family>/` for a file inside a shared family, else undefined. */
function familyRoot(file: string): string | undefined {
	const match = file.match(/^src\/lib\/components\/(ui|patterns)\/([^/]+)\//);
	return match ? match[0] : undefined;
}

function isFoundationSource(file: string): boolean {
	return FAMILY_LAYERS.some((layer) => file.startsWith(`${COMPONENTS}${layer}/`));
}

/** References to SvelteKit's ambient `App` namespace, which carries the provider session and user. */
function ambientAppTypes(file: string, content: string): string[] {
	const sections = file.endsWith('.svelte') ? sourceSections(file, content).scripts : [{ content, offset: 0 }];
	const found = new Set<string>();
	for (const section of sections) {
		const source = ts.createSourceFile(file, section.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
		const visit = (node: ts.Node) => {
			if (ts.isQualifiedName(node) && ts.isIdentifier(node.left) && node.left.text === 'App') {
				found.add(`App.${node.right.text}`);
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	return [...found].sort();
}

function checkUiFoundation(graph: Graph): Finding[] {
	const findings: Finding[] = [];
	for (const file of graph.sourcePaths) {
		const layer = file.startsWith(COMPONENTS) ? file.slice(COMPONENTS.length).split('/') : [];
		if (layer.length > 1 && !COMPONENT_LAYERS.has(layer[0])) {
			findings.push({
				kind: 'foundation-placement',
				file,
				message: `Shared component directory ${COMPONENTS}${layer[0]}/ is not a foundation layer; add primitives to components/ui and compositions to components/patterns`
			});
		}
		if (isFoundationSource(file)) {
			for (const name of ambientAppTypes(file, graph.contents[file] ?? '')) {
				findings.push({
					kind: 'foundation-provider-type',
					file,
					message: `${name} exposes provider session/user types; accept caller-shaped props instead`
				});
			}
		}
	}
	for (const edge of graph.edges) {
		if (edge.classification === 'external' && PRIMITIVE_PACKAGE.test(edge.specifier)) {
			if (!edge.from.startsWith(`${COMPONENTS}ui/`)) {
				findings.push({
					kind: 'foundation-package',
					file: edge.from,
					message: `${edge.specifier} is imported outside components/ui; compose a ui family instead`
				});
			}
			continue;
		}
		if (isFoundationSource(edge.from)) {
			const provider = PROVIDER_SPECIFIER.test(edge.specifier);
			if (provider || (edge.to && PRIVILEGED_TARGET.test(edge.to))) {
				findings.push({
					kind: provider && edge.specifier.startsWith('@supabase/') ? 'foundation-provider-type' : 'foundation-layer',
					file: edge.from,
					message: `${edge.specifier}${edge.to ? ` (${edge.to})` : ''}: ui and patterns import no feature, route, server or provider code`
				});
			}
		}
		const family = edge.to && familyRoot(edge.to);
		if (family && edge.to !== `${family}index.ts` && !edge.from.startsWith(family)) {
			findings.push({
				kind: 'foundation-private',
				file: edge.from,
				message: `${edge.specifier} (${edge.to}) reaches into ${family}; import ${family}index.ts`
			});
		}
	}
	return findings;
}

export { checkUiFoundation };
