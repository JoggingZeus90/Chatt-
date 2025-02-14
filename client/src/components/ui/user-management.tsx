import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { User, UserRole } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

export function UserManagement() {
  const { user: currentUser, isAdmin, isModerator } = useAuth();
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<string>();
  const [suspensionReason, setSuspensionReason] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [muteReason, setMuteReason] = useState("");
  const [muteDuration, setMuteDuration] = useState("60"); // Default 60 minutes
  const [muteDialogOpen, setMuteDialogOpen] = useState(false);
  const [selectedMuteUser, setSelectedMuteUser] = useState<User | null>(null);

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin || isModerator,
  });

  // Separate users by role and status
  const admins = users?.filter(user => user.role === UserRole.ADMIN && !user.suspended) || [];
  const moderators = users?.filter(user => user.role === UserRole.MODERATOR && !user.suspended) || [];
  const activeUsers = users?.filter(user => 
    user.role === UserRole.USER && !user.suspended
  ) || [];
  const suspendedUsers = users?.filter(user => user.suspended) || [];

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}/role`, { role });
      if (!res.ok) throw new Error("Failed to update role");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User role updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const suspendUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: number; reason: string }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/suspend`, { reason });
      if (!res.ok) throw new Error("Failed to suspend user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User suspended successfully",
      });
      setSelectedUser(null);
      setSuspensionReason("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const muteUserMutation = useMutation({
    mutationFn: async ({ userId, duration, reason }: { userId: number; duration: number; reason: string }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/mute`, { duration, reason });
      if (!res.ok) throw new Error("Failed to mute user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User muted successfully",
      });
      setMuteDialogOpen(false);
      setSelectedMuteUser(null);
      setMuteReason("");
      setMuteDuration("60");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unmuteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/users/${userId}/unmute`);
      if (!res.ok) throw new Error("Failed to unmute user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User unmuted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unsuspendUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/users/${userId}/unsuspend`);
      if (!res.ok) throw new Error("Failed to unsuspend user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User unsuspended successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleMuteClick = (user: User, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMuteReason("");
    setMuteDuration("60");
    setSelectedMuteUser(user);
    setMuteDialogOpen(true);
  };

  const handleMuteDialogClose = () => {
    setMuteDialogOpen(false);
    setSelectedMuteUser(null);
    setMuteReason("");
    setMuteDuration("60");
  };

  if (!isAdmin && !isModerator) {
    return null;
  }

  if (isLoading) {
    return <div>Loading users...</div>;
  }

  const UserCard = ({ user, showRoleSelect = true }: { user: User; showRoleSelect?: boolean }) => {
    return (
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div>
          <p className="font-medium">{user.username}</p>
          <p className="text-sm text-muted-foreground">
            Role: {user.role}
          </p>
          {user.muted && (
            <p className="text-sm text-orange-500">
              Muted until: {format(new Date(user.mutedUntil!), "PPp")}
              <br />
              Reason: {user.mutedReason}
            </p>
          )}
        </div>
        {isAdmin && showRoleSelect && user.id !== currentUser?.id && (
          <div className="flex items-center gap-2">
            <Select onValueChange={(value) => setSelectedRole(value)} defaultValue={user.role}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(UserRole).map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                if (selectedRole) {
                  updateRoleMutation.mutate({
                    userId: user.id,
                    role: selectedRole,
                  });
                }
              }}
              disabled={updateRoleMutation.isPending}
            >
              Update Role
            </Button>
            {!user.muted ? (
              <Dialog open={muteDialogOpen && selectedMuteUser?.id === user.id} onOpenChange={setMuteDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" onClick={(e) => handleMuteClick(user, e)}>
                    Mute
                  </Button>
                </DialogTrigger>
                <DialogContent onEscapeKeyDown={handleMuteDialogClose} onInteractOutside={handleMuteDialogClose}>
                  <DialogHeader>
                    <DialogTitle>Mute User</DialogTitle>
                    <DialogDescription>
                      Set the duration and reason for muting {user.username}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Duration (minutes)</label>
                      <Input
                        type="number"
                        value={muteDuration}
                        onChange={(e) => setMuteDuration(e.target.value)}
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Reason</label>
                      <Input
                        value={muteReason}
                        onChange={(e) => setMuteReason(e.target.value)}
                        placeholder="Reason for muting"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleMuteDialogClose}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      onClick={() => {
                        if (muteReason.trim() && parseInt(muteDuration) > 0 && selectedMuteUser) {
                          muteUserMutation.mutate({
                            userId: selectedMuteUser.id,
                            duration: parseInt(muteDuration),
                            reason: muteReason,
                          });
                        }
                      }}
                      disabled={muteUserMutation.isPending || !muteReason.trim() || parseInt(muteDuration) <= 0}
                    >
                      {muteUserMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Mute User
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <Button
                variant="outline"
                onClick={() => unmuteUserMutation.mutate(user.id)}
                disabled={unmuteUserMutation.isPending}
              >
                {unmuteUserMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Unmute
              </Button>
            )}
            <Dialog open={selectedUser?.id === user.id} onOpenChange={(open) => !open && setSelectedUser(null)}>
              <DialogTrigger asChild>
                <Button variant="destructive" onClick={() => setSelectedUser(user)}>
                  Suspend
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Suspend User</DialogTitle>
                  <DialogDescription>
                    Please provide a reason for suspending {user.username}
                  </DialogDescription>
                </DialogHeader>
                <Input
                  placeholder="Suspension reason"
                  value={suspensionReason}
                  onChange={(e) => setSuspensionReason(e.target.value)}
                />
                <DialogFooter>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (suspensionReason.trim()) {
                        suspendUserMutation.mutate({
                          userId: user.id,
                          reason: suspensionReason,
                        });
                      }
                    }}
                    disabled={suspendUserMutation.isPending}
                  >
                    {suspendUserMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Suspend User
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Admins Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-primary">Administrators</h3>
        <div className="space-y-4">
          {admins.map((user) => (
            <UserCard key={user.id} user={user} showRoleSelect={true} />
          ))}
          {admins.length === 0 && (
            <p className="text-sm text-muted-foreground">No administrators found</p>
          )}
        </div>
      </div>

      {/* Moderators Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-blue-500">Moderators</h3>
        <div className="space-y-4">
          {moderators.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
          {moderators.length === 0 && (
            <p className="text-sm text-muted-foreground">No moderators found</p>
          )}
        </div>
      </div>

      {/* Regular Users Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Regular Users</h3>
        <div className="space-y-4">
          {activeUsers.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
          {activeUsers.length === 0 && (
            <p className="text-sm text-muted-foreground">No regular users found</p>
          )}
        </div>
      </div>

      {/* Suspended Users Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-destructive">Suspended Users</h3>
        <div className="space-y-4">
          {suspendedUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-4 border border-destructive/50 rounded-lg bg-destructive/5"
            >
              <div>
                <p className="font-medium">{user.username}</p>
                <p className="text-sm text-muted-foreground">
                  Role: {user.role}
                </p>
                <p className="text-sm text-destructive mt-1">
                  Suspended: {format(new Date(user.suspendedAt!), "PPp")}
                </p>
                <p className="text-sm text-destructive">
                  Reason: {user.suspendedReason}
                </p>
              </div>
              {isAdmin && (
                <Button
                  variant="outline"
                  onClick={() => unsuspendUserMutation.mutate(user.id)}
                  disabled={unsuspendUserMutation.isPending}
                >
                  {unsuspendUserMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Unsuspend
                </Button>
              )}
            </div>
          ))}
          {suspendedUsers.length === 0 && (
            <p className="text-sm text-muted-foreground">No suspended users</p>
          )}
        </div>
      </div>
    </div>
  );
}