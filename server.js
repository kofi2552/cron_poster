// server.mjs
import express from "express";
import dotenv from "dotenv";
import cron from "node-cron";
import { publishDuePosts } from "./cron.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware for auth
app.use(express.json());

app.get("/run-cron", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (authHeader !== `Bearer ${process.env.POST_API_TOKEN}`) {
    return res
      .status(401)
      .json({ error: "Unauthorized — invalid or missing token" });
  }

  await publishDuePosts();
  res.json({ success: true, message: "Cron executed successfully" });
});

cron.schedule("* * * * *", async () => {
  console.log("⏰ Running cron automatically every minute...");
  await publishDuePosts();
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
