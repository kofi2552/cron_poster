// db/connection.mjs
import { Sequelize } from "sequelize";
import dotenv from "dotenv";
import { Buffer } from "buffer";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const caCert = process.env.AIVEN_CA_CERT
  ? Buffer.from(process.env.AIVEN_CA_CERT, "base64").toString("utf-8")
  : null;

const sequelize = new Sequelize({
  username: process.env.AIVEN_DB_USERNAME,
  password: process.env.AIVEN_DB_PASSWORD,
  host: process.env.AIVEN_DB_HOST,
  port: process.env.AIVEN_DB_PORT,
  database: "defaultdb",
  dialect: "postgres",
  dialectModule: pg,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  dialectOptions: caCert
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: true,
          ca: caCert,
        },
      }
    : {},
  logging: false,
});

sequelize
  .authenticate()
  .then(() => console.log("Aiven DB connected successfully ✅"))
  .catch((error) => console.error("Aiven DB connection error ❌:", error));

export default sequelize;
