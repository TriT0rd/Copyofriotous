import { signToken } from "./src/lib/auth.ts";
import { getSql } from "./src/lib/db.ts";

async function main() {
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  // sign token with "customer" role to simulate stale token
  const payload = `usr_mtfemwmm_9g0xx:princevekariya9898@gmail.com:customer:${expiresAt}`;
  const token = btoa(payload);

  const res = await fetch("http://localhost:3000/_server/?_serverFnId=checkIsAdmin&_serverFnName=checkIsAdmin", {
    headers: {
      cookie: `riotous_session=${token}`
    }
  });
  
  const text = await res.text();
  console.log("Response:", text);
}
main();
