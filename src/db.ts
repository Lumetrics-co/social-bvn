import { Database } from "bun:sqlite";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database file path (in project root)
const dbPath = join(__dirname, "..", "database.sqlite");

const db = new Database(dbPath);

// Create tables
db.exec(`
  -- Settings table (singleton - always id=1)
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    boilerplate TEXT DEFAULT '',
    tags_fb TEXT DEFAULT '',
    tags_ig TEXT DEFAULT '',
    tags_tw TEXT DEFAULT '',
    tags_wa TEXT DEFAULT '',
    tags_li TEXT DEFAULT '',
    tags_yt TEXT DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Generated content history
  CREATE TABLE IF NOT EXISTS generated_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_fb TEXT,
    content_ig TEXT,
    content_tw TEXT,
    content_wa TEXT,
    content_li TEXT,
    content_yt TEXT,
    title_yt TEXT,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add image column if it doesn't exist (migration for existing databases)
try {
  db.query("SELECT image FROM generated_content LIMIT 1").all();
} catch {
  console.log("Adding image column to generated_content table...");
  db.exec("ALTER TABLE generated_content ADD COLUMN image TEXT;");
}

// Initialize settings row if not exists
db.exec(`
  INSERT OR IGNORE INTO settings (id, boilerplate, tags_fb, tags_ig, tags_tw, tags_wa, tags_li, tags_yt)
  VALUES (1, '', '', '', '', '', '', '')
`);

// Settings queries
export const getSettings = () => {
  return db.query("SELECT * FROM settings WHERE id = 1").get();
};

export const updateSettings = (data: {
  boilerplate?: string;
  tags_fb?: string;
  tags_ig?: string;
  tags_tw?: string;
  tags_wa?: string;
  tags_li?: string;
  tags_yt?: string;
}) => {
  const fields: string[] = [];
  const values: any[] = [];

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  });

  if (fields.length === 0) return getSettings();

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(1); // for WHERE id = 1

  const query = `UPDATE settings SET ${fields.join(", ")} WHERE id = ?`;
  db.query(query).run(...values);

  return getSettings();
};

// Generated content queries
export const saveGeneratedContent = (data: {
  content_fb?: string;
  content_ig?: string;
  content_tw?: string;
  content_wa?: string;
  content_li?: string;
  content_yt?: string;
  title_yt?: string;
  image?: string;
}) => {
  const stmt = db.query(`
    INSERT INTO generated_content (
      content_fb, content_ig, content_tw, content_wa, content_li, content_yt, title_yt, image
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.content_fb || "",
    data.content_ig || "",
    data.content_tw || "",
    data.content_wa || "",
    data.content_li || "",
    data.content_yt || "",
    data.title_yt || "",
    data.image || null
  );

  const lastId = db.query("SELECT last_insert_rowid() as id").get() as { id: number };
  return db.query("SELECT * FROM generated_content WHERE id = ?").get(lastId.id);
};

export const getGeneratedContentById = (id: number) => {
  return db.query("SELECT * FROM generated_content WHERE id = ?").get(id);
};

export const getGeneratedHistory = (limit = 50) => {
  return db.query("SELECT * FROM generated_content ORDER BY created_at DESC LIMIT ?").all(limit);
};

export const clearGeneratedHistory = () => {
  db.query("DELETE FROM generated_content").run();
};

export default db;
