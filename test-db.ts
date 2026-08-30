import { getSql } from "./src/lib/db.ts";
async function main() {
  const sql = getSql();
  const res = await sql`SELECT * FROM profiles WHERE email = 'princevekariya9898@gmail.com'`;
  console.log(res);
}
main();
