import { z } from "zod";

const Schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SCRAPER_SHARED_SECRET: z.string().min(16),
  PORT: z.coerce.number().int().positive().default(8080),
  NOPSEMA_URL: z
    .string()
    .url()
    .default(
      "https://info.nopsema.gov.au/home/approved_projects_and_activities?utf8=%E2%9C%93&regions_filter%5B%5D=GS&regions_filter%5B%5D=MW&regions_filter%5B%5D=NW&regions_filter%5B%5D=NT&regions_filter%5B%5D=PIL&regions_filter%5B%5D=SW&keyword_search="
    ),
  SCRAPE_REQUEST_DELAY_MS: z.coerce.number().int().min(0).default(350),
  SCRAPER_CONTACT_EMAIL: z.string().email().default("admin@offshorealliance.org.au"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Config = z.infer<typeof Schema>;

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    throw new Error(
      `Invalid environment configuration: ${JSON.stringify(flat.fieldErrors)}`
    );
  }
  cached = parsed.data;
  return cached;
}
