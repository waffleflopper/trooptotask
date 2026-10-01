import type { z } from 'zod';
import { fail } from '$lib/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { personnelExtendedInfoInputSchema, type PersonnelExtendedInfo } from './contracts';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';

interface PersonnelExtendedInfoContext {
	auth: Parameters<typeof requireFeaturePolicy>[0]['auth'];
	audit: NonNullable<Parameters<typeof requireFeaturePolicy>[0]['audit']>;
	scope: { requireGroupAccess(personnelId: string): Promise<void> };
	store: {
		findOne<T>(
			table: 'personnel' | 'personnel_extended_info',
			orgId: string,
			filters: Record<string, unknown>,
			select?: string
		): Promise<T | null>;
		findMany<T>(table: 'personnel_extended_info', orgId: string, filters: Record<string, unknown>): Promise<T[]>;
		insert<T>(table: 'personnel_extended_info', orgId: string, data: Record<string, unknown>): Promise<T>;
		update<T>(table: 'personnel_extended_info', orgId: string, id: string, data: Record<string, unknown>): Promise<T>;
	};
}

type PersonnelExtendedInfoInput = z.infer<typeof personnelExtendedInfoInputSchema>;

interface ExtendedInfoRow {
	id: string;
	personnel_id: string;
	blood_type: string | null;
	basd: string | null;
	date_of_rank: string | null;
	marital_status: string | null;
	number_of_dependents: number | null;
	children: unknown;
	civilian_education: string | null;
	military_education: unknown;
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
}

function normalizeJsonStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeChildren(value: unknown): PersonnelExtendedInfo['children'] {
	const parsed = personnelExtendedInfoInputSchema.shape.children.safeParse(value);
	return parsed.success ? parsed.data : [];
}

function toAddress(
	row: Pick<ExtendedInfoRow, 'address_street' | 'address_city' | 'address_state' | 'address_zip'>
): string {
	return [row.address_street, row.address_city, row.address_state, row.address_zip].filter(Boolean).join(', ');
}

function mapExtendedInfoRow(row: ExtendedInfoRow): PersonnelExtendedInfo {
	return {
		bloodType: row.blood_type ?? '',
		basd: row.basd ?? '',
		dateOfRank: row.date_of_rank ?? '',
		maritalStatus: row.marital_status ?? '',
		numberOfDependents: row.number_of_dependents ?? null,
		children: normalizeChildren(row.children),
		civilianEducation: row.civilian_education ?? '',
		militaryEducation: normalizeJsonStringArray(row.military_education),
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
		addressStreet: row.address_street ?? '',
		addressCity: row.address_city ?? '',
		addressState: row.address_state ?? '',
		addressZip: row.address_zip ?? '',
		address: toAddress(row)
	};
}

function toRowData(input: PersonnelExtendedInfoInput): Record<string, unknown> {
	return {
		personnel_id: input.personnelId,
		blood_type: input.bloodType || null,
		basd: input.basd || null,
		date_of_rank: input.dateOfRank || null,
		marital_status: input.maritalStatus || null,
		number_of_dependents: input.numberOfDependents,
		children: input.children,
		civilian_education: input.civilianEducation || null,
		military_education: input.militaryEducation,
		emergency_contact_name: input.emergencyContactName || null,
		emergency_contact_relationship: input.emergencyContactRelationship || null,
		emergency_contact_phone: input.emergencyContactPhone || null,
		spouse_name: input.spouseName || null,
		spouse_phone: input.spousePhone || null,
		vehicle_make_model: input.vehicleMakeModel || null,
		vehicle_plate: input.vehiclePlate || null,
		vehicle_color: input.vehicleColor || null,
		personal_email: input.personalEmail || null,
		personal_phone: input.personalPhone || null,
		address_street: input.addressStreet || null,
		address_city: input.addressCity || null,
		address_state: input.addressState || null,
		address_zip: input.addressZip || null
	};
}

async function requirePersonnelOperate(ctx: PersonnelExtendedInfoContext, personnelId: string): Promise<void> {
	const person = await ctx.store.findOne<{ id: string }>('personnel', ctx.auth.orgId, { id: personnelId }, 'id');
	if (!person) fail(404, 'Personnel record not found');

	const policyPerson = await ctx.store.findOne<{ group_id: string | null }>(
		'personnel',
		ctx.auth.orgId,
		{ id: personnelId },
		'group_id'
	);
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResourceForGroup(policyPerson?.group_id),
		'personnel',
		personnelId
	);
	await ctx.scope.requireGroupAccess(personnelId);
}

export async function readPersonnelExtendedInfo(
	ctx: PersonnelExtendedInfoContext,
	personnelId: string
): Promise<PersonnelExtendedInfo | null> {
	await requirePersonnelOperate(ctx, personnelId);
	const rows = await ctx.store.findMany<ExtendedInfoRow>('personnel_extended_info', ctx.auth.orgId, {
		personnel_id: personnelId
	});
	const row = rows[0];
	return row ? mapExtendedInfoRow(row) : null;
}

export async function updatePersonnelExtendedInfo(
	ctx: PersonnelExtendedInfoContext,
	rawInput: unknown
): Promise<PersonnelExtendedInfo> {
	const parsed = personnelExtendedInfoInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}

	const input = parsed.data;
	await requirePersonnelOperate(ctx, input.personnelId);

	const existing = await ctx.store.findOne<ExtendedInfoRow>('personnel_extended_info', ctx.auth.orgId, {
		personnel_id: input.personnelId
	});
	const data = toRowData(input);
	const row = existing
		? await ctx.store.update<ExtendedInfoRow>('personnel_extended_info', ctx.auth.orgId, existing.id, data)
		: await ctx.store.insert<ExtendedInfoRow>('personnel_extended_info', ctx.auth.orgId, data);

	ctx.audit.log({
		action: 'personnel.extended_info.updated',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});

	return mapExtendedInfoRow(row);
}
