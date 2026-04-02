// db/connection.mjs
import { Sequelize } from "sequelize";
import dotenv from "dotenv";

// Load env vars
dotenv.config();

const dialectOptions = {};
// Only enable SSL if the environment variable DB_SSL is set to 'true'
if (process.env.DB_SSL === "true") {
  dialectOptions.ssl = {
    require: true,
    rejectUnauthorized: false,
  };
}
const sequelize = new Sequelize(process.env.DB_URI, {
  dialect: "postgres",
  protocol: "postgres",
  dialectOptions: dialectOptions, // Use the conditional options
  logging: console.log,
});

export default sequelize;
