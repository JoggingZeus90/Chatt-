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
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [muteReason, setMuteReason] = useState("");
  const [muteDuration, setMuteDuration] = useState("60"); // Default 60 minutes
  const [suspensionReason, setSuspensionReason] = useState("");

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

  const handleMuteSubmit = (userId: number) => {
    if (!muteReason.trim() || parseInt(muteDuration) <= 0) {
      toast({
        title: "Missing information",
        description: "Please provide both duration and reason for muting.",
        variant: "destructive",
      });
      return;
    }

    muteUserMutation.mutate({
      userId,
      duration: parseInt(muteDuration),
      reason: muteReason,
    });
  };

  const handleSuspendSubmit = (userId: number) => {
    if (!suspensionReason.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide a reason for suspension.",
        variant: "destructive",
      });
      return;
    }

    suspendUserMutation.mutate({
      userId,
      reason: suspensionReason,
    });
  };

  const UserCard = ({ user, showRoleSelect = true }: { user: User; showRoleSelect?: boolean }) => {
    const [selectedRole, setSelectedRole] = useState(user.role);
    const [isChangingRole, setIsChangingRole] = useState(false);
    const [isMuteDialogOpen, setIsMuteDialogOpen] = useState(false);
    const [isSuspendDialogOpen, setIsSuspendDialogOpen] = useState(false);

    const handleRoleChange = (newRole: string) => {
      setSelectedRole(newRole);
      setIsChangingRole(true);
    };

    const handleRoleUpdate = () => {
      if (selectedRole && selectedRole !== user.role) {
        updateRoleMutation.mutate({
          userId: user.id,
          role: selectedRole,
        });
      }
      setIsChangingRole(false);
    };

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
            <Select value={selectedRole} onValueChange={handleRoleChange}>
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
            {isChangingRole && (
              <Button
                variant="outline"
                onClick={handleRoleUpdate}
                disabled={updateRoleMutation.isPending}
              >
                {updateRoleMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Update Role
              </Button>
            )}
            {!user.muted ? (
              <Dialog open={isMuteDialogOpen} onOpenChange={setIsMuteDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    Mute
                  </Button>
                </DialogTrigger>
                <DialogContent>
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
                        disabled={muteUserMutation.isPending}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Reason</label>
                      <Input
                        value={muteReason}
                        onChange={(e) => setMuteReason(e.target.value)}
                        placeholder="Reason for muting"
                        disabled={muteUserMutation.isPending}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="default"
                      onClick={() => {
                        handleMuteSubmit(user.id);
                        if (muteUserMutation.isSuccess) {
                          setIsMuteDialogOpen(false);
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
            <Dialog open={isSuspendDialogOpen} onOpenChange={setIsSuspendDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive">
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
                  disabled={suspendUserMutation.isPending}
                />
                <DialogFooter>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      handleSuspendSubmit(user.id);
                      if (suspendUserMutation.isSuccess) {
                        setIsSuspendDialogOpen(false);
                      }
                    }}
                    disabled={suspendUserMutation.isPending || !suspensionReason.trim()}
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

  if (!isAdmin && !isModerator) {
    return null;
  }

  if (isLoading) {
    return <div>Loading users...</div>;
  }

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