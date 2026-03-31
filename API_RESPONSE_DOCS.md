# API Response Documentation

## POST /api/ai-generate

### Overview
Generates social media content for 6 platforms using Gemini AI. Accepts a text description and optional image.

### Request

```json
{
  "context": "New product launch for a sustainable fashion brand",
  "image": "data:image/png;base64,iVBORw0KGgoAAAANS..." // Optional
}
```

**Fields:**
- `context` (string, required): Description of the content topic
- `image` (string, optional): Base64-encoded image with data URL prefix (e.g., `data:image/png;base64,...`)

### Response (Success - 200 OK)

```json
{
  "desc_fb": "🌿 Exciting news! Our new sustainable fashion line is officially launching today! We've spent months sourcing eco-friendly materials and working with ethical manufacturers to bring you beautiful, planet-conscious clothing. From organic cotton to recycled polyester, every piece is designed to make you feel good about what you're wearing. Join us in celebrating the future of fashion that doesn't compromise on style or sustainability. Shop now and get 15% off your first order with code EARTH15 🌍✨",

  "desc_ig": "Meet our new sustainable fashion collection 🌿 Ethical. Beautiful. Guilt-free. Every piece is crafted from eco-friendly materials with zero compromise on style. Launch day = 15% off with code EARTH15 🌍✨ #SustainableFashion #EthicalStyle",

  "desc_tw": "🌿 We're live! Our new sustainable fashion collection drops today. Eco-friendly materials. Ethical manufacturing. Zero greenwashing. 15% off with EARTH15 🌍 #SustainableFashion",

  "desc_wa": "Hey! 🌿 Our new sustainable fashion collection is finally here! We've created beautiful, eco-friendly clothing that actually makes you feel good. Every piece is ethically made from sustainable materials. Celebrate the launch with 15% off - use code EARTH15 at checkout. Check it out!",

  "desc_li": "Introducing our new sustainable fashion collection – where style meets responsibility. After months of research and collaboration with ethical manufacturers, we're proud to launch a line that proves you don't have to compromise on quality or values. Our commitment: organic materials, transparent supply chains, and timeless designs. Join us in reshaping the future of fashion. Launch offer: 15% off with EARTH15.",

  "desc_yt": "Welcome to our sustainable fashion journey! In this video, we introduce our brand new eco-conscious collection. Learn about our sourcing process (0:00-2:30), meet the ethical manufacturers we partner with (2:30-5:00), and see our full product range (5:00-end). Shop our launch collection with 15% off using code EARTH15. For more info, visit our website. Subscribe for behind-the-scenes content on sustainable fashion!",

  "title_yt": "Sustainable Fashion Launch: Our New Eco-Friendly Collection (15% Off)"
}
```

**Response Fields:**
| Field | Platform | Description | Characteristics |
|-------|----------|-------------|-----------------|
| `desc_fb` | Facebook | Community-focused post | 100-200 words, engaging narrative |
| `desc_ig` | Instagram | Visual-first caption | 50-100 words, emojis, hook-first |
| `desc_tw` | Twitter/X | Tweet | Max 280 chars, punchy, hashtags |
| `desc_wa` | WhatsApp | Channel message | 50-100 words, conversational tone |
| `desc_li` | LinkedIn | Professional post | 100-150 words, insight-driven |
| `desc_yt` | YouTube | Video description | 150-250 words, timestamps, links |
| `title_yt` | YouTube | Video title | 50-70 chars, SEO-friendly, power words |

### Response (Error - 400/500)

```json
{
  "error": "Context is required"
}
```

**Possible Errors:**
- `400` - "Context is required" — Missing required `context` field
- `500` - "GEMINI_API_KEY not configured" — Missing API key in environment
- `500` - "Failed to generate content with AI" — Gemini API request failed
- `500` - "No content generated from AI" — Empty response from Gemini
- `500` - "Failed to parse AI response" — JSON parsing error

### Image Handling

**Supported formats:**
- JPEG (`image/jpeg`)
- PNG (`image/png`)
- GIF (`image/gif`)
- WebP (`image/webp`)

**Image data format:**
```
data:image/png;base64,iVBORw0KGgoAAAANS...
```

When an image is provided:
1. MIME type and base64 data are extracted from the data URL
2. Image is sent to Gemini API as `inline_data`
3. AI prompt is updated to instruct Gemini to analyze the image alongside context
4. Generated content is tailored to both the image and text context

### Example cURL Request

**Without Image:**
```bash
curl -X POST http://localhost:3330/api/ai-generate \
  -H "Content-Type: application/json" \
  -d '{
    "context": "New product launch for a sustainable fashion brand"
  }'
```

**With Image:**
```bash
curl -X POST http://localhost:3330/api/ai-generate \
  -H "Content-Type: application/json" \
  -d '{
    "context": "New product launch for a sustainable fashion brand",
    "image": "data:image/png;base64,iVBORw0KGgoAAAANS..."
  }'
```

### How Frontend Uses Response

The frontend (`index.html`) automatically populates the platform content boxes:

```javascript
const data = await res.json();

// Each response field populates its corresponding textarea
document.getElementById("desc_fb").value = data.desc_fb;
document.getElementById("desc_ig").value = data.desc_ig;
document.getElementById("desc_tw").value = data.desc_tw;
document.getElementById("desc_wa").value = data.desc_wa;
document.getElementById("desc_li").value = data.desc_li;
document.getElementById("desc_yt").value = data.desc_yt;
document.getElementById("title_yt").value = data.title_yt;
```

### Field Mapping

| API Response Field | HTML Element ID | Platform |
|-------------------|-----------------|----------|
| `desc_fb` | `#desc_fb` | Facebook |
| `desc_ig` | `#desc_ig` | Instagram |
| `desc_tw` | `#desc_tw` | Twitter/X |
| `desc_wa` | `#desc_wa` | WhatsApp |
| `desc_li` | `#desc_li` | LinkedIn |
| `desc_yt` | `#desc_yt` | YouTube Description |
| `title_yt` | `#title_yt` | YouTube Title |
