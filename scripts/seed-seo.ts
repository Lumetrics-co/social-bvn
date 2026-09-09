// Seeds (or re-seeds) the SEO audit tables from seed/seo-audit.json.
//
// Usage:
//   bun run scripts/seed-seo.ts            # seeds only if empty
//   bun run scripts/seed-seo.ts --force    # wipes existing SEO data and re-imports
//
// This is the intended way to get SEO audit + recommendation data onto a
// server: commit an updated seed/seo-audit.json, then run this command there.
// database.sqlite itself is never checked in or copied between machines.
import { readFileSync } from "fs";
import { join } from "path";
import { getLatestAuditRow, clearSeoData, importSeoAudit } from "../src/db";

const force = process.argv.includes("--force");
const seedPath = join(import.meta.dir, "..", "seed", "seo-audit.json");

const existing = getLatestAuditRow();

if (existing && !force) {
  console.log(
    `Already seeded — audit id ${existing.id}, recommendations_generated_at: ${existing.recommendations_generated_at ?? "not generated"}.`
  );
  console.log("Pass --force to wipe and re-import from seed/seo-audit.json.");
  process.exit(0);
}

const seedJson = JSON.parse(readFileSync(seedPath, "utf-8"));

if (existing && force) {
  console.log(`Wiping existing SEO data (audit id ${existing.id}) before re-import...`);
  clearSeoData();
}

const auditId = importSeoAudit(seedJson);
console.log(`Seeded SEO audit id ${auditId} from ${seedPath}`);
console.log(`Pages: ${seedJson.pages.length}, recommendations_generated_at: ${seedJson.site.recommendations_generated_at ?? "not generated"}`);
