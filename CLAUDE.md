# CaptionForge — Project Overview

## Project Summary

**CaptionForge** is a full-stack social media content generator that creates tailored captions and content for 6 different platforms with AI-powered assistance. It helps content creators write platform-specific posts by combining boilerplate text, tags, and AI-generated descriptions.

## Key Features

- **Multi-Platform Support**: Generate content for Facebook, Instagram, Twitter/X, WhatsApp Channels, LinkedIn, and YouTube
- **AI-Powered Generation**: Google Gemini 3 Flash API integration for automatic content generation
- **Content Management**: Save and manage boilerplate text, platform-specific tags, and generation history
- **Clean Dark UI**: Modern, responsive interface with platform-specific color coding
- **Full-Stack**: Hybrid approach with no frontend frameworks

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Pure HTML/CSS/JavaScript (no frameworks) |
| **Backend** | Bun runtime with custom HTTP server |
| **Database** | SQLite with better-sqlite3 |
| **AI** | Google Gemini 3 Flash API |

## Architecture

### Project Structure
```
social-bvn/
├── src/
│   ├── db.ts           # SQLite database operations and schema
│   └── server.ts       # Bun HTTP server with API endpoints
├── index.html          # Frontend application (HTML/CSS/JS)
├── package.json        # Dependencies (better-sqlite3, TypeScript)
└── .env                # Environment variables (GEMINI_API_KEY)
```

### Database Schema

**Settings Table** (singleton pattern with id=1)
- `boilerplate` — Common text added to all posts
- `tags_fb`, `tags_ig`, `tags_tw`, `tags_wa`, `tags_li`, `tags_yt` — Platform-specific tags/hashtags
- `updated_at` — Timestamp of last modification

**Generated Content Table**
- `content_fb`, `content_ig`, `content_tw`, `content_wa`, `content_li`, `content_yt` — Platform-specific content
- `title_yt` — YouTube video title (separate from description)
- `created_at` — Timestamp of generation

## API Endpoints

### Settings Management
- `GET /api/settings` — Fetch boilerplate and platform tags
- `PUT /api/settings` — Save/update boilerplate and tags

### Content Generation
- `POST /api/generate` — Save generated content to database
- `GET /api/history` — Get up to 50 recent generations (ordered by timestamp DESC)
- `GET /api/history/:id` — Fetch specific content by ID
- `DELETE /api/history` — Clear all generation history

### AI Generation
- `POST /api/ai-generate` — Generate platform-specific content using Gemini AI
  - **Request**: `{ "context": "your content description" }`
  - **Response**: JSON with `desc_fb`, `desc_ig`, `desc_tw`, `desc_wa`, `desc_li`, `desc_yt`, `title_yt` fields

## Key Implementation Details

### Backend (server.ts)
- Simple router pattern matching `METHOD /path` format
- Dynamic route handling for `/api/history/:id`
- Gemini API integration with prompt engineering to generate platform-specific JSON
- Response parsing handles potential markdown code blocks from Gemini
- Error handling for missing API key and invalid requests

### Database (db.ts)
- SQLite with better-sqlite3 for synchronous operations
- Parameterized queries to prevent SQL injection
- Settings row auto-initialized on startup
- Generated content stored with full platform set even if some fields are empty

### Frontend (index.html)
- Vanilla JavaScript (no build step required)
- Fetch API for backend communication
- Real-time form handling and content generation
- Copy-to-clipboard functionality
- Dark theme with platform-specific color indicators

## Running the Project

```bash
# Install dependencies
bun install

# Configure API key
echo "GEMINI_API_KEY=your_key_here" > .env

# Start server
bun run src/server.ts

# Access at http://localhost:3330
```

## Development Notes

- **Port**: 3330
- **Database File**: `database.sqlite` in project root (auto-created)
- **Gemini API**: Uses `gemini-3-flash-preview` model
- **Response Generation**: Prompts AI to return JSON with specific format for reliable parsing
- **No Build Step**: TypeScript runs directly via Bun, HTML served as static file

## Database Operations

All database operations are in `db.ts`:
- Settings use a singleton pattern (always id=1)
- Generated content is append-only with auto-increment IDs
- History queries return content ordered by creation time (newest first)
- All updates include timestamp tracking

## Future Considerations

- Settings updates include timestamp tracking via `updated_at` field
- Database is SQLite file on disk (portable, no separate server needed)
- AI generation can fail if Gemini API is down or key is invalid
- Generated content fields can be empty strings (preserved as-is)
