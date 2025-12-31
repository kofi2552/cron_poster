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

const {
  RENDER_DB_HOST,
  RENDER_DB_PORT,
  RENDER_DB_USERNAME,
  RENDER_DB_PASSWORD,
  RENDER_DB_NAME,
} = process.env;

// 🔒 Defensive check (prevents silent crashes)
if (
  !RENDER_DB_HOST ||
  !RENDER_DB_PORT ||
  !RENDER_DB_USERNAME ||
  !RENDER_DB_PASSWORD ||
  !RENDER_DB_NAME
) {
  throw new Error(
    "❌ Missing Render DB environment variables. Check Render dashboard."
  );
}

const sequelize = new Sequelize(
  RENDER_DB_NAME,
  RENDER_DB_USERNAME,
  RENDER_DB_PASSWORD,
  {
    host: RENDER_DB_HOST,
    port: Number(RENDER_DB_PORT),
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
  }
);

// Test connection once on startup
sequelize
  .authenticate()
  .then(() => console.log("Render PostgreSQL connected successfully ✅"))
  .catch((error) =>
    console.error("Render PostgreSQL connection error ❌:", error)
  );

export default sequelize;

// ✅ Use Render DATABASE_URL
// const sequelize = new Sequelize(process.env.RENDER_DATABASE_URL, {
//   dialect: "postgres",
//   dialectModule: pg,
//   logging: false,
//   pool: {
//     max: 5,
//     min: 0,
//     acquire: 30000,
//     idle: 10000,
//   },
//   dialectOptions: {
//     ssl: {
//       require: true,
//       rejectUnauthorized: false, // REQUIRED for Render
//     },
//   },
// });
