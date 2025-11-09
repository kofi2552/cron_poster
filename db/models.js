import { DataTypes } from "sequelize";
import sequelize from "./connection.js";

export const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    linkedinProfileId: { type: DataTypes.STRING },
    linkedinAccessToken: { type: DataTypes.TEXT },
    linkedinTokenExpiresAt: { type: DataTypes.DATE },
  },
  { timestamps: true, tableName: "users" }
);

export const Topic = sequelize.define(
  "Topic",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
  },
  { timestamps: true, tableName: "topics" }
);

export const Schedule = sequelize.define(
  "Schedule",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: { type: DataTypes.UUID, allowNull: false },
    topicId: { type: DataTypes.UUID, allowNull: false },
    frequency: {
      type: DataTypes.ENUM("daily", "weekly", "monthly"),
      allowNull: false,
    },
    scheduledTime: { type: DataTypes.TIME, allowNull: false },
    dayOfWeek: { type: DataTypes.INTEGER },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    lastGeneratedAt: { type: DataTypes.DATE },
  },
  { timestamps: true, tableName: "schedules" }
);

export const ScheduledPost = sequelize.define(
  "ScheduledPost",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: { type: DataTypes.UUID, allowNull: false },
    scheduleId: { type: DataTypes.UUID, allowNull: false },
    topicId: { type: DataTypes.UUID, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    scheduledFor: { type: DataTypes.DATE, allowNull: false },
    status: {
      type: DataTypes.ENUM("pending", "published", "failed"),
      defaultValue: "pending",
    },
    publishedAt: { type: DataTypes.DATE },
    linkedinPostId: { type: DataTypes.STRING },
    retryCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    errorMessage: { type: DataTypes.TEXT },
  },
  { timestamps: true, tableName: "scheduled_posts" }
);

// 🔗 Associations
User.hasMany(Topic, { foreignKey: "userId" });
Topic.belongsTo(User, { foreignKey: "userId" });

Topic.hasMany(Schedule, { foreignKey: "topicId" });
Schedule.belongsTo(Topic, { foreignKey: "topicId" });

Schedule.hasMany(ScheduledPost, { foreignKey: "scheduleId" });
ScheduledPost.belongsTo(Schedule, { foreignKey: "scheduleId" });

Topic.hasMany(ScheduledPost, { foreignKey: "topicId" });
ScheduledPost.belongsTo(Topic, { foreignKey: "topicId" });
