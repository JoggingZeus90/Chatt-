import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import ChatPage from "@/pages/chat-page";
import SettingsPage from "@/pages/settings-page";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { ProtectedRoute } from "./lib/protected-route";
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { MessageSquare, Settings } from "lucide-react";
import { useLocation } from "wouter";

function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen">
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarTrigger />
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/"}
                  tooltip="Chat"
                >
                  <a href="/">
                    <MessageSquare />
                    <span>Chat</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/settings"}
                  tooltip="Settings"
                >
                  <a href="/settings">
                    <Settings />
                    <span>Settings</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          {children}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={ChatPage} />
      <ProtectedRoute path="/settings" component={SettingsPage} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="chat-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Layout>
            <Router />
          </Layout>
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;