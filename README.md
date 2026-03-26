This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Development Server

To start the development server:

```bash
npm run dev
# or if port 3000 is already in use:
npm run dev:clean
```

The `dev:clean` command will automatically:
- Kill any process using port 3000
- Clean the `.next` build cache
- Start the development server

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Git Hooks

Local commits are protected by a repository-managed `pre-commit` hook.

- The hook runs `npm run test:piramid`
- If any unit, coverage, integration, or E2E suite fails, the commit is blocked
- The hook applies to commits made from VS Code and from the terminal because Git runs it before finalizing the commit

If Git hooks are not configured yet in your clone, install them with:

```bash
npm run hooks:install
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## SMS Notifications

Session create, update, and delete actions can send an SMS to the affected user when the following environment variables are configured:

```bash
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

The app reads the destination number from the `mobile_number` stored in the `usersinfo` table. If Twilio is not configured, SMS delivery is skipped. Session creation is blocked when a registered user does not have a mobile number on file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Versioning

This project uses [Semantic Versioning 2.0.0](https://semver.org/) for every change that alters the product surface:

- `PATCH` for backward-compatible fixes
- `MINOR` for backward-compatible features
- `MAJOR` for breaking changes

The canonical app version lives in `package.json` and is surfaced in the UI header as `Charging Stations App vX.Y.Z`.

### Version Commands

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

## Release Notes ---

### v1.5.0

- Added server-side active-admin authorization for audit-log reads and moved internal audit writing behind a server-only helper to reduce accidental misuse.

### v1.4.2

- Fixed the Stations tab so each station card shows only today's reservation count.

### v1.4.1

- Fixed the reservation cooldown messaging so the next available booking time is shown consistently in Brussels time.

### v1.4.0

- Added an admin-only dashboard button to manually run the session reminder job on demand and show the resulting reminder counts.

### v1.3.1

- Broadened SMS reminder eligibility so start reminders remain sendable after the session starts until it ends, and end reminders remain sendable from 15 minutes before end until one hour after end.

### v1.2.0

- Moved session SMS delivery to the `usersinfo.mobile_number` field managed in the dashboard and blocked session creation when a mobile number is missing.

### v1.1.0

- Added Twilio-backed SMS notifications for session creation, updates, and deletions using each user's primary Clerk phone number.

### v1.0.3

- Removed the ability to edit active sessions from the Sessions tab.

### v1.0.1

- Fixed the Sessions dashboard so the Completed Sessions list only shows sessions finished today.

### v1.0.0

- Added SemVer-based application versioning with centralized validation and bump logic.
- Displayed the current version in the header alongside the app name.
- Added version bump scripts for patch, minor, and major releases.
- Hardened the Playwright E2E environment with isolated build output, isolated server port, and automatic cleanup of stale Neon E2E branches.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
