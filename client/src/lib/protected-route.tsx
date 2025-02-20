import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect } from "wouter";

export function ProtectedRoute({
  component: Component,
}: {
  component: () => React.JSX.Element;
}) {
  const { user, isLoading } = useAuth();

  // Check for loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  // If not logged in, redirect to auth page
  if (!user) {
    return <Redirect to="/auth" />;
  }

  // Block suspended users and force them to the auth page
  if (user.suspended) {
    // Force the URL to be /auth and prevent navigation
    if (window.location.pathname !== '/auth') {
      window.location.href = `/auth?suspended=true&reason=${encodeURIComponent(user.suspendedReason || '')}`;
      return <></>;
    }
    return <Redirect to={`/auth?suspended=true&reason=${encodeURIComponent(user.suspendedReason || '')}`} />;
  }

  return <Component />;
}