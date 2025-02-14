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

  // If not logged in, redirect to auth page
  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  // Block suspended users and force them to the auth page
  if (user.suspended) {
    // Force the URL to be /auth and prevent navigation
    if (window.location.pathname !== '/auth') {
      window.location.href = `/auth?suspended=true&reason=${encodeURIComponent(user.suspendedReason || '')}`;
      return null;
    }
    return (
      <Route path={path}>
        <Redirect to={`/auth?suspended=true&reason=${encodeURIComponent(user.suspendedReason || '')}`} />
      </Route>
    );
  }

  return <Route path={path} component={Component} />;
}