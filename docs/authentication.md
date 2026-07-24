# Authentication and authorization

## Flow

Supabase Auth owns passwords and sessions. `@supabase/ssr` stores session data in
securely managed cookies so Server Components, route handlers, the proxy, and
browser code share one authenticated session.

- `/signup`: creates an email/password identity and passes the validated full name
  as auth metadata.
- `/login`: signs in and redirects only to an allowlisted protected path.
- `/forgot-password`: requests a recovery email with a generic response.
- `/auth/callback`: exchanges a Supabase PKCE code and redirects safely.
- `/reset-password`: updates the password only for a valid recovery session.
- sign-out: clears the Supabase session and returns to login.

## Protection layers

1. `proxy.ts` refreshes cookies and redirects anonymous protected requests.
2. The protected route layout revalidates the user on the server.
3. Server actions obtain the user from the session rather than form data.
4. PostgreSQL RLS authorizes every user-owned row.

The proxy improves routing and session freshness but is not the only security
boundary.

## Setup

In the Supabase Dashboard:

1. Copy the project URL and publishable key from **Connect**.
2. Add `http://localhost:3000/auth/callback` as a local redirect URL.
3. Set the production site URL and exact HTTPS callback before deployment.
4. Review email confirmation and password policies for production.

The repository does not require or accept a service-role key.

## Manual verification

With a configured development project:

1. Sign up and verify that the confirmation state is clear.
2. Confirm the profile row was created for that auth user.
3. Sign out and confirm `/dashboard` redirects to `/login`.
4. Sign in with an incorrect password and verify the nonspecific error.
5. Sign in correctly and open all protected navigation links.
6. Request recovery, open the email, set a new password, then sign in with it.
7. Attempt a callback containing an external `next` value and verify it returns
   only to `/dashboard`.

Use disposable development accounts, never production user credentials.
