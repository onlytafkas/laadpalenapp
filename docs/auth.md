# Authentication — Clerk

All authentication in this app is handled exclusively by **Clerk**. No custom auth solutions, no alternative providers.

## Rules

- **Clerk only.** Do not implement custom authentication logic, JWT handling, session management, or password storage.
- **No alternative auth providers.** Do not integrate Auth.js (NextAuth), Supabase Auth, Firebase Auth, or any other authentication system.
- **Use Clerk components and hooks.** Never build custom sign-in/sign-up forms from scratch.
- **Modals for auth flows.** Sign-in and sign-up must always launch as modals, never as full-page routes.

## Protected Routes

### Dashboard Protection

The `/dashboard` route and all nested routes are **protected**. Users must be authenticated to access them.

**Implementation:**
- Use Clerk's middleware or `auth()` helper to verify authentication
- Redirect unauthenticated users to the sign-in modal

### Homepage Redirect

If a logged-in user navigates to the homepage (`/`), automatically redirect them to `/dashboard`.

**Implementation:**
- Check authentication status on the homepage
- Redirect authenticated users with `redirect("/dashboard")`

## Common Patterns

### Server Component Authentication

```tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect("/");
  }

  return <div>Protected content</div>;
}
```

### Client Component Authentication

```tsx
"use client";

import { useUser } from "@clerk/nextjs";

export function UserProfile() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) return <div>Loading...</div>;
  if (!user) return null;

  return <div>Welcome, {user.firstName}!</div>;
}
```

### Auth Components

Use Clerk's prebuilt components for authentication UI:

```tsx
import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

// Trigger sign-in modal
<SignInButton mode="modal">
  <button>Sign In</button>
</SignInButton>

// Trigger sign-up modal
<SignUpButton mode="modal">
  <button>Sign Up</button>
</SignUpButton>

// User menu with account management
<UserButton afterSignOutUrl="/" />
```

## Key Clerk Hooks & Helpers

| Hook/Helper | Usage |
|-------------|-------|
| `useUser()` | Access current user data (client) |
| `useAuth()` | Access auth state and sign-out (client) |
| `auth()` | Server-side authentication check |
| `currentUser()` | Get full user object (server) |

## References

- [Clerk Next.js Documentation](https://clerk.com/docs/quickstarts/nextjs)
- [App Router Authentication](https://clerk.com/docs/references/nextjs/overview)
