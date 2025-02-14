import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: () => React.JSX.Element;
}) {
  const { user, isLoading } = useAuth();

  // Check for loading state
  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </Route>
    );
  }

  // If not logged in or suspended, redirect to auth page
  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  // Add event listener to prevent back navigation for suspended users
  if (user.suspended) {
    window.history.pushState(null, '', '/auth');
    window.addEventListener('popstate', () => {
      window.history.pushState(null, '', '/auth');
    });
    return (
      <Route path={path}>
        <Redirect to={`/auth?suspended=true&reason=${encodeURIComponent(user.suspendedReason || '')}`} />
      </Route>
    );
  }

  return <Component />
}