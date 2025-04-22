<p align="center">
  <h1 align="center">emporte</h1>
</p>

<p align="center">
  An easier way to import course schedules directly into Google Calendar.
</p>

## Requirements

*   **Node.js:** v18.x or v20.x (LTS recommended)
*   **npm**/**pnpm**/**yarn** or **bun:** Your preferred package manager.
*   **Redis:** A running Redis instance (v5.x or later recommended) accessible by the server.
*   **Google AI Studio:**
    *   Gemini API Key enabled.

## Highlights

*   **Secure Google Sign-In:** OAuth 2.0 for secure authentication and calendar access.
*   **AI-Powered Extraction:** Gemini API analyzes your images and extracts course details (codes, names, times, days, locations).
*   **Interactive Preview Grid:** Displays the extracted data, allowing you to make quick edits before import.
*   **Google Calendar Integration:** Creates recurring event series in your primary Google Calendar based on final schedule data and selected term dates.
*   **Automatic Data Cleanup:** Temporarily uploaded files and preview data are automatically deleted after import or expiry.
*   **Background Processing:** Using BullMQ and Redis for robust background job handling of AI processing tasks.

## Project Structure

```plaintext
emporte/
├── server/                     # Backend (Fastify)
│   ├── src/
│   │   ├── plugins/            # Fastify plugins (Redis, Session, CORS, OAuth, etc.)
│   │   ├── routes/             # API route handlers (auth, upload, preview, calendar)
│   │   ├── services/           # Business logic (AI, Calendar, Worker)
│   │   └── server.ts           # Main server setup
│   ├── package.json
│   └── tsconfig.json
├── client/                     # Frontend (Vite/React)
│   ├── public/                 # Static assets (icons, etc.)
│   ├── src/
│   │   ├── components/         # Reusable UI components (layouts, schedulegrid)
│   │   ├── pages/              # Page components (Home, Login, Import, Preview, etc.)
│   │   ├── lib/                # Utilities (e.g., cn)
│   │   ├── styles/             # Global CSS
│   │   ├── App.tsx             # Main application component
│   │   └── main.tsx            # Frontend entry point, router setup
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── common/                     # Shared package for types/utils if created
├── .gitignore
├── README.md                   # This file
└── package.json                # Root package.json (if using workspaces)
```
