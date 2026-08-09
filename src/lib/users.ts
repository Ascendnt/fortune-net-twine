import type { Role } from "./types";

/**
 * The people who use the system.
 *
 * Until now "who is doing this" was derived from whichever role was selected, so every sales rep
 * was the same imaginary person. Approvals, overrides and the activity log all name individuals,
 * and a name that is really a role label makes the audit trail worthless the moment two people
 * share a job.
 */
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** A leaver is deactivated rather than deleted: their name still appears on past approvals. */
  active: boolean;
}

export const USERS: User[] = [
  { id: "USR-001", name: "Grace Tan", email: "grace.tan@fortunenet.ph", role: "sales_rep", active: true },
  { id: "USR-002", name: "Marcus Reyes", email: "marcus.reyes@fortunenet.ph", role: "sales_rep", active: true },
  { id: "USR-003", name: "Alicia Santos", email: "alicia.santos@fortunenet.ph", role: "sales_manager", active: true },
  { id: "USR-004", name: "Elena Vasquez", email: "elena.vasquez@fortunenet.ph", role: "factory_technical", active: true },
  { id: "USR-005", name: "Daniel Cruz", email: "daniel.cruz@fortunenet.ph", role: "finance", active: true },
  { id: "USR-006", name: "Rosa Lim", email: "rosa.lim@fortunenet.ph", role: "finance", active: true },
  { id: "USR-007", name: "Ronaldo Cruz", email: "ronaldo.cruz@fortunenet.ph", role: "logistics", active: true },
  { id: "USR-008", name: "Teresa Uy", email: "teresa.uy@fortunenet.ph", role: "management", active: true },
  { id: "USR-009", name: "Benjamin Ong", email: "benjamin.ong@fortunenet.ph", role: "management", active: true },
  { id: "USR-010", name: "System Administrator", email: "admin@fortunenet.ph", role: "admin", active: true },
];

/** Active users only, sorted by name, for anywhere a person has to be chosen. */
export function selectableUsers(users: User[]): User[] {
  return users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name));
}

export function findUser(users: User[], id: string | null): User | undefined {
  return id ? users.find((u) => u.id === id) : undefined;
}
