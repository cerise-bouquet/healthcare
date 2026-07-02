// Prisma Client belongs here after dependencies and migrations are installed.
// Keep database access behind module services; API route handlers should not
// mutate domain state directly.
export const db = {
  status: "not-initialized"
};
