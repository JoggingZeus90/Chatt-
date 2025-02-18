import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRoomSchema, type Room } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Label } from "@/components/ui/label";
import ChatRoom from "@/components/chat/chat-room";
import { useState, useEffect } from "react";
import { Plus, Loader2, Settings, LogOut, PanelLeftClose } from "lucide-react";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";

export default function ChatPage() {
  const { user, logoutMutation } = useAuth();
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const { data: rooms, isLoading } = useQuery<Room[]>({
    queryKey: ["/api/rooms"],
  });

  const createRoomMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const res = await apiRequest("POST", "/api/rooms", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      setIsCreateDialogOpen(false);
      form.reset();
    },
  });

  const form = useForm({
    resolver: zodResolver(insertRoomSchema),
    defaultValues: {
      name: "",
    },
  });

  // Update online status
  useEffect(() => {
    if (!user) return;

    const updateStatus = async () => {
      try {
        await apiRequest("POST", `/api/users/${user.id}/status`, { isOnline: true });
      } catch (error) {
        if (error instanceof Error && error.message.includes("401")) {
          return;
        }
        console.error("Failed to update status:", error);
      }
    };

    updateStatus();
    const interval = setInterval(updateStatus, 30000);

    const handleBeforeUnload = async () => {
      if (user) {
        try {
          await apiRequest("POST", `/api/users/${user.id}/status`, { isOnline: false });
        } catch (error) {
          console.error("Failed to update status on unload:", error);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (user && !logoutMutation.isPending) {
        handleBeforeUnload();
      }
    };
  }, [user, logoutMutation.isPending]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <div className={`${isSidebarCollapsed ? "hidden" : "w-64"} md:block border-r bg-muted/50 flex flex-col h-full`}>
        <div className="p-4 flex flex-col flex-grow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Chat Rooms</h2>
            <div className="flex gap-2">
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Room</DialogTitle>
                  </DialogHeader>
                  <form
                    onSubmit={form.handleSubmit((data) =>
                      createRoomMutation.mutate(data)
                    )}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="name">Room Name</Label>
                      <Input id="name" {...form.register("name")} />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={createRoomMutation.isPending}
                    >
                      {createRoomMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Create Room
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarCollapsed(true)}
                className="md:hidden"
                title="Hide sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2 flex-1 overflow-auto">
            {rooms?.map((room) => (
              <Button
                key={room.id}
                variant={selectedRoom?.id === room.id ? "secondary" : "ghost"}
                className="w-full justify-start"
                onClick={() => setSelectedRoom(room)}
              >
                {room.name}
              </Button>
            ))}
          </div>
        </div>

        {/* User Profile Section - Fixed at bottom */}
        <div className="border-t p-4 mt-auto space-y-4 bg-background/50">
          <div className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatarUrl ?? undefined} />
                <AvatarFallback>{user?.username?.[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="font-medium text-sm">{user?.username}</span>
            </div>
          </div>
          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 transition-transform hover:scale-105 hover:text-red-500 hover:border-red-500"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Logout
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.href = '/settings'}
              className="flex-1 transition-transform hover:scale-105 hover:text-blue-500 hover:border-blue-500"
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1">
        {selectedRoom ? (
          <ChatRoom 
            room={selectedRoom} 
            onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a room to start chatting
          </div>
        )}
      </div>
    </div>
  );
}