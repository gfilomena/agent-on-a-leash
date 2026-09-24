// Settings from the root .env (loaded by `node --env-file`). Never log the key.

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

export const config = {
  baseUrl: required("LEASH_BASE_URL").replace(/\/+$/, ""),
  teamKey: required("TEAM_API_KEY"),
  openaiKey: process.env.OPENAI_API_KEY?.trim() || null,
  openaiModel: process.env.OPENAI_MODEL?.trim() || null,
  engineVersion: "compass-0.1",
};
