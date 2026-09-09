import {
  getSettings, updateSettings, saveGeneratedContent, getGeneratedHistory, clearGeneratedHistory,
  getGeneratedContentById, getSeoAudit, getLatestAuditRow, getPagesForGeneration,
  saveTagRecommendation, saveImageRecommendation, markRecommendationsGenerated,
} from "./db";
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

// Character-count windows per tag, mirroring RANGES in seo-audit.html
const TAG_RANGES: Record<string, [number, number]> = {
  title: [50, 65], description: [150, 160], h1: [20, 70], h2: [20, 70],
  og_title: [50, 65], og_description: [150, 160], twitter_title: [50, 65], twitter_description: [150, 160],
};

// Recommendation copy generation uses the same GEMINI_API_KEY but a different
// model/endpoint than /api/ai-generate above — gemini-2.5-flash, matching the
// working setup already used for Gemini calls in the crawler-be project.
const RECOMMENDATION_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// Calls Gemini with a JSON response schema and returns the parsed object.
// Throws on any failure — callers decide how to handle a bad page/item.
async function callGeminiJSON(prompt: string, responseSchema: any): Promise<any> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8000,
      responseMimeType: "application/json",
      responseJsonSchema: responseSchema,
    },
  };
  const geminiResponse = await fetch(`${RECOMMENDATION_GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    throw new Error(`Gemini API error: ${errorText.slice(0, 300)}`);
  }
  const geminiData = (await geminiResponse.json()) as GeminiResponse;
  const generatedText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!generatedText) {
    throw new Error("Gemini returned an empty response");
  }
  return JSON.parse(generatedText);
}

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

  // GET /api/seo-audit - Fetch the latest SEO audit dataset (site + pages)
  "GET /api/seo-audit": () => {
    const audit = getSeoAudit();
    if (!audit) {
      return Response.json({ error: "No SEO audit data found" }, { status: 404 });
    }
    return Response.json(audit);
  },

  // POST /api/seo-audit/generate-recommendations - LLM-write replacement copy, once
  "POST /api/seo-audit/generate-recommendations": async () => {
    const audit = getLatestAuditRow();
    if (!audit) {
      return Response.json({ error: "No SEO audit data found" }, { status: 404 });
    }
    if (audit.recommendations_generated_at) {
      return Response.json({
        alreadyGenerated: true,
        recommendations_generated_at: audit.recommendations_generated_at,
      });
    }
    if (!GEMINI_API_KEY) {
      return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const pages = getPagesForGeneration(audit.id);
    let pagesGenerated = 0;
    const pagesFailed: number[] = [];

    for (const page of pages) {
      try {
        const properties: Record<string, any> = {};
        const required: string[] = [];

        for (const tag of page.failingTags) {
          const [lo, hi] = TAG_RANGES[tag.tag_key] || [20, 160];
          properties[tag.tag_key] = {
            type: "string",
            description: `Replacement ${tag.tag_key.replace(/_/g, " ")} in Swedish, ${lo}-${hi} characters, must naturally include one of the target keywords. Current value: ${tag.text ? `"${tag.text}"` : "not set"}.`,
          };
          required.push(tag.tag_key);
        }
        if (page.failingImages.length) {
          properties.images = {
            type: "array",
            description: "One entry per image listed in the prompt, matched by img_id, with Swedish alt text under 100 characters that naturally mentions a target keyword.",
            items: {
              type: "object",
              properties: { img_id: { type: "integer" }, alt_text: { type: "string" } },
              required: ["img_id", "alt_text"],
            },
          };
          required.push("images");
        }

        const keywordList = page.keywords.map((k) => `${k.term} (${k.volume}/mo)`).join(", ");
        const prompt = `You are an SEO copywriter for Sanava, a Swedish skincare brand focused on barrier-support, dermatologically-tested skincare.
Page: ${page.url}
Target keywords for this page: ${keywordList}

Write replacement copy for the fields in the response schema. Rules:
- Swedish only.
- Fit the character range given for each field as closely as possible.
- Naturally include at least one target keyword per field — do not just repeat the keyword, write real sentences.
- Match a premium Swedish skincare brand voice.
${page.failingImages.length ? `\nImages needing alt text:\n${page.failingImages.map((img) => `- img_id ${img.img_id}: ${img.img_url.split("/").pop()}`).join("\n")}` : ""}`;

        const result = await callGeminiJSON(prompt, { type: "object", properties, required });

        for (const tag of page.failingTags) {
          const text = result[tag.tag_key];
          if (typeof text === "string" && text.trim()) {
            saveTagRecommendation(page.pageId, tag.tag_key, text.trim());
          }
        }
        if (Array.isArray(result.images)) {
          for (const img of page.failingImages) {
            const match = result.images.find((r: any) => r.img_id === img.img_id);
            if (match && typeof match.alt_text === "string" && match.alt_text.trim()) {
              saveImageRecommendation(img.id, match.alt_text.trim());
            }
          }
        }
        pagesGenerated++;
      } catch (err) {
        console.error(`Failed to generate recommendations for page ${page.pageId}:`, err);
        pagesFailed.push(page.sourcePageId ?? page.pageId);
      }
    }

    markRecommendationsGenerated(audit.id);

    return Response.json({
      success: true,
      pages_generated: pagesGenerated,
      pages_failed: pagesFailed,
    });
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

};

// Static pages served from the project root
const staticPages: Record<string, string> = {
  "/": "index.html",
  "/index.html": "index.html",
  "/seo-audit": "seo-audit.html",
  "/seo-audit.html": "seo-audit.html",
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

  // Static file serving
  const pageFile = method === "GET" ? staticPages[path] : undefined;
  if (pageFile) {
    const filePath = join(projectRoot, pageFile);
    if (!existsSync(filePath)) {
      return Response.json(
        { error: `${pageFile} not found` },
        { status: 404, headers: corsHeaders }
      );
    }
    return new Response(readFileSync(filePath, "utf-8"), {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
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
  GET    /api/seo-audit    - Get SEO audit dataset (site + pages)
  POST   /api/seo-audit/generate-recommendations - LLM-write replacement copy, once

Pages:
  /                        - CaptionForge
  /seo-audit               - Sanava keyword audit
`);

Bun.serve({
  port: PORT,
  fetch: handleRequest,
});