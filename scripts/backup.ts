import fs from "node:fs/promises";
import path from "node:path";
import {
  adminClient,
  backupRoot,
  PHOTOS_BUCKET,
  TABLES,
  timestamp,
} from "./lib";

// Manual backup (plan section 4). Run before anything schema-related, and
// otherwise whenever it occurs to you:  npm run backup
//
// Dumps the four tables to a timestamped JSON file and downloads every
// referenced storage object alongside it, into a folder OUTSIDE the repo.

async function main() {
  const supabase = adminClient();
  const dir = path.join(backupRoot(), timestamp());
  const objectsDir = path.join(dir, "objects");
  await fs.mkdir(objectsDir, { recursive: true });

  // 1. Tables.
  const dump: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) throw new Error(`Reading ${table}: ${error.message}`);
    dump[table] = data ?? [];
    console.log(`  ${table}: ${dump[table].length} rows`);
  }
  await fs.writeFile(
    path.join(dir, "data.json"),
    JSON.stringify(dump, null, 2),
    "utf8",
  );

  // 2. Storage objects referenced by items.
  const items = dump.items as { photo_path?: string; thumb_path?: string }[];
  const paths = new Set<string>();
  for (const item of items) {
    if (item.photo_path) paths.add(item.photo_path);
    if (item.thumb_path) paths.add(item.thumb_path);
  }

  let downloaded = 0;
  for (const objPath of paths) {
    const { data, error } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .download(objPath);
    if (error || !data) {
      console.warn(`  ! could not download ${objPath}: ${error?.message}`);
      continue;
    }
    const dest = path.join(objectsDir, objPath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, Buffer.from(await data.arrayBuffer()));
    downloaded++;
  }

  console.log(`  objects: ${downloaded}/${paths.size} downloaded`);
  console.log(`\nBackup written to ${dir}`);
}

main().catch((err) => {
  console.error("Backup failed:", err);
  process.exit(1);
});
