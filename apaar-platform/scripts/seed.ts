/**
 * `npm run db:seed`: writes the sample data into the database that DATABASE_URL points at.
 * It creates the table if needed, and is safe to run again.
 */
import { seedDemoData } from "../lib/seed";
import { getStore } from "../lib/store";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Put it in .env.local or export it, then run this again.");
    process.exit(1);
  }
  const store = getStore();
  const summary = await seedDemoData(store);
  console.log(`Seeded (${store.kind}):`, summary);
  // postgres.js keeps its pool open for a while, so exit explicitly once the work is done.
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
