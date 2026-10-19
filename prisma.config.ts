import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generating the client does not need a database, so DATABASE_URL is optional here;
  // migrate commands will fail with a clear error if it is missing.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
