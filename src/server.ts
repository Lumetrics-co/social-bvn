import { getSettings, updateSettings, saveGeneratedContent, getGeneratedHistory, clearGeneratedHistory } from "./db";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

const PORT = 3330;

// Type definitions
interface SettingsData {
  boilerplate?: string;
  tags_fb?: string;
  tags_ig?: string;
  tags_tw?: string;
  tags_wa?: string;
  tags_li?: string;
  tags_yt?: string;
}

interface GenerateData {
  content_fb?: string;
  content_ig?: string;
  content_tw?: string;
  content_wa?: string;
  content_li?: string;
  content_yt?: string;
  title_yt?: string;
}

// Simple router
const router: Record<string, (req: Request) => Response | Promise<Response>> = {
  // GET /api/settings - Fetch current settings
  "GET /api/settings": () => {
    const settings = getSettings() as SettingsData;
    return Response.json(settings);
  },

  // PUT /api/settings - Save/update settings
  "PUT /api/settings": async (req) => {
    try {
      const body = (await req.json()) as SettingsData;
      const settings = updateSettings(body);
      return Response.json(settings);
    } catch (error) {
      return Response.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }
  },

  // POST /api/generate - Save generated content
  "POST /api/generate": async (req) => {
    try {
      const body = (await req.json()) as GenerateData;
      const result = saveGeneratedContent({
        content_fb: body.content_fb,
        content_ig: body.content_ig,
        content_tw: body.content_tw,
        content_wa: body.content_wa,
        content_li: body.content_li,
        content_yt: body.content_yt,
        title_yt: body.title_yt,
      });
      return Response.json(result);
    } catch (error) {
      return Response.json(
        { error: "Failed to save generated content" },
        { status: 500 }
      );
    }
  },

  // GET /api/history - Fetch generation history
  "GET /api/history": () => {
    const history = getGeneratedHistory(50);
    return Response.json(history);
  },

  // DELETE /api/history - Clear generation history
  "DELETE /api/history": () => {
    clearGeneratedHistory();
    return Response.json({ success: true });
  },

  // Serve static files (index.html for /)
  "GET /": () => {
    const indexPath = join(projectRoot, "index.html");
    if (existsSync(indexPath)) {
      const content = readFileSync(indexPath, "utf-8");
      return new Response(content, {
        headers: { "Content-Type": "text/html" },
      });
    }
    return Response.json({ error: "index.html not found" }, { status: 404 });
  },
};

// Handle incoming requests
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;
  const path = url.pathname;

  // API routes
  const apiKey = `${method} ${path}`;
  
  if (path.startsWith("/api/")) {
    const handler = router[apiKey];
    if (handler) {
      return handler(req);
    }
    return Response.json(
      { error: "Endpoint not found", path: apiKey },
      { status: 404 }
    );
  }

  // Static file serving for root
  if (method === "GET" && (path === "/" || path === "/index.html")) {
    return router["GET /"]!(req);
  }

  // 404 for unknown routes
  return Response.json({ error: "Not found" }, { status: 404 });
}

// Start server
console.log(`🚀 Server running at http://localhost:${PORT}`);
console.log(`📁 Serving frontend from: ${projectRoot}`);
console.log(`
API Endpoints:
  GET    /api/settings      - Get saved boilerplate & tags
  PUT    /api/settings     - Save boilerplate & tags
  POST   /api/generate     - Save generated content
  GET    /api/history      - Get generation history
  DELETE /api/history      - Clear generation history
`);

Bun.serve({
  port: PORT,
  fetch: handleRequest,
});
