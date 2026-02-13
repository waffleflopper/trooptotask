# Troop to Task

A personnel scheduling and availability tracking application designed for Army units and organizations. Built with SvelteKit and Supabase.

## Features

### Calendar View
- Visual monthly calendar showing all personnel availability at a glance
- Color-coded status indicators (Leave, TDY, School, Sick, etc.)
- Click any cell to add or modify status entries
- Weekend and holiday highlighting
- Sticky headers for easy navigation

### Personnel Management
- Organize personnel by groups/sections
- Track rank, MOS, and roles
- Pin frequently accessed groups to the top
- Bulk import via CSV or Excel file upload
- Bulk delete functionality

### Daily Assignments
- Assign MOD (Medical Officer of the Day), Front Desk Support, and other daily duties
- Monthly assignment planner with quick-fill options
- Role-based assignment restrictions (e.g., only PA/MD can be MOD)
- Visual assignment badges on calendar

### Long-Range Planning
- 3-month view for extended planning
- See coverage gaps before they happen
- Plan around leave, TDY, and training schedules

### Training & Certifications
- Track training types with customizable expiration periods
- Multi-threshold expiration warnings (60 days yellow, 30 days orange, expired red)
- Role-based training requirements
- Training matrix showing all personnel × training types
- Bulk import training records via CSV or Excel
- Delinquency reports sorted by urgency

### Additional Features
- Dark/Light mode support
- Bulk status application for multiple personnel
- Federal holiday management
- Multi-organization support with role-based access
- Invite-only registration system

## Tech Stack

- **Frontend**: SvelteKit 5 with Svelte 5 runes
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Styling**: CSS with custom properties for theming
- **Excel Parsing**: SheetJS (xlsx)

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/waffleflopper/trooptotask.git
   cd trooptotask
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your Supabase credentials:
   ```
   PUBLIC_SUPABASE_URL=your_supabase_url
   PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Set up the database by running the SQL files in the `supabase/` directory:
   - `schema.sql` - Creates tables
   - `policies.sql` - Sets up Row Level Security
   - `seed-demo.sql` - (Optional) Adds demo data

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:5173](http://localhost:5173)

## Project Structure

```
src/
├── lib/
│   ├── components/     # Svelte components
│   ├── stores/         # Svelte 5 stores (state management)
│   ├── types.ts        # TypeScript interfaces
│   └── utils/          # Utility functions
├── routes/
│   ├── auth/           # Login, register, logout
│   ├── org/[orgId]/
│   │   ├── +page.svelte        # Main calendar view
│   │   ├── personnel/          # Personnel management
│   │   ├── training/           # Training tracker
│   │   └── settings/           # Organization settings
│   └── dashboard/      # Organization selector
└── app.css             # Global styles and CSS variables
```

## Demo Account

A demo account is available to explore the application with sample data:
- Visit the login page and click "Try Demo"
- No account creation required

## License

This project is proprietary software. All rights reserved.

## Contributing

This is currently a private project. Contact the maintainers for contribution guidelines.
