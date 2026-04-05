// server.mjs
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import { publishDuePosts, cleanupExpiredFreeUserData, refreshFacebookTokens } from "./cron.js";
import sequelize from "./db/connection.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(
  cors({
    origin: [
      "https://postpilot.onl",
      "https://postpilot.tudlin.com",
      "https://postpilot-sage.vercel.app",
      "https://localhost:3000",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

// Middleware for auth
app.use(express.json());

app.get("/db-status", async (req, res) => {
  try {
    console.log(
      "🔄 Checking cron system online ...............................................................",
    );
    // await sequelize.authenticate();
    // console.log(
    //   "✅ Database connection initialized successfully.....................................",
    // );
    res.json({ success: true, message: "Cron System Active" });
  } catch (error) {
    console.error(
      "❌ Cron system connection failed.........................:",
      error.message,
    );
    res.status(500).json({ success: false, error: error.message });
  }
});

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

app.get("/run-cleanup", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (authHeader !== `Bearer ${process.env.POST_API_TOKEN}`) {
    return res
      .status(401)
      .json({ error: "Unauthorized" });
  }

  await cleanupExpiredFreeUserData();
  res.json({ success: true, message: "Cleanup executed successfully" });
});

cron.schedule("* * * * *", async () => {
  console.log("⏰ Running post-publishing cron every minute...");
  await publishDuePosts();
});

// Daily cleanup and token refresh at 1:00 AM
cron.schedule("0 1 * * *", async () => {
  console.log("⏰ Running daily 30-day data cleanup and token refresh...");
  await cleanupExpiredFreeUserData();
  await refreshFacebookTokens();
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
