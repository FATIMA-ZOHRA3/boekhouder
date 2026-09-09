import { apiRequest } from "./api";
import type { Task } from "@/types/api";

// GET /api/tasks — scoped to session.userId for a client caller (staff
// can pass ?clientId= to see one client's tasks, but the mobile Tasks
// screen is client-only for now — see app/tasks/index.tsx). No `date`
// filter passed here: the client screen shows everything upcoming plus
// overdue, sorted, rather than a single-day agenda like the bookkeeper's
// web Tasks/calendar view.
export function getTasks() {
  return apiRequest<Task[]>("/api/tasks");
}

// POST /api/tasks — a bookkeeper/admin can create a task for another user
// via `userId` (ignored server-side for a client caller, who can only
// create tasks for themselves — see src/app/api/tasks/route.ts). Used by
// the "Create task from this" action in a conversation, seeded from the
// AI-proposed title/description (see services/ai.ts summarizeTask) —
// summarizeTask never creates the task itself, this call is the
// bookkeeper's explicit confirmation step.
export function createTask(params: {
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  userId?: string;
  conversationId?: string;
  sourceType?: string;
}) {
  return apiRequest<Task>("/api/tasks", { method: "POST", body: params });
}

// PATCH /api/tasks/[id] only checks ownership (userId === session.userId)
// server-side, not a specific permission — so a client can mark their own
// task complete even though CLIENT_PERMISSIONS only grants task.read
// (matches what the backend already allows; see src/app/api/tasks/[id]/route.ts).
export function setTaskCompleted(id: string, completed: boolean) {
  return apiRequest<Task>(`/api/tasks/${id}`, {
    method: "PATCH",
    body: { completed },
  });
}
