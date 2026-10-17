// Shared fallback for every page's `if (!me) return ...` guard - the
// middleware already redirects an anonymous visitor to /login before any
// page renders, so reaching this means a signed-in auth user has no
// active profile (deactivated, or the profile row is missing/broken),
// not the common case.
export default function SignInRequired({ message }: { message?: string }) {
  return (
    <div className="h-[70vh] flex flex-col items-center justify-center text-center">
      <h1 className="text-lg font-semibold text-ink">Sign in required</h1>
      {message && <p className="text-sm text-ink/50 mt-1">{message}</p>}
      <a href="/login" className="mt-4 text-sm bg-accent text-white px-4 py-2 rounded-lg">
        Go to sign in
      </a>
    </div>
  );
}
