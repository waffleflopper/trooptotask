import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getDefaultFederalHolidays } from "$lib/utils/federalHolidays";

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(303, "/auth/login");
};

const DEFAULT_GROUPS = ["Leadership", "Alpha", "Bravo"];

const DEFAULT_STATUS_TYPES = [
  { name: "Leave", color: "#48bb78", text_color: "#ffffff", sort_order: 0 },
  { name: "School", color: "#4299e1", text_color: "#ffffff", sort_order: 1 },
  {
    name: "Field/Training",
    color: "#a0522d",
    text_color: "#ffffff",
    sort_order: 2,
  },
  { name: "TDY", color: "#9f7aea", text_color: "#ffffff", sort_order: 3 },
  {
    name: "Appointment",
    color: "#ed8936",
    text_color: "#ffffff",
    sort_order: 4,
  },
  { name: "Sick", color: "#e53e3e", text_color: "#ffffff", sort_order: 5 },
  { name: "CQ/SD", color: "#dc2626", text_color: "#ffffff", sort_order: 6 },
];

const DEFAULT_ASSIGNMENT_TYPES = [
  {
    name: "Staff Duty",
    short_name: "SD",
    assign_to: "personnel",
    color: "#dc2626",
    sort_order: 0,
  },
];

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const user = locals.user;
    if (!user) throw redirect(303, "/auth/login");

    const formData = await request.formData();
    const name = (formData.get("name") as string)?.trim();

    if (!name) {
      return fail(400, { error: "Organization name is required" });
    }

    // Use the database function to create organization and membership atomically
    const { data: orgId, error: orgError } = await locals.supabase.rpc(
      "create_org_with_owner",
      { p_name: name }
    );

    if (orgError || !orgId) {
      console.error("Organization creation error:", orgError);
      return fail(500, {
        error: orgError?.message ?? "Failed to create organization",
      });
    }

    // Update the owner's membership with their email
    await locals.supabase
      .from("organization_memberships")
      .update({ email: user.email?.toLowerCase() })
      .eq("organization_id", orgId)
      .eq("user_id", user.id);

    // Seed default groups
    const groupRows = DEFAULT_GROUPS.map((name, i) => ({
      organization_id: orgId,
      name,
      sort_order: i,
    }));
    const { error: groupsError } = await locals.supabase
      .from("groups")
      .insert(groupRows);
    if (groupsError) console.error("Groups seed error:", groupsError);

    // Seed default status types
    const statusRows = DEFAULT_STATUS_TYPES.map((st) => ({
      organization_id: orgId,
      ...st,
    }));
    const { error: statusError } = await locals.supabase
      .from("status_types")
      .insert(statusRows);
    if (statusError) console.error("Status types seed error:", statusError);

    // Seed default assignment types
    const assignmentRows = DEFAULT_ASSIGNMENT_TYPES.map((at) => ({
      organization_id: orgId,
      ...at,
    }));
    const { error: assignmentError } = await locals.supabase
      .from("assignment_types")
      .insert(assignmentRows);
    if (assignmentError)
      console.error("Assignment types seed error:", assignmentError);

    // Seed federal holidays
    const holidays = getDefaultFederalHolidays();
    const holidayRows = holidays.map((h) => ({
      organization_id: orgId,
      date: h.date,
      name: h.name,
      type: h.type,
    }));
    // Insert in batches to avoid payload limits
    for (let i = 0; i < holidayRows.length; i += 50) {
      const { error: holidayError } = await locals.supabase
        .from("special_days")
        .insert(holidayRows.slice(i, i + 50));
      if (holidayError) console.error("Holidays seed error:", holidayError);
    }

    throw redirect(303, `/org/${orgId}`);
  },
};
