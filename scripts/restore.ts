import fs from "node:fs/promises";
import path from "node:path";
import { adminClient, backupRoot, PHOTOS_BUCKET, TABLES } from "./lib";

// Restore from a backup (plan section 4). A backup that's never been restored
// isn't known to work.
//
//   npm run restore                  # restores the most recent backup
//   npm run restore -- <folder>      # restores a specific backup folder
//
// Tables are upserted by id in dependency order; storage objects are re-uploaded.

async function resolveDir(): Promise<string> {
  const arg = process.argv[2];
  if (arg) return path.resolve(process.cwd(), arg);

  const root = backupRoot();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  if (dirs.length === 0) throw new Error(`No backups found in ${root}`);
  return path.join(root, dirs[dirs.length - 1]); // latest by timestamped name
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function recurse(current: string) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) await recurse(full);
      else out.push(full);
    }
  }
  await recurse(dir);
  return out;
}

async function main() {
  const dir = await resolveDir();
  console.log(`Restoring from ${dir}`);
  const supabase = adminClient();

  // 1. Tables, in dependency order (collections/categories before items before
  //    sources). TABLES is already in that order.
  const raw = await fs.readFile(path.join(dir, "data.json"), "utf8");
  const dump = JSON.parse(raw) as Record<string, unknown[]>;

  for (const table of TABLES) {
    const rows = dump[table] ?? [];
    if (rows.length === 0) {
      console.log(`  ${table}: nothing to restore`);
      continue;
    }
    const { error } = await supabase
      .from(table)
      .upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`Restoring ${table}: ${error.message}`);
    console.log(`  ${table}: ${rows.length} rows upserted`);
  }

  // 2. Storage objects.
  const objectsDir = path.join(dir, "objects");
  const files = await walk(objectsDir);
  let uploaded = 0;
  for (const file of files) {
    const objPath = path.relative(objectsDir, file).split(path.sep).join("/");
    const body = await fs.readFile(file);
    const { error } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .upload(objPath, body, { contentType: "image/webp", upsert: true });
    if (error) {
      console.warn(`  ! could not upload ${objPath}: ${error.message}`);
      continue;
    }
    uploaded++;
  }
  console.log(`  objects: ${uploaded}/${files.length} uploaded`);
  console.log("\nRestore complete.");
}

main().catch((err) => {
  console.error("Restore failed:", err);
  process.exit(1);
});
