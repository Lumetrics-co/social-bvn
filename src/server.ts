import { getSettings, updateSettings, saveGeneratedContent, getGeneratedHistory, clearGeneratedHistory, getGeneratedContentById } from "./db";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

const PORT = 3330;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent";

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
  image?: string; // Base64 encoded image with data URL
}

interface AIGenerateRequest {
  context: string;
  image?: string; // Base64 encoded image with data URL
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

// Validation result type
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Required fields in the response
const REQUIRED_FIELDS = ["desc_fb", "desc_ig", "desc_tw", "desc_wa", "desc_li", "desc_yt", "title_yt"];

// Validate Gemini API response structure and content
function validateGeminiResponse(data: any): ValidationResult {
  const errors: string[] = [];

  // Check if data is an object
  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Response is not a valid JSON object"] };
  }

  // Check all required fields exist
  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check field content and type
  for (const field of REQUIRED_FIELDS) {
    const value = data[field];

    // Check if field exists and is a string
    if (!value || typeof value !== "string") {
      errors.push(`Field "${field}" is not a string`);
      continue;
    }

    // Check if field is empty after trimming
    const trimmed = value.trim();
    if (!trimmed) {
      errors.push(`Field "${field}" is empty`);
      continue;
    }

    // Check minimum length (avoid single words or very short content)
    const minLength = field === "title_yt" ? 5 : 20;
    if (trimmed.length < minLength) {
      errors.push(`Field "${field}" is too short (${trimmed.length} chars, minimum ${minLength})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
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
        image: body.image,
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
      const { context, image } = body;

      if (!context) {
        return Response.json({ error: "Context is required" }, { status: 400 });
      }

      if (!GEMINI_API_KEY) {
        return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
      }

      const prompt = `You are a social media content expert. Generate tailored social media content for the following topic/context: "${context}"${image ? "\n\nAnalyze the provided image and use it along with the context to create tailored content." : ""}

Create engaging, platform-specific content for each social media platform.`;

      // Define the JSON schema for structured output
      const responseSchema = {
        type: "object",
        properties: {
          desc_fb: {
            type: "string",
            description: "Facebook post - engaging, community-focused, narrative-driven (100-200 words)"
          },
          desc_ig: {
            type: "string",
            description: "Instagram caption - punchy, visual-first, hook at start, use emojis (50-100 words)"
          },
          desc_tw: {
            type: "string",
            description: "Twitter/X tweet - concise and engaging, max 280 chars with hashtags"
          },
          desc_wa: {
            type: "string",
            description: "WhatsApp channel message - conversational and personal tone (50-100 words)"
          },
          desc_li: {
            type: "string",
            description: "LinkedIn post - professional, insight-driven, strong call to action (100-150 words)"
          },
          desc_yt: {
            type: "string",
            description: "YouTube description - detailed, informative, include timestamps (150-250 words)"
          },
          title_yt: {
            type: "string",
            description: "YouTube video title - compelling, SEO-optimized, power words (50-70 chars)"
          }
        },
        required: ["desc_fb", "desc_ig", "desc_tw", "desc_wa", "desc_li", "desc_yt", "title_yt"]
      };

      // Build the parts array with text and optional image
      const parts: any[] = [{ text: prompt }];

      if (image) {
        // Extract MIME type and base64 data from data URL
        const matches = image.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const mimeType = matches[1];
          const base64Data = matches[2];

          // DEBUG: Log base64 data info
          console.log("=== BASE64 DEBUG ===");
          console.log("MIME Type:", mimeType);
          console.log("Base64 length:", base64Data.length);
          console.log("Contains newlines:", base64Data.includes('\n'));
          console.log("Contains carriage returns:", base64Data.includes('\r'));
          console.log("Base64 sample (first 100 chars):", base64Data.slice(0, 100));
          console.log("Base64 sample (last 100 chars):", base64Data.slice(-100));
          console.log("===================");

          parts.push({
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          });
        }
      }

      // TEMPORARILY COMMENTED OUT FOR DEBUGGING
      const requestBody = {
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 80000,
          responseMimeType: "application/json",
          responseJsonSchema: responseSchema,
        },
      };

      // console.log("Request body that will be sent to Gemini:", JSON.stringify(requestBody, null, 2));

      const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error("Gemini API error:", errorText);
        return Response.json({ error: "Failed to generate content with AI" }, { status: 500 });
      }

      // Get raw response text first to check if it's complete
      const rawResponseText = await geminiResponse.text();
      console.log("Raw response from fetch - length:", rawResponseText.length);
      console.log("Raw response - first 300 chars:", rawResponseText.substring(0, 300));

      let geminiData: GeminiResponse;
      try {
        geminiData = JSON.parse(rawResponseText);
      } catch (e) {
        console.error("Failed to parse Gemini response:", e);
        return Response.json({ error: "Failed to parse Gemini response" }, { status: 500 });
      }

      // Extract the generated text from Gemini response
      const generatedText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!generatedText) {
        return Response.json(
          { error: "AI service returned empty response. Please try again." },
          { status: 500 }
        );
      }

      console.log("=== GEMINI RESPONSE DEBUG ===");
      console.log("Response type:", typeof generatedText);
      console.log("Response length:", generatedText.length);
      console.log("First 200 chars:", generatedText.substring(0, 200));
      console.log("Last 200 chars:", generatedText.substring(generatedText.length - 200));
      console.log("Full raw response:", generatedText);
      console.log("=============================");

      // Parse the JSON response - should be valid JSON now with structured output
      let content;
      try {
        content = JSON.parse(generatedText);
        console.log("✓ Successfully parsed JSON");
        console.log("Parsed keys:", Object.keys(content));
      } catch (parseError) {
        console.error("✗ Failed to parse AI response");
        console.error("Parse error:", parseError);
        console.error("Attempted to parse:", generatedText.substring(0, 500));
        return Response.json(
          { error: `Invalid JSON format from AI: ${parseError instanceof Error ? parseError.message : "Unknown error"}` },
          { status: 500 }
        );
      }

      // Validate the response structure and content
      const validation = validateGeminiResponse(content);
      if (!validation.valid) {
        console.error("AI response validation failed:", validation.errors);
        const errorMsg =
          validation.errors.length === 1
            ? validation.errors[0]
            : `AI generated incomplete content: ${validation.errors.slice(0, 2).join(", ")}`;
        return Response.json({ error: errorMsg }, { status: 500 });
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

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// Handle incoming requests
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;
  const path = url.pathname;

  // Handle CORS preflight requests
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

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
      const response = await handler(req);
      // Add CORS headers to response
      const headers = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return Response.json(
      { error: "Endpoint not found", path: apiKey },
      { status: 404, headers: corsHeaders }
    );
  }

  // Static file serving for root
  if (method === "GET" && (path === "/" || path === "/index.html")) {
    const response = router["GET /"]!(req);
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  // 404 for unknown routes
  return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
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