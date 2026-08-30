const origServe = globalThis.serve;
console.log("Starting script");
import('./.output/server/index.mjs').then(m => {
  console.log("Imported index.mjs");
}).catch(console.error);
