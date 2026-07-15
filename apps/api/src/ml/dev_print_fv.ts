import { buildUserFeatureVector } from "../ml/features.js";

async function main() {
  const fv = await buildUserFeatureVector("demo-user", 90);
  process.stdout.write(JSON.stringify(fv));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
