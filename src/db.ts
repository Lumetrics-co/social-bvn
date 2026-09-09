import { Database } from "bun:sqlite";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database file path (in project root)
const dbPath = join(__dirname, "..", "database.sqlite");

const db = new Database(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

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

// SEO audit tables
db.exec(`
  -- One row per audit run (site-level metadata). Not a hard singleton like
  -- "settings" -- getSeoAudit() always reads the most recently inserted row,
  -- so a future re-audit is just another insert, no migration needed.
  CREATE TABLE IF NOT EXISTS seo_audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_date TEXT,
    domain TEXT,
    market TEXT,
    country TEXT,
    language TEXT,
    storefront_url TEXT,
    platform TEXT,
    pages_crawled INTEGER,
    pages_indexable INTEGER,
    keyword_clusters INTEGER,
    keywords_audited INTEGER,
    total_monthly_search_volume INTEGER,
    sitewide_findings_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- "priority_order": ordered, individually resolvable top-level fixes
  CREATE TABLE IF NOT EXISTS seo_priority_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_id INTEGER NOT NULL REFERENCES seo_audits(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    text TEXT NOT NULL,
    resolved_at DATETIME
  );

  -- One row per page-or-content-gap entry in DATA.pages
  CREATE TABLE IF NOT EXISTS seo_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_id INTEGER NOT NULL REFERENCES seo_audits(id) ON DELETE CASCADE,
    source_page_id INTEGER,
    position INTEGER NOT NULL,
    keyword_cluster TEXT,
    search_intent TEXT,
    page_type TEXT,
    url TEXT NOT NULL DEFAULT '',
    page_match_rationale TEXT,
    page_status TEXT,
    word_count INTEGER,
    first_100_words_paragraph TEXT,
    first_100_words_sample TEXT,
    all_h1_count INTEGER,
    og_image INTEGER,
    twitter_image INTEGER,
    twitter_card TEXT,
    canonical TEXT,
    canonical_self_referencing INTEGER,
    hreflang_tags INTEGER,
    mobile_friendly INTEGER,
    page_speed_json TEXT,
    has_404_errors INTEGER,
    has_broken_links INTEGER,
    has_redirects INTEGER,
    has_duplicate_content INTEGER,
    has_structured_data_errors INTEGER,
    internal_links INTEGER,
    external_links INTEGER,
    recommended_url TEXT,
    closest_existing_pages_json TEXT,
    secondary_url TEXT,
    secondary_url_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_seo_pages_audit ON seo_pages(audit_id);

  -- The global keyword index the whole audit UI is built from
  CREATE TABLE IF NOT EXISTS seo_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL REFERENCES seo_pages(id) ON DELETE CASCADE,
    term TEXT NOT NULL,
    search_volume INTEGER NOT NULL DEFAULT 0,
    position INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(page_id, term)
  );
  CREATE INDEX IF NOT EXISTS idx_seo_keywords_page ON seo_keywords(page_id);
  CREATE INDEX IF NOT EXISTS idx_seo_keywords_term ON seo_keywords(term);

  -- title/description/h1/h2/og_title/og_description/twitter_title/twitter_description
  -- are identically shaped -- one row per (page, tag_key) instead of 8 sets of
  -- near-duplicate columns.
  CREATE TABLE IF NOT EXISTS seo_page_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL REFERENCES seo_pages(id) ON DELETE CASCADE,
    tag_key TEXT NOT NULL CHECK (tag_key IN (
      'title','description','h1','h2','og_title','og_description',
      'twitter_title','twitter_description'
    )),
    text TEXT,
    length INTEGER,
    keyword_in_tag INTEGER,
    matched_keywords_json TEXT,
    length_in_range INTEGER,
    status TEXT,
    rule_text TEXT,
    UNIQUE(page_id, tag_key)
  );
  CREATE INDEX IF NOT EXISTS idx_seo_page_tags_page ON seo_page_tags(page_id);

  -- all_h2: every H2 on the page (distinct from the "first H2" row above)
  CREATE TABLE IF NOT EXISTS seo_page_h2s (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL REFERENCES seo_pages(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    text TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_seo_page_h2s_page ON seo_page_h2s(page_id);

  -- img_alts
  CREATE TABLE IF NOT EXISTS seo_page_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL REFERENCES seo_pages(id) ON DELETE CASCADE,
    img_id INTEGER,
    alt_text TEXT,
    keyword_in_alt_text INTEGER,
    alt_text_rule TEXT,
    status TEXT,
    img_url TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_seo_page_images_page ON seo_page_images(page_id);

  -- list_of_schema_markups
  CREATE TABLE IF NOT EXISTS seo_page_schema_markups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL REFERENCES seo_pages(id) ON DELETE CASCADE,
    position INTEGER,
    schema_type TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_seo_page_schema_page ON seo_page_schema_markups(page_id);

  -- issues found on the page
  CREATE TABLE IF NOT EXISTS seo_page_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL REFERENCES seo_pages(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    text TEXT NOT NULL,
    resolved_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_seo_page_issues_page ON seo_page_issues(page_id);

  -- ranked recommendations; first 3 shown by default in the UI
  CREATE TABLE IF NOT EXISTS seo_page_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL REFERENCES seo_pages(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    text TEXT NOT NULL,
    resolved_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_seo_page_recs_page ON seo_page_recommendations(page_id);
`);

// Migrations for LLM-generated recommendation copy (added after the initial SEO schema)
try {
  db.query("SELECT recommended_text FROM seo_page_tags LIMIT 1").all();
} catch {
  console.log("Adding recommended_text column to seo_page_tags...");
  db.exec("ALTER TABLE seo_page_tags ADD COLUMN recommended_text TEXT;");
}
try {
  db.query("SELECT recommended_alt_text FROM seo_page_images LIMIT 1").all();
} catch {
  console.log("Adding recommended_alt_text column to seo_page_images...");
  db.exec("ALTER TABLE seo_page_images ADD COLUMN recommended_alt_text TEXT;");
}
try {
  db.query("SELECT recommendations_generated_at FROM seo_audits LIMIT 1").all();
} catch {
  console.log("Adding recommendations_generated_at column to seo_audits...");
  db.exec("ALTER TABLE seo_audits ADD COLUMN recommendations_generated_at DATETIME;");
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

// SEO audit queries
const TAG_KEYS = [
  "title", "description", "h1", "h2",
  "og_title", "og_description", "twitter_title", "twitter_description",
] as const;

const toIntFlag = (v: any): number | null =>
  v === null || v === undefined ? null : (v ? 1 : 0);
const toBoolFlag = (v: any): boolean | null =>
  v === null || v === undefined ? null : !!v;

export function importSeoAudit(json: { site: any; pages: any[] }) {
  const run = db.transaction((data: { site: any; pages: any[] }) => {
    const site = data.site;
    db.query(`
      INSERT INTO seo_audits (
        audit_date, domain, market, country, language, storefront_url, platform,
        pages_crawled, pages_indexable, keyword_clusters, keywords_audited,
        total_monthly_search_volume, sitewide_findings_json, recommendations_generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      site.audit_date ?? null, site.domain ?? null, site.market ?? null, site.country ?? null,
      site.language ?? null, site.storefront_url ?? null, site.platform ?? null,
      site.pages_crawled ?? null, site.pages_indexable ?? null, site.keyword_clusters ?? null,
      site.keywords_audited ?? null, site.total_monthly_search_volume ?? null,
      JSON.stringify(site.sitewide_findings || {}), site.recommendations_generated_at ?? null
    );
    const auditId = (db.query("SELECT last_insert_rowid() as id").get() as { id: number }).id;

    (site.priority_order || []).forEach((text: string, i: number) => {
      db.query("INSERT INTO seo_priority_items (audit_id, position, text) VALUES (?, ?, ?)")
        .run(auditId, i, text);
    });

    (data.pages || []).forEach((page: any, pageIndex: number) => {
      db.query(`
        INSERT INTO seo_pages (
          audit_id, source_page_id, position, keyword_cluster, search_intent, page_type, url,
          page_match_rationale, page_status, word_count, first_100_words_paragraph,
          first_100_words_sample, all_h1_count, og_image, twitter_image, twitter_card,
          canonical, canonical_self_referencing, hreflang_tags, mobile_friendly, page_speed_json,
          has_404_errors, has_broken_links, has_redirects, has_duplicate_content,
          has_structured_data_errors, internal_links, external_links, recommended_url,
          closest_existing_pages_json, secondary_url, secondary_url_note
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        auditId, page.id ?? null, pageIndex, page.keyword_cluster ?? null,
        page.search_intent ?? null, page.page_type ?? null, page.url || "",
        page.page_match_rationale ?? null, page.page_status ?? null, page.word_count ?? null,
        page.first_100_words_paragraph ?? null, page.first_100_words_sample ?? null,
        page.all_h1_count ?? null, toIntFlag(page.og_image), toIntFlag(page.twitter_image),
        page.twitter_card ?? null, page.canonical ?? null, toIntFlag(page.canonical_self_referencing),
        page.hreflang_tags ?? null, toIntFlag(page.mobile_friendly),
        page.page_speed ? JSON.stringify(page.page_speed) : null,
        toIntFlag(page["404_errors"]), toIntFlag(page.broken_links), toIntFlag(page.redirects),
        toIntFlag(page.duplicate_content), toIntFlag(page.structured_data_errors),
        page.internal_links ?? null, page.external_links ?? null, page.recommended_url ?? null,
        page.closest_existing_pages ? JSON.stringify(page.closest_existing_pages) : null,
        page.secondary_url ?? null, page.secondary_url_note ?? null
      );
      const pageId = (db.query("SELECT last_insert_rowid() as id").get() as { id: number }).id;

      (page.keywords || []).forEach((k: any, i: number) => {
        db.query("INSERT OR IGNORE INTO seo_keywords (page_id, term, search_volume, position) VALUES (?, ?, ?, ?)")
          .run(pageId, k.term, k.search_volume, i);
      });

      TAG_KEYS.forEach((key) => {
        const tag = page[key];
        if (!tag) return; // content-gap pages: tag objects are null
        db.query(`
          INSERT INTO seo_page_tags
            (page_id, tag_key, text, length, keyword_in_tag, matched_keywords_json, length_in_range, status, rule_text, recommended_text)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          pageId, key, tag.text ?? null, tag.length ?? null,
          toIntFlag(tag[`keyword_in_${key}`]), JSON.stringify(tag.matched_keywords || []),
          toIntFlag(tag.length_in_range), tag.status ?? null, tag[`${key}_rule`] ?? null,
          tag.recommended_text ?? null
        );
      });

      (page.all_h2 || []).forEach((text: string, i: number) => {
        db.query("INSERT INTO seo_page_h2s (page_id, position, text) VALUES (?, ?, ?)").run(pageId, i, text);
      });

      (page.img_alts || []).forEach((img: any) => {
        db.query(`
          INSERT INTO seo_page_images (page_id, img_id, alt_text, keyword_in_alt_text, alt_text_rule, status, img_url, recommended_alt_text)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          pageId, img.img_id ?? null, img.alt_text ?? "", toIntFlag(img.keyword_in_alt_text),
          img.alt_text_rule ?? null, img.status ?? null, img.img_url ?? null,
          img.recommended_alt_text ?? null
        );
      });

      (page.list_of_schema_markups || []).forEach((s: any, i: number) => {
        db.query("INSERT INTO seo_page_schema_markups (page_id, position, schema_type) VALUES (?, ?, ?)")
          .run(pageId, i, s.schema_type);
      });

      (page.issues || []).forEach((text: string, i: number) => {
        db.query("INSERT INTO seo_page_issues (page_id, position, text) VALUES (?, ?, ?)").run(pageId, i, text);
      });

      (page.recommendations || []).forEach((text: string, i: number) => {
        db.query("INSERT INTO seo_page_recommendations (page_id, position, text) VALUES (?, ?, ?)").run(pageId, i, text);
      });
    });

    return auditId;
  });

  return run(json);
}

function buildSeoPage(p: any) {
  const keywords = (db.query(
    "SELECT term, search_volume FROM seo_keywords WHERE page_id = ? ORDER BY position ASC"
  ).all(p.id) as any[]).map((k) => ({ term: k.term, search_volume: k.search_volume }));

  const tagRows = db.query("SELECT * FROM seo_page_tags WHERE page_id = ?").all(p.id) as any[];
  const tagByKey: Record<string, any> = {};
  tagRows.forEach((t) => (tagByKey[t.tag_key] = t));

  const tags: Record<string, any> = {};
  for (const key of TAG_KEYS) {
    const t = tagByKey[key];
    tags[key] = t ? {
      text: t.text,
      length: t.length,
      [`keyword_in_${key}`]: toBoolFlag(t.keyword_in_tag),
      matched_keywords: JSON.parse(t.matched_keywords_json || "[]"),
      length_in_range: toBoolFlag(t.length_in_range),
      status: t.status,
      [`${key}_rule`]: t.rule_text,
      recommended_text: t.recommended_text ?? null,
    } : null;
  }

  const all_h2 = (db.query(
    "SELECT text FROM seo_page_h2s WHERE page_id = ? ORDER BY position ASC"
  ).all(p.id) as any[]).map((r) => r.text);

  const img_alts = (db.query(
    "SELECT img_id, alt_text, keyword_in_alt_text, alt_text_rule, status, img_url, recommended_alt_text FROM seo_page_images WHERE page_id = ? ORDER BY id ASC"
  ).all(p.id) as any[]).map((r) => ({
    img_id: r.img_id, alt_text: r.alt_text, keyword_in_alt_text: toBoolFlag(r.keyword_in_alt_text),
    alt_text_rule: r.alt_text_rule, status: r.status, img_url: r.img_url,
    recommended_alt_text: r.recommended_alt_text ?? null,
  }));

  const list_of_schema_markups = (db.query(
    "SELECT schema_type FROM seo_page_schema_markups WHERE page_id = ? ORDER BY position ASC"
  ).all(p.id) as any[]).map((r) => ({ schema_type: r.schema_type }));

  const issues = (db.query(
    "SELECT text FROM seo_page_issues WHERE page_id = ? AND resolved_at IS NULL ORDER BY position ASC"
  ).all(p.id) as any[]).map((r) => r.text);

  const recommendations = (db.query(
    "SELECT text FROM seo_page_recommendations WHERE page_id = ? AND resolved_at IS NULL ORDER BY position ASC"
  ).all(p.id) as any[]).map((r) => r.text);

  return {
    id: p.source_page_id,
    keyword_cluster: p.keyword_cluster,
    search_intent: p.search_intent,
    page_type: p.page_type,
    url: p.url,
    page_match_rationale: p.page_match_rationale,
    page_status: p.page_status,
    word_count: p.word_count,
    first_100_words_paragraph: p.first_100_words_paragraph,
    first_100_words_sample: p.first_100_words_sample,
    keywords,
    ...tags,
    all_h1_count: p.all_h1_count,
    all_h2,
    og_image: toBoolFlag(p.og_image),
    twitter_image: toBoolFlag(p.twitter_image),
    twitter_card: p.twitter_card,
    canonical: p.canonical,
    canonical_self_referencing: toBoolFlag(p.canonical_self_referencing),
    hreflang_tags: p.hreflang_tags,
    img_alts,
    list_of_schema_markups,
    mobile_friendly: toBoolFlag(p.mobile_friendly),
    page_speed: p.page_speed_json ? JSON.parse(p.page_speed_json) : null,
    "404_errors": toBoolFlag(p.has_404_errors),
    broken_links: toBoolFlag(p.has_broken_links),
    redirects: toBoolFlag(p.has_redirects),
    duplicate_content: toBoolFlag(p.has_duplicate_content),
    structured_data_errors: toBoolFlag(p.has_structured_data_errors),
    internal_links: p.internal_links,
    external_links: p.external_links,
    issues,
    recommendations,
    recommended_url: p.recommended_url,
    closest_existing_pages: p.closest_existing_pages_json ? JSON.parse(p.closest_existing_pages_json) : undefined,
    secondary_url: p.secondary_url,
    secondary_url_note: p.secondary_url_note,
  };
}

export function getSeoAudit() {
  const audit = db.query("SELECT * FROM seo_audits ORDER BY id DESC LIMIT 1").get() as any;
  if (!audit) return null;

  const priority = (db.query(
    "SELECT text FROM seo_priority_items WHERE audit_id = ? AND resolved_at IS NULL ORDER BY position ASC"
  ).all(audit.id) as any[]).map((r) => r.text);

  const site = {
    audit_date: audit.audit_date,
    domain: audit.domain,
    market: audit.market,
    country: audit.country,
    language: audit.language,
    storefront_url: audit.storefront_url,
    platform: audit.platform,
    pages_crawled: audit.pages_crawled,
    pages_indexable: audit.pages_indexable,
    keyword_clusters: audit.keyword_clusters,
    keywords_audited: audit.keywords_audited,
    total_monthly_search_volume: audit.total_monthly_search_volume,
    sitewide_findings: JSON.parse(audit.sitewide_findings_json || "{}"),
    priority_order: priority,
    recommendations_generated_at: audit.recommendations_generated_at,
  };

  const pages = (db.query(
    "SELECT * FROM seo_pages WHERE audit_id = ? ORDER BY position ASC"
  ).all(audit.id) as any[]).map(buildSeoPage);

  return { site, pages };
}

// --- LLM recommendation generation -----------------------------------------

export function getLatestAuditRow() {
  return db.query(
    "SELECT id, recommendations_generated_at FROM seo_audits ORDER BY id DESC LIMIT 1"
  ).get() as { id: number; recommendations_generated_at: string | null } | undefined;
}

// Pages + only the tags/images that still need generated copy, keyed by the
// internal page_id (not source_page_id) so callers can write results back.
export function getPagesForGeneration(auditId: number) {
  const pages = db.query(
    "SELECT id, source_page_id, url FROM seo_pages WHERE audit_id = ? AND url != '' ORDER BY position ASC"
  ).all(auditId) as any[];

  return pages
    .map((p) => {
      const keywords = (db.query(
        "SELECT term, search_volume FROM seo_keywords WHERE page_id = ? ORDER BY position ASC"
      ).all(p.id) as any[]).map((k) => ({ term: k.term as string, volume: k.search_volume as number }));

      const failingTags = db.query(
        "SELECT tag_key, text, length, status, rule_text FROM seo_page_tags WHERE page_id = ? AND status != 'pass' AND recommended_text IS NULL"
      ).all(p.id) as { tag_key: string; text: string | null; length: number | null; status: string; rule_text: string | null }[];

      const failingImages = db.query(
        "SELECT id, img_id, img_url, alt_text, status FROM seo_page_images WHERE page_id = ? AND status != 'pass' AND recommended_alt_text IS NULL"
      ).all(p.id) as { id: number; img_id: number; img_url: string; alt_text: string | null; status: string }[];

      return { pageId: p.id as number, sourcePageId: p.source_page_id as number, url: p.url as string, keywords, failingTags, failingImages };
    })
    .filter((p) => p.failingTags.length || p.failingImages.length);
}

export function saveTagRecommendation(pageId: number, tagKey: string, text: string) {
  db.query("UPDATE seo_page_tags SET recommended_text = ? WHERE page_id = ? AND tag_key = ?").run(text, pageId, tagKey);
}

export function saveImageRecommendation(imageRowId: number, text: string) {
  db.query("UPDATE seo_page_images SET recommended_alt_text = ? WHERE id = ?").run(text, imageRowId);
}

export function markRecommendationsGenerated(auditId: number) {
  db.query("UPDATE seo_audits SET recommendations_generated_at = CURRENT_TIMESTAMP WHERE id = ?").run(auditId);
}

// Wipes all SEO audit data (cascades to pages/keywords/tags/images/etc. via
// ON DELETE CASCADE). Used by the seed script's --force flag to re-import
// cleanly rather than accumulating duplicate audit rows.
export function clearSeoData() {
  db.query("DELETE FROM seo_audits").run();
}

// Seed SEO audit data once, the first time this table is empty (mirrors the
// settings singleton-init pattern above). database.sqlite is gitignored, so
// this runs on every fresh checkout/deploy.
const seoAuditCount = (db.query("SELECT COUNT(*) as c FROM seo_audits").get() as { c: number }).c;
if (seoAuditCount === 0) {
  const seedPath = join(__dirname, "..", "seed", "seo-audit.json");
  if (existsSync(seedPath)) {
    try {
      const seedJson = JSON.parse(readFileSync(seedPath, "utf-8"));
      importSeoAudit(seedJson);
      console.log("Seeded seo_audits from seed/seo-audit.json");
    } catch (e) {
      console.error("Failed to seed SEO audit data:", e);
    }
  } else {
    console.warn("seed/seo-audit.json not found — /api/seo-audit will 404 until seeded");
  }
}

export default db;
