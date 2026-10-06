const base = process.env.BASE_URL ?? "http://127.0.0.1:8080";

export default async function globalSetup() {
  const response = await fetch(`${base}/api/health`).catch(() => null);
  if (!response?.ok) {
    throw new Error(`Desk is not healthy at ${base}. Start it with: docker compose up --build`);
  }
}
