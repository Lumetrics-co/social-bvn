import { getSettings, updateSettings, saveGeneratedContent, getGeneratedHistory, clearGeneratedHistory, getGeneratedContentById } from "./db";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

const PORT = 3330;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

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

interface AIGenerateRequest {
  context: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

// Simple router
const router: Record<string, (req: Request) => Response | Promise<Response>> = {
  // GET /api/settings - Fetch current settings
  "GET /api/settings": () => {
    const settings = getSettings() as SettingsData;
    return Response.json(settings);
  },

  // PUT /api/settings - Save/update settings
  "PUT /api/settings": async (req: Request) => {
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
  "POST /api/generate": async (req: Request) => {
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

  // GET /api/history/:id - Fetch specific content by ID
  "GET /api/history/:id": (req: Request) => {
    const url = new URL(req.url);
    const idStr = url.pathname.split("/").pop();
    
    if (!idStr) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }
    
    const id = parseInt(idStr);
    
    if (isNaN(id)) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }
    
    const content = getGeneratedContentById(id);
    
    if (!content) {
      return Response.json({ error: "Content not found" }, { status: 404 });
    }
    
    return Response.json(content);
  },

  // DELETE /api/history - Clear generation history
  "DELETE /api/history": () => {
    clearGeneratedHistory();
    return Response.json({ success: true });
  },

  // POST /api/ai-generate - Generate content using Gemini AI
  "POST /api/ai-generate": async (req: Request) => {
    try {
      const body = (await req.json()) as AIGenerateRequest;
      const { context } = body;
      
      if (!context) {
        return Response.json({ error: "Context is required" }, { status: 400 });
      }

      if (!GEMINI_API_KEY) {
        return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
      }

      const prompt = `Generate social media content for the following topic/context: "${context}"

Return a JSON object with the following fields:
{
  "desc_fb": "Facebook post - engaging, community-focused, can be longer (100-200 words)",
  "desc_ig": "Instagram caption - punchy, visual-first, use emojis, lead with hook (50-100 words)",
  "desc_tw": "Twitter/X tweet - very short, punchy, max 280 chars with hashtags",
  "desc_wa": "WhatsApp channel message - conversational, personal, like texting a friend (50-100 words)",
  "desc_li": "LinkedIn post - professional, insight-driven, strong hook, call to action (100-150 words)",
  "desc_yt": "YouTube description - detailed, include timestamps format, links, video summary (150-250 words)",
  "title_yt": "YouTube video title - compelling, SEO-friendly, use numbers or power words (50-70 chars)"
}

Only return valid JSON, no other text.`;

      const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
        }),
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error("Gemini API error:", errorText);
        return Response.json({ error: "Failed to generate content with AI" }, { status: 500 });
      }

      const geminiData = (await geminiResponse.json()) as GeminiResponse;
      
      // Extract the generated text from Gemini response
      const generatedText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!generatedText) {
        return Response.json({ error: "No content generated from AI" }, { status: 500 });
      }

      // Parse the JSON response
      let content;
      try {
        // Try to extract JSON from the response (in case it includes markdown code blocks)
        const jsonMatch = generatedText.match(/```json\n([\s\S]*?)\n```/) || 
                          generatedText.match(/```\n([\s\S]*?)\n```/) ||
                          [null, generatedText];
        content = JSON.parse(jsonMatch[1]);
      } catch (parseError) {
        console.error("Failed to parse AI response:", generatedText);
        return Response.json({ error: "Failed to parse AI response" }, { status: 500 });
      }

      return Response.json(content);
    } catch (error) {
      console.error("AI generation error:", error);
      return Response.json({ error: "Failed to generate content" }, { status: 500 });
    }
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
    // Check for exact match first
    let handler = router[apiKey];
    
    // Check for dynamic route: GET /api/history/:id
    if (!handler && method === "GET" && path.startsWith("/api/history/")) {
      const idStr = path.split("/").pop();
      if (idStr) {
        const id = parseInt(idStr);
        if (!isNaN(id)) {
          handler = router["GET /api/history/:id"];
        }
      }
    }
    
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
  POST   /api/ai-generate  - Generate content with AI (Gemini)
`);

Bun.serve({
  port: PORT,
  fetch: handleRequest,
});