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
import { Plus, Loader2, Settings, LogOut, PanelLeftClose, PanelLeft, Users, Lock } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

export default function ChatPage() {
  const { user, logoutMutation } = useAuth();
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const { toast } = useToast();

  const { data: rooms, isLoading } = useQuery<Room[]>({
    queryKey: ["/api/rooms"],
    refetchInterval: 5000,
    select: (rooms) => {
      return rooms.map(room => ({
        ...room,
        participants: room.participants || []
      }));
    }
  });

  const { data: unreadMentions, refetch: refetchUnreadMentions } = useQuery<{ roomId: number; count: number }[]>({
    queryKey: ["/api/mentions/unread"],
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0,
  });

  const clearMentionsMutation = useMutation({
    mutationFn: async (roomId: number) => {
      try {
        const res = await apiRequest("POST", `/api/rooms/${roomId}/mentions/clear`);
        if (!res.ok) {
          const error = await res.text();
          throw new Error(error || 'Failed to clear mentions');
        }
        return { roomId };
      } catch (error) {
        console.error('Clear mentions error:', error);
        throw error;
      }
    },
    onSuccess: ({ roomId }) => {
      // Immediately update the cache to remove mentions for this room
      queryClient.setQueryData<{ roomId: number; count: number }[]>(
        ["/api/mentions/unread"],
        (old) => old?.filter(mention => mention.roomId !== roomId) ?? []
      );

      // Temporarily disable refetching
      const previousDefaults = queryClient.getDefaultOptions();
      queryClient.setQueryDefaults(["/api/mentions/unread"], {
        refetchInterval: false,
        refetchOnWindowFocus: false,
        staleTime: Infinity
      });

      // Re-enable refetching after a delay
      setTimeout(() => {
        queryClient.setQueryDefaults(["/api/mentions/unread"], previousDefaults);
        queryClient.invalidateQueries({ queryKey: ["/api/mentions/unread"] });
      }, 2000);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to clear mentions",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRoomSelect = async (room: Room) => {
    setSelectedRoom(room);

    // Check for unread mentions in this room
    const roomMentions = unreadMentions?.find(m => m.roomId === room.id);
    if (roomMentions && roomMentions.count > 0) {
      try {
        // Clear mentions immediately when entering the room
        await clearMentionsMutation.mutateAsync(room.id);
      } catch (error) {
        console.error("Failed to clear mentions:", error);
      }
    }
  };

  const createRoomMutation = useMutation({
    mutationFn: async (data: { name: string; isPublic: boolean }) => {
      const res = await apiRequest("POST", "/api/rooms", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      setIsCreateDialogOpen(false);
      form.reset();
    },
  });

  const joinRoomMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", `/api/rooms/join/${code}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      setIsJoinDialogOpen(false);
      setRoomCode("");
    },
  });

  const leaveRoomMutation = useMutation({
    mutationFn: async (roomId: number) => {
      await apiRequest("POST", `/api/rooms/${roomId}/leave`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      setSelectedRoom(null);
    },
  });


  const form = useForm({
    resolver: zodResolver(insertRoomSchema),
    defaultValues: {
      name: "",
      isPublic: true,
    },
  });

  const handleLeaveRoom = async (roomId: number) => {
    await leaveRoomMutation.mutate(roomId);
  };

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
      <div
        className={`
          ${isSidebarCollapsed ? "w-0" : "w-64"} 
          border-r bg-muted/50 flex flex-col h-full overflow-hidden
          transition-[width] duration-200 ease-in-out
        `}
      >
        <div className="p-4 flex flex-col flex-grow min-w-[16rem]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Chat Rooms</h2>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setIsCreateDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Room
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setIsJoinDialogOpen(true)}>
                    <Users className="mr-2 h-4 w-4" />
                    Join Room
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="space-y-2 flex-1 overflow-auto">
            {rooms?.map((room) => {
              const unreadMention = unreadMentions?.find(m => m.roomId === room.id);
              const hasUnreadMentions = unreadMention && unreadMention.count > 0;
              return (
                <Button
                  key={room.id}
                  variant={selectedRoom?.id === room.id ? "secondary" : "ghost"}
                  className="w-full justify-start relative gap-2 px-3 min-h-[2.5rem]"
                  onClick={() => handleRoomSelect(room)}
                >
                  <div className="flex items-center gap-2 w-full">
                    {!room.isPublic && <Lock className="h-4 w-4 flex-shrink-0" />}
                    <span className="truncate">
                      {room.name}
                      {!room.isPublic && room.inviteCode && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({room.inviteCode})
                        </span>
                      )}
                    </span>
                    {hasUnreadMentions && (
                      <div 
                        className="ml-auto h-2 w-2 rounded-full bg-blue-500 animate-pulse"
                        style={{ boxShadow: '0 0 0 2px var(--background)' }}
                      />
                    )}
                  </div>
                </Button>
              );
            })}
          </div>
        </div>

        <div className="border-t p-4 mt-auto space-y-4 bg-background/50 min-w-[16rem]">
          <div className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatarUrl ?? undefined} />
                <AvatarFallback>{user?.username?.[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="font-medium text-sm">{user?.username}</span>
            </div>
          </div>
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
            onLeave={handleLeaveRoom}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a room to start chatting
          </div>
        )}
      </div>

      {/* Create Room Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
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
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="isPublic">Room Visibility</Label>
                <div className="text-sm text-muted-foreground">
                  Make this room {form.watch("isPublic") ? "public" : "private"}
                </div>
              </div>
              <Switch
                id="isPublic"
                checked={form.watch("isPublic")}
                onCheckedChange={(checked) => form.setValue("isPublic", checked)}
              />
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

      {/* Join Room Dialog */}
      <Dialog open={isJoinDialogOpen} onOpenChange={setIsJoinDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join Room</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (roomCode) {
                joinRoomMutation.mutate(roomCode);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="roomCode">Room Code</Label>
              <Input
                id="roomCode"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="Enter room code"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={joinRoomMutation.isPending || !roomCode}
            >
              {joinRoomMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Join Room
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}