import { z } from 'zod';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PersonnelExtendedInfo } from '$features/personnel/personnel-detail.types';
import { policyResourceForPersonnel, requireFeaturePolicy } from './featurePolicy';

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

const childSchema = z.object({
	name: z.string().trim().max(120),
	age: z.number().int().min(0).max(120).nullable()
});

const dateInputSchema = z
	.string()
	.trim()
	.refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Use YYYY-MM-DD date format')
	.optional()
	.default('');

const dependentsInputSchema = z
	.preprocess((value) => {
		if (value === '' || value == null) return null;
		if (typeof value === 'number') return Number.isNaN(value) ? null : value;
		if (typeof value === 'string') return Number(value);
		return value;
	}, z.number().int().min(0).max(99).nullable())
	.optional()
	.default(null);

const optionalEmailInputSchema = z.string().email();

export const personnelExtendedInfoInputSchema = z.object({
	personnelId: z.string().min(1),
	bloodType: z.string().trim().max(12).optional().default(''),
	basd: dateInputSchema,
	dateOfRank: dateInputSchema,
	maritalStatus: z.string().trim().max(80).optional().default(''),
	numberOfDependents: dependentsInputSchema,
	children: z.array(childSchema).optional().default([]),
	civilianEducation: z.string().trim().max(500).optional().default(''),
	militaryEducation: z.array(z.string().trim().max(120)).optional().default([]),
	emergencyContactName: z.string().trim().max(160).optional().default(''),
	emergencyContactRelationship: z.string().trim().max(120).optional().default(''),
	emergencyContactPhone: z.string().trim().max(80).optional().default(''),
	spouseName: z.string().trim().max(160).optional().default(''),
	spousePhone: z.string().trim().max(80).optional().default(''),
	vehicleMakeModel: z.string().trim().max(160).optional().default(''),
	vehiclePlate: z.string().trim().max(40).optional().default(''),
	vehicleColor: z.string().trim().max(80).optional().default(''),
	personalEmail: z
		.string()
		.trim()
		.max(255)
		.refine(
			(value) => value === '' || optionalEmailInputSchema.safeParse(value).success,
			'Enter a valid personal email'
		)
		.optional()
		.default(''),
	personalPhone: z.string().trim().max(80).optional().default(''),
	addressStreet: z.string().trim().max(255).optional().default(''),
	addressCity: z.string().trim().max(120).optional().default(''),
	addressState: z.string().trim().max(80).optional().default(''),
	addressZip: z.string().trim().max(20).optional().default('')
});

export type PersonnelExtendedInfoInput = z.infer<typeof personnelExtendedInfoInputSchema>;

function normalizeJsonStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeChildren(value: unknown): PersonnelExtendedInfo['children'] {
	const parsed = z.array(childSchema).safeParse(value);
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

async function requirePersonnelOperate(ctx: UseCaseContext, personnelId: string): Promise<void> {
	const person = await ctx.store.findOne<{ id: string }>('personnel', ctx.auth.orgId, { id: personnelId }, 'id');
	if (!person) fail(404, 'Personnel record not found');

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		await policyResourceForPersonnel(ctx, personnelId),
		'personnel',
		personnelId
	);
	await ctx.auth.requireGroupAccess(personnelId);
}

export async function readPersonnelExtendedInfo(
	ctx: UseCaseContext,
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
	ctx: UseCaseContext,
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
