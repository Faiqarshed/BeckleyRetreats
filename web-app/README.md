# Beckley Retreats Program Operations Application

This application streamlines and manages the participant screening process, retreat coordination, and program operations for Beckley Retreats.

## Overview

The Beckley Retreats Program Operations application is a comprehensive web-based system that manages the end-to-end process of participant screening, retreat assignment, and program operations. The system integrates with external services like Typeform for application intake and HubSpot for customer relationship management.

### Key Features

- User authentication and role-based permissions
- Participant application management
- Automated scoring system based on application responses
- Screening workflow management
- Retreat scheduling and assignment
- Facilitator notes and documentation
- Dashboard with actionable insights
- Mobile-responsive design for field use

## Technology Stack

- **Frontend:** Next.js with React and Tailwind CSS
- **Backend:** Node.js with API routes
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth
- **Hosting:** Vercel
- **CI/CD:** GitHub Actions with Vercel Integration
- **Monitoring:** Vercel Analytics and Sentry

## Project Structure

```
beckley-program-ops/
├── web-app/                  # Web application code
│   ├── src/
│   │   ├── app/              # App router pages and API routes
│   │   │   ├── api/          # API endpoints
│   │   │   ├── auth/         # Authentication pages
│   │   │   ├── dashboard/    # Dashboard pages
│   │   │   ├── participants/ # Participant management
│   │   │   ├── screening/    # Screening workflow
│   │   │   └── admin/        # Admin functionality
│   │   ├── components/       # Reusable UI components
│   │   ├── context/          # React context providers
│   │   ├── hooks/            # Custom React hooks
│   │   ├── lib/              # Core utility functions
│   │   ├── services/         # External service integrations
│   │   ├── styles/           # Global styles
│   │   ├── types/            # TypeScript type definitions
│   │   └── utils/            # Utility functions
│   ├── public/               # Static assets
│   └── ...
├── BR Program Ops App Dev Plan.md         # Development plan
└── Beckley Retreats Program Operations Application PRD v1.2.md  # PRD
```

## Getting Started

### Prerequisites

- Node.js 18.0 or later
- npm 9.0 or later
- Supabase account

### Setup Development Environment

1. Clone the repository
2. Install dependencies:

```bash
cd web-app
npm install
```

3. Set up environment variables (copy `.env.example` to `.env.local` and fill in the values)
4. Run the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

### Environment Variables

The project uses environment variables to manage configuration across different environments. Follow these steps to set up your local environment:

1. Copy the example environment file to create your local environment file:

```bash
cp .env.example .env.local
```

2. Edit `.env.local` and fill in the actual values for your development environment:

```
# Required for Supabase integration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Required for API integrations as needed
TYPEFORM_API_KEY=your-typeform-api-key
HUBSPOT_API_KEY=your-hubspot-api-key
```

> **Note**: Never commit your `.env.local` file to version control as it may contain sensitive information. Only the `.env.example` template should be committed.

## Development Workflow

This project follows the development plan outlined in the root directory. We use an iterative approach with regular deployments and testing.

## Deployment

The application is deployed on Vercel with separate environments for development, staging, and production.

## License

All rights reserved. This is proprietary software for Beckley Retreats.
