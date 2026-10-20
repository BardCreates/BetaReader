import { test } from "node:test";
import assert from "node:assert/strict";
import { withStrictSsl } from "./dbUrl";

test("Neon-style sslmode=require becomes verify-full, other params kept", () => {
  assert.equal(
    withStrictSsl("postgresql://u:p@ep-x.neon.tech/db?sslmode=require&channel_binding=require"),
    "postgresql://u:p@ep-x.neon.tech/db?sslmode=verify-full&channel_binding=require",
  );
  assert.equal(withStrictSsl("postgresql://h/db?channel_binding=require&sslmode=prefer"), "postgresql://h/db?channel_binding=require&sslmode=verify-full");
});

test("urls without sslmode, or already strict, are unchanged", () => {
  assert.equal(withStrictSsl("postgresql://localhost:5432/db"), "postgresql://localhost:5432/db");
  assert.equal(withStrictSsl("postgresql://h/db?sslmode=verify-full"), "postgresql://h/db?sslmode=verify-full");
  assert.equal(withStrictSsl("postgresql://h/db?sslmode=disable"), "postgresql://h/db?sslmode=disable");
  assert.equal(withStrictSsl(undefined), undefined);
});
