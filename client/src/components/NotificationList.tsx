import { useEffect, useState } from "react";
import api from "../services/api";

interface AppNotification {
  _id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export function useNotificationFeed() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  async function load() {
    if (!localStorage.getItem("renta_token")) return;
    try {
      const response = await api.get("/notifications");
      setItems(response.data.notifications ?? []);
      setUnread(response.data.unread ?? 0);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, []);

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    load();
  }

  return { items, unread, markRead };
}

export function NotificationList({
  items,
  onRead,
}: {
  items: AppNotification[];
  onRead: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p>No notifications yet.</p>;
  }

  return (
    <div>
      {items.map((item) => (
        <button
          key={item._id}
          type="button"
          onClick={() => onRead(item._id)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            marginBottom: 10,
            padding: 12,
            borderRadius: 12,
            border: "1px solid #d4dcda",
            background: item.read ? "#f7f6f1" : "#ffffff",
            fontWeight: item.read ? 500 : 700,
          }}
        >
          <strong>{item.title}</strong>
          <span style={{ display: "block", fontWeight: 500 }}>{item.body}</span>
        </button>
      ))}
    </div>
  );
}
