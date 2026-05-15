import { error } from '@sveltejs/kit';
import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { UseCaseContext } from '$lib/server/core/ports';
import type {
	PersonnelCounselingRecord,
	PersonnelDetailStreams,
	PersonnelExtendedInfo,
	PersonnelLeaderNote
} from '$features/personnel/personnel-detail.types';

interface ExtendedInfoRow {
	emergency_contact_name: string | null;
	emergency_contact_relationship: string | null;
	emergency_contact_phone: string | null;
	spouse_name: string | null;
	spouse_phone: string | null;
	vehicle_make_model: string | null;
	vehicle_plate: string | null;
	vehicle_color: string | null;
	personal_email: string | null;
	personal_phone: string | null;
	address_street: string | null;
	address_city: string | null;
	address_state: string | null;
	address_zip: string | null;
	leader_notes: string | null;
}

interface CounselingRecordRow {
	id: string;
	date_conducted: string;
	subject: string | null;
	notes: string | null;
	file_path: string | null;
}

function toAddress(row: ExtendedInfoRow): string {
	return [row.address_street, row.address_city, row.address_state, row.address_zip].filter(Boolean).join(', ');
}

async function loadExtendedInfo(ctx: UseCaseContext, personnelId: string): Promise<PersonnelExtendedInfo | null> {
	const rows = await ctx.store.findMany<ExtendedInfoRow>('personnel_extended_info', ctx.auth.orgId, {
		personnel_id: personnelId
	});
	const row = rows[0];
	if (!row) return null;

	return {
		emergencyContactName: row.emergency_contact_name ?? '',
		emergencyContactRelationship: row.emergency_contact_relationship ?? '',
		emergencyContactPhone: row.emergency_contact_phone ?? '',
		spouseName: row.spouse_name ?? '',
		spousePhone: row.spouse_phone ?? '',
		vehicleMakeModel: row.vehicle_make_model ?? '',
		vehiclePlate: row.vehicle_plate ?? '',
		vehicleColor: row.vehicle_color ?? '',
		personalEmail: row.personal_email ?? '',
		personalPhone: row.personal_phone ?? '',
		address: toAddress(row),
		leaderNotes: row.leader_notes ?? ''
	};
}

async function loadCounselingRecords(ctx: UseCaseContext, personnelId: string): Promise<PersonnelCounselingRecord[]> {
	const rows = await ctx.store.findMany<CounselingRecordRow>(
		'counseling_records',
		ctx.auth.orgId,
		{ personnel_id: personnelId },
		{
			orderBy: [{ column: 'date_conducted', ascending: false }]
		}
	);

	return rows.map((row) => ({
		dateConducted: row.date_conducted,
		title: row.subject || 'Uploaded counseling PDF',
		summary: row.notes || undefined,
		status: row.file_path ? ('uploaded' as const) : ('needs-title' as const),
		uploadedBy: 'Leader upload',
		filePath: row.file_path ?? `pending-upload/${row.id}.pdf`
	}));
}

async function loadLeaderNotes(ctx: UseCaseContext, personnelId: string): Promise<PersonnelLeaderNote[]> {
	const info = await loadExtendedInfo(ctx, personnelId);
	if (!info?.leaderNotes) return [];

	return [
		{
			author: 'Leader notes',
			date: new Date().toISOString().slice(0, 10),
			text: info.leaderNotes
		}
	];
}

async function loadDerivedFollowUps() {
	return [
		'Review board packet checklist with 1SG.',
		'Verify HIPAA completion before next staff duty cycle.',
		'Acknowledge award tracking for upcoming ETS.',
		'Update leader notes after family care calendar review.'
	];
}

function createPersonnelDetailStreams(ctx: UseCaseContext, personnelId: string): PersonnelDetailStreams {
	return {
		extendedInfo: loadExtendedInfo(ctx, personnelId),
		counselingRecords: loadCounselingRecords(ctx, personnelId),
		leaderNotes: loadLeaderNotes(ctx, personnelId),
		followUps: loadDerivedFollowUps()
	};
}

type LoadWithContext = typeof loadWithContext;

export interface PersonnelDetailPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

async function resolvePersonnelId(ctx: UseCaseContext, personnelSlug: string): Promise<string> {
	const person = await ctx.store.findOne<{ id: string }>('personnel', ctx.auth.orgId, { slug: personnelSlug }, 'id');
	if (!person) {
		error(404, 'Personnel record not found');
	}
	await ctx.auth.requireGroupAccess(person.id);
	return person.id;
}

export function _createPersonnelDetailPageLoad(deps: PersonnelDetailPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, depends }: PageServerLoadEvent) => {
		depends('app:personnel-detail');
		const { orgId, personnelSlug } = params;

		const personnelDetail = await loadWithContextFn(locals, cookies, orgId, {
			permission: 'personnel',
			policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
			policyResource: { kind: 'unscoped' },
			fn: async (ctx) => {
				const personnelId = await resolvePersonnelId(ctx, personnelSlug);
				return createPersonnelDetailStreams(ctx, personnelId);
			}
		});

		return {
			personnelDetail
		};
	};
}

export const load = _createPersonnelDetailPageLoad();
