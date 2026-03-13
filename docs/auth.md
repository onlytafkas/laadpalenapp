# Authentication — Clerk

All authentication in this app is handled exclusively by Clerk. Never implement custom auth, NextAuth, or any other auth solution.

## Rules

- **Clerk only.** No custom auth logic, sessions, JWTs, or middleware outside of Clerk.
- **Sign-in and sign-up must open as a modal.** Never navigate to a dedicated sign-in/sign-up page. Use Clerk's `<SignInButton mode="modal">` and `<SignUpButton mode="modal">`.
- **`/dashboard` is a protected route.** Users who are not signed in must not be able to access it. Enforce this via Clerk middleware.
- **Redirect signed-in users away from `/`.** If a signed-in user visits the homepage, redirect them to `/dashboard`.

## Middleware

Use Clerk's `clerkMiddleware` in `middleware.ts` to protect routes and handle redirects:

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);
const isPublicHome = createRouteMatcher(["/"]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  if (isProtectedRoute(req) && !userId) {
    return (await auth()).redirectToSignIn();
  }

  if (isPublicHome(req) && userId) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
```

## Sign-in / Sign-up Buttons

Always use Clerk's modal mode. Never link directly to `/sign-in` or `/sign-up` pages.

```tsx
import { SignInButton, SignUpButton } from "@clerk/nextjs";

<SignInButton mode="modal">
  <button>Sign in</button>
</SignInButton>

<SignUpButton mode="modal">
  <button>Sign up</button>
</SignUpButton>
```

## Accessing the Current User

- In **Server Components**: use `auth()` or `currentUser()` from `@clerk/nextjs/server`.
- In **Client Components**: use `useUser()` or `useAuth()` from `@clerk/nextjs`.
