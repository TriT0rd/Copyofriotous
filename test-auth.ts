import { decodeToken } from "./src/lib/auth.ts";
import { getSql } from "./src/lib/db.ts";

async function main() {
  const sql = getSql();
  const rows = await sql`SELECT * FROM profiles WHERE email = 'princevekariya9898@gmail.com'`;
  console.log("DB User:", rows[0]);
}
main();
