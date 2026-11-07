// In-app notifications (Phase 7, P1; blueprint §5.2 I). In-app is the baseline;
// email (and phone push, once installed) are sent by the backend.
import type { ISODateTime, UUID } from "./types";

export type NotificationCategory = "matches" | "tournaments" | "bookings" | "clubs" | "friends";

export interface AppNotification {
  id: UUID;
  category: NotificationCategory;
  /** e.g. "result_to_confirm", "result_official". */
  type: string;
  title: string;
  body: string;
  /** Where tapping it goes, inside the player app. */
  link: string | null;
  read_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface NotificationPage {
  items: AppNotification[];
  unread: number;
}

/** Per category: show it in the app, and send it by email. */
export type NotificationPreferences = Record<NotificationCategory, { in_app: boolean; email: boolean }>;
