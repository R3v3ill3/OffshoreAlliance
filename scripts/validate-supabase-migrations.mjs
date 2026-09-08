#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const validName = /^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort();

const errors = [];
const versions = new Map();

for (const file of files) {
  const match = file.match(validName);
  if (!match) {
    errors.push(
      `${file}: expected YYYYMMDDHHMMSS_snake_case_description.sql`,
    );
    continue;
  }

  const [, version] = match;
  const duplicate = versions.get(version);
  if (duplicate) {
    errors.push(`${file}: version ${version} is already used by ${duplicate}`);
  } else {
    versions.set(version, file);
  }

  const timestamp = Date.UTC(
    Number(version.slice(0, 4)),
    Number(version.slice(4, 6)) - 1,
    Number(version.slice(6, 8)),
    Number(version.slice(8, 10)),
    Number(version.slice(10, 12)),
    Number(version.slice(12, 14)),
  );
  const roundTrip = new Date(timestamp)
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);

  if (roundTrip !== version) {
    errors.push(`${file}: ${version} is not a valid UTC calendar timestamp`);
  }
}

if (files.length === 0) {
  errors.push("supabase/migrations contains no SQL migrations");
}

if (errors.length > 0) {
  console.error("Supabase migration validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Validated ${files.length} Supabase migrations with unique 14-digit versions.`,
);
