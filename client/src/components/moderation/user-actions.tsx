import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface UserActionsProps {
  userId: number;
  username: string;
  onClose: () => void;
}

export function UserActions({ userId, username, onClose }: UserActionsProps) {
  const [muteDuration, setMuteDuration] = useState("");
  const [muteReason, setMuteReason] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const { toast } = useToast();

  const muteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/users/${userId}/mute`, {
        duration: parseInt(muteDuration),
        reason: muteReason,
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "User muted",
        description: `${username} has been muted for ${muteDuration} minutes.`,
      });
      // Reset form state
      setMuteDuration("");
      setMuteReason("");
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to mute user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/users/${userId}/suspend`, {
        reason: suspendReason,
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "User suspended",
        description: `${username} has been suspended.`,
      });
      // Reset form state
      setSuspendReason("");
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to suspend user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleMute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!muteDuration || !muteReason) {
      toast({
        title: "Missing information",
        description: "Please provide both duration and reason for muting.",
        variant: "destructive",
      });
      return;
    }
    await muteMutation.mutateAsync();
  };

  const handleSuspend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suspendReason) {
      toast({
        title: "Missing information",
        description: "Please provide a reason for suspension.",
        variant: "destructive",
      });
      return;
    }
    await suspendMutation.mutateAsync();
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleMute} className="space-y-4">
        <h3 className="text-lg font-medium">Mute User</h3>
        <div className="space-y-2">
          <Input
            type="number"
            placeholder="Duration (minutes)"
            value={muteDuration}
            onChange={(e) => setMuteDuration(e.target.value)}
            min="1"
            disabled={muteMutation.isPending}
          />
          <Textarea
            placeholder="Reason for muting"
            value={muteReason}
            onChange={(e) => setMuteReason(e.target.value)}
            disabled={muteMutation.isPending}
          />
        </div>
        <Button
          type="submit"
          disabled={muteMutation.isPending || !muteDuration || !muteReason}
        >
          {muteMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Mute User
        </Button>
      </form>

      <form onSubmit={handleSuspend} className="space-y-4">
        <h3 className="text-lg font-medium">Suspend User</h3>
        <div className="space-y-2">
          <Textarea
            placeholder="Reason for suspension"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            disabled={suspendMutation.isPending}
          />
        </div>
        <Button
          type="submit"
          disabled={suspendMutation.isPending || !suspendReason}
          variant="destructive"
        >
          {suspendMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Suspend User
        </Button>
      </form>
    </div>
  );
}