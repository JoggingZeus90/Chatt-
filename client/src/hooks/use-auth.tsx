import { createContext, ReactNode, useContext, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser, UserRole, UserRoleType } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/user");
        if (res.status === 403) {
          const data = await res.json();
          toast({
            title: "Account Suspended",
            description: `Your account has been suspended. Reason: ${data.reason}`,
            variant: "destructive",
          });
          queryClient.setQueryData(["/api/user"], null);
          window.history.pushState(null, '', '/auth');
          return undefined;
        }
        if (!res.ok) {
          if (res.status === 401) return undefined;
          throw new Error("Failed to fetch user data");
        }
        return res.json();
      } catch (error) {
        console.error("Error fetching user:", error);
        throw error;
      }
    },
    refetchInterval: 30000, // Check suspension status every 30 seconds
  });

  // Add effect to prevent suspended users from navigating back
  useEffect(() => {
    if (user?.suspended) {
      window.history.pushState(null, '', '/auth');
      const handlePopState = () => {
        window.history.pushState(null, '', '/auth');
      };
      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [user?.suspended]);

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      if (res.status === 403) {
        const data = await res.json();
        throw new Error(`Account suspended: ${data.reason}`);
      }
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      if (user.suspended) {
        toast({
          title: "Account Suspended",
          description: `Your account has been suspended. Reason: ${user.suspendedReason}`,
          variant: "destructive",
        });
        queryClient.setQueryData(["/api/user"], null);
      } else {
        queryClient.setQueryData(["/api/user"], user);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      const res = await apiRequest("POST", "/api/register", credentials);
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  // Add role checking helpers
  const isAdmin = context.user?.role === UserRole.ADMIN;
  const isModerator = context.user?.role === UserRole.MODERATOR || isAdmin;

  return {
    ...context,
    isAdmin,
    isModerator,
  };
}