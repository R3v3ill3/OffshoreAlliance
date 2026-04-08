/**
 * Merge tokens for the signed-in / staff organiser (user_profiles + auth email).
 * Preview sample values are for the template editor only.
 */
export const STAFF_TEMPLATE_VARIABLES = [
  "{{staff_name}}",
  "{{staff_email}}",
  "{{staff_phone}}",
  "{{staff_role}}",
] as const

export const STAFF_TEMPLATE_SAMPLE_DATA: Record<string, string> = {
  staff_name: "Sarah Chen",
  staff_email: "sarah.chen@example.com",
  staff_phone: "0412 345 678",
  staff_role: "Lead Organiser",
}
