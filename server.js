// server.mjs
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import { publishDuePosts } from "./cron.js";
import sequelize from "./db/connection.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(
  cors({
    origin: [
      "https://postpilot.tudlin.com",
      "http://localhost:3000",
      "https://postpilot-sage.vercel.app",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// Middleware for auth
app.use(express.json());

app.get("/db-status", async (req, res) => {
  try {
    console.log(
      "🔄 Checking database connection..............................................................."
    );
    await sequelize.authenticate();
    console.log(
      "✅ Database connection initialized successfully....................................."
    );
    res.json({ success: true, message: "Database connected successfully" });
  } catch (error) {
    console.error(
      "❌ Database connection failed.........................:",
      error.message
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

cron.schedule("* * * * *", async () => {
  console.log("⏰ Running cron automatically every minute...");
  await publishDuePosts();
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
