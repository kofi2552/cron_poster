// db/connection.mjs
import { Sequelize } from "sequelize";
import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// ✅ Use Render DATABASE_URL
const sequelize = new Sequelize(process.env.RENDER_DATABASE_URL, {
  dialect: "postgres",
  dialectModule: pg,
  logging: false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // REQUIRED for Render
    },
  },
});

// Test connection once on startup
sequelize
  .authenticate()
  .then(() => console.log("Render PostgreSQL connected successfully ✅"))
  .catch((error) =>
    console.error("Render PostgreSQL connection error ❌:", error)
  );

export default sequelize;
