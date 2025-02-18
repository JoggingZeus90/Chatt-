import { User } from "@shared/schema";
import { useEffect, useRef } from "react";

interface MentionListProps {
  users: User[];
  onSelect: (username: string) => void;
  onClose: () => void;
  position: { top: number; left: number };
  filter: string;
}

export function MentionList({ users, onSelect, onClose, position, filter }: MentionListProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const filteredUsers = users?.filter(user => 
    user.username.toLowerCase().includes(filter.toLowerCase())
  ) || [];

  if (filteredUsers.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute z-50 w-64 max-h-48 overflow-y-auto bg-background border rounded-md shadow-lg"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      {filteredUsers.map((user) => (
        <div
          key={user.id}
          className="px-4 py-2 hover:bg-accent cursor-pointer"
          onClick={() => {
            onSelect(user.username);
            onClose();
          }}
        >
          {user.username}
        </div>
      ))}
    </div>
  );
}
