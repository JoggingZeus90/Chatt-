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
import { LogOut, Plus, Loader2 } from "lucide-react";

export default function ChatPage() {
  const { user, logoutMutation } = useAuth();
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

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
    },
  });

  const form = useForm({
    resolver: zodResolver(insertRoomSchema),
  });

  // Update online status
  useEffect(() => {
    if (!user) return;

    apiRequest("POST", `/api/users/${user.id}/status`, { isOnline: true });

    const updateStatus = () => {
      if (user) {
        apiRequest("POST", `/api/users/${user.id}/status`, { isOnline: true });
      }
    };

    const interval = setInterval(updateStatus, 30000);

    const handleBeforeUnload = () => {
      if (user) {
        apiRequest("POST", `/api/users/${user.id}/status`, { isOnline: false });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (user) {
        apiRequest("POST", `/api/users/${user.id}/status`, { isOnline: false });
      }
    };
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <div className="w-64 border-r bg-muted/50 p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Chat Rooms</h2>
          <Dialog>
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
        <div className="pt-4 border-t mt-4">
          <Button
            variant="outline"
            className="w-full"
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
