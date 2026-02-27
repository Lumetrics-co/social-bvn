# CaptionForge — Social Media Content Generator

A full-stack social media content generator that creates tailored captions for 6 platforms (Facebook, Instagram, Twitter/X, WhatsApp, LinkedIn, YouTube) with AI-powered assistance.

## Features

- **6 Social Media Platforms**: Generate tailored content for Facebook, Instagram, Twitter/X, WhatsApp Channels, LinkedIn, and YouTube
- **AI-Powered Generation**: Use Gemini AI to automatically generate platform-specific content from a simple description
- **Persistent Storage**: Boilerplate text and platform tags are automatically saved to the database
- **Generation History**: View and manage previous content generations
- **Clean Dark UI**: Modern, responsive interface with platform-specific color coding

## Tech Stack

- **Frontend**: Pure HTML/CSS/JavaScript (no frameworks)
- **Backend**: Bun runtime with custom server
- **Database**: SQLite with better-sqlite3
- **AI**: Google Gemini 3 Flash API

## Setup

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Configure AI API Key:**
   
   Edit `.env` file and add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```
   
   Get your API key from: https://aistudio.google.com/app/apikey

3. **Start the server:**
   ```bash
   bun run src/server.ts
   ```

4. **Open in browser:**
   Navigate to http://localhost:3330

## Usage

### Manual Generation

1. Fill in your **boilerplate** text (e.g., contact info, copyright)
2. Add **platform-specific tags** and hashtags for each platform
3. Write **descriptions** for each platform's content
4. Click **"Generate Content"** to combine everything into formatted captions
5. **Copy** individual captions or save all generated content to the database

### AI-Powered Generation

1. Go to the **AI Assist** section
2. Describe your content topic in the text area (e.g., "New product launch for sustainable fashion brand")
3. Click **"Generate"** to let AI create platform-specific content
4. Review and edit the generated descriptions
5. Use **"Generate Content"** to combine with your boilerplate and tags

### Saving Generated Content

- Click **"Save Generated Content to Database"** to store the current generated content
- Access generation history via the API (`GET /api/history`)

## API Endpoints

### Settings (Boilerplate & Tags)
- `GET /api/settings` - Retrieve saved boilerplate and tags
- `PUT /api/settings` - Save/update boilerplate and tags

### Content Generation
- `POST /api/generate` - Save generated content to database
- `GET /api/history` - Get generation history (last 50 entries)
- `DELETE /api/history` - Clear all generation history

### AI Generation
- `POST /api/ai-generate` - Generate content with AI
  - Request body: `{ "context": "your content description" }`
  - Response: `{ "desc_fb": "...", "desc_ig": "...", ... }`

## Project Structure

```
social-bvn/
├── src/
│   ├── server.ts      # Bun server with API endpoints
│   └── db.ts          # Database operations
├── index.html           # Frontend application
├── .env                # Environment variables (API keys)
├── package.json
└── ecosystem.config.js  # PM2 configuration
```

## Database Schema

### Settings Table
Stores boilerplate and platform tags
- `key` (TEXT) - Setting identifier
- `value` (TEXT) - Setting value

### Generated Content Table
Stores generated content history
- `content_fb`, `content_ig`, `content_tw`, `content_wa`, `content_li`, `content_yt` - Platform descriptions
- `title_yt` - YouTube video title
- `created_at` (TEXT) - Timestamp

## Development

### Running with PM2
```bash
pm2 start ecosystem.config.js
pm2 logs social-bvn
```

### Stopping the Server
- Press `Ctrl+C` to stop the Bun server
- Or use PM2: `pm2 stop social-bvn`

## License

MIT