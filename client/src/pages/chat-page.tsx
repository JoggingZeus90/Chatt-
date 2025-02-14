import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRoomSchema, type Room } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Label } from "@/components/ui/label";
import ChatRoom from "@/components/chat/chat-room";
import { useState, useEffect } from "react";
import { MoreVertical, Trash2, LogOut, Plus, Loader2, Settings, PanelLeftClose } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";

export default function ChatPage() {
  const { user, logoutMutation } = useAuth();
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const sidebar = useSidebar();

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

  const deleteRoomMutation = useMutation({
    mutationFn: async (roomId: number) => {
      await apiRequest("DELETE", `/api/rooms/${roomId}`);
    },
    onSuccess: () => {
      setSelectedRoom(null);
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
    },
  });

  const leaveRoomMutation = useMutation({
    mutationFn: async (roomId: number) => {
      await apiRequest("POST", `/api/rooms/${roomId}/leave`);
    },
    onSuccess: () => {
      setSelectedRoom(null);
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
    },
  });

  const form = useForm({
    resolver: zodResolver(insertRoomSchema),
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
    const interval = setInterval(updateStatus, 3000);

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
        updateStatus();
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
      <div className="w-64 border-r bg-muted/50 p-4 pt-12 flex flex-col relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 left-2"
          onClick={() => sidebar.toggleSidebar()}
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Chat Rooms</h2>
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
        </div>
        <div className="space-y-2 flex-1 overflow-auto">
          {rooms?.map((room) => (
            <div key={room.id} className="flex items-center gap-2">
              <Button
                variant={selectedRoom?.id === room.id ? "secondary" : "ghost"}
                className="w-full justify-start"
                onClick={() => setSelectedRoom(room)}
              >
                {room.name}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {room.createdById === user?.id ? (
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => deleteRoomMutation.mutate(room.id)}
                      disabled={deleteRoomMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Room
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => leaveRoomMutation.mutate(room.id)}
                      disabled={leaveRoomMutation.isPending}
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Leave Room
                    </DropdownMenuItem>
                  )}
                  {room.createdById === user?.id && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          <Settings className="h-4 w-4 mr-2" />
                          Edit Name
                        </DropdownMenuItem>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Edit Room Name</DialogTitle>
                        </DialogHeader>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            const newName = formData.get("name") as string;
                            if (newName && newName !== room.name) {
                              apiRequest("PATCH", `/api/rooms/${room.id}`, { name: newName })
                                .then(() => queryClient.invalidateQueries({ queryKey: ["/api/rooms"] }));
                            }
                            (e.target as HTMLFormElement).reset();
                            (e.target as HTMLFormElement).closest("dialog")?.close();
                          }}
                          className="space-y-4"
                        >
                          <div className="space-y-2">
                            <Label htmlFor="name">Room Name</Label>
                            <Input
                              id="name"
                              name="name"
                              defaultValue={room.name}
                              required
                            />
                          </div>
                          <DialogClose asChild>
                            <Button type="submit" className="w-full">
                              Save Changes
                            </Button>
                          </DialogClose>
                        </form>
                      </DialogContent>
                    </Dialog>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
        <div className="pt-4 border-t mt-4 space-y-4">
          {/* User Profile Section */}
          <div className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatarUrl} />
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
              className="flex-1 transition-transform hover:scale-105"
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1">
        {selectedRoom ? (
          <ChatRoom room={selectedRoom} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a room to start chatting
          </div>
        )}
      </div>
    </div>
  );
}