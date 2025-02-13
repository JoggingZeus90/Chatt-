
import { useQuery } from "@tanstack/react-query";

export function OnlineCount({ roomId }: { roomId: number }) {
  const { data: members } = useQuery({
    queryKey: [`/api/rooms/${roomId}/members`],
    refetchInterval: 500,
  });

  const onlineCount = members?.filter(member => member.isOnline).length || 0;
  const totalCount = members?.length || 0;

  return (
    <>{onlineCount} online • {totalCount} members</>
  );
}
