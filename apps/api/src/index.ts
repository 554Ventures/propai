import "dotenv/config";
import app from "./app.js";
import { startWeeklyUserContextRegeneration } from "./lib/ai/user-context-service.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

app.listen(port, host, () => {
  console.log(`PropAI API running on http://${host}:${port}`);
  startWeeklyUserContextRegeneration();
});
