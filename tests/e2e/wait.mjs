const base = process.env.BASE_URL ?? "http://127.0.0.1:8080";
const deadline = Date.now() + 180_000;

while (Date.now() < deadline) {
  try {
    const response = await fetch(`${base}/api/health`);
    if (response.ok) {
      console.log(`desk ready at ${base}`);
      process.exit(0);
    }
  } catch {
    // The stack is still starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

console.error(`desk did not become healthy at ${base}`);
process.exit(1);
