import { DataTypes } from "sequelize";
import sequelize from "./connection.js";

// User model
export const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    linkedinProfileId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    linkedinAccessToken: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    linkedinTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    profession: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    industry: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isAdmin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isPremium: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    hasSeenOnboarding: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    premiumStartedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    premiumExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: true,
    tableName: "users",
  }
);

// SocialAccount model
export const SocialAccount = sequelize.define(
  "SocialAccount",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
    },
    platform: {
      type: DataTypes.ENUM(
        "linkedin",
        "facebook",
        "twitter",
        "tiktok",
        "instagram"
      ),
      allowNull: false,
    },
    platformUserId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    accessToken: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    refreshToken: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    profileName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    profilePictureUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: true,
    tableName: "social_accounts",
  }
);

// Topic model
export const Topic = sequelize.define(
  "Topic",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    postLength: {
      type: DataTypes.ENUM("short", "medium", "long"),
      defaultValue: "short",
      allowNull: true,
    },
    includeImage: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: true,
    tableName: "topics",
  }
);

// Schedule model
export const Schedule = sequelize.define(
  "Schedule",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User, // Assuming you have a User model
        key: "id",
      },
    },
    topicId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Topic,
        key: "id",
      },
    },
    platform: {
      type: DataTypes.ENUM(
        "linkedin",
        "facebook",
        "twitter",
        "tiktok",
        "instagram"
      ),
      defaultValue: "linkedin",
    },
    frequency: {
      type: DataTypes.ENUM("daily", "weekly", "monthly"),
      allowNull: false,
    },
    scheduledTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    dayOfWeek: {
      type: DataTypes.INTEGER,
      allowNull: true, // 0–6 for weekly schedules
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    lastGeneratedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: true,
    tableName: "schedules",
  }
);

// ScheduledPost model
export const ScheduledPost = sequelize.define(
  "ScheduledPost",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
    },
    scheduleId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Schedule,
        key: "id",
      },
    },
    topicId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Topic,
        key: "id",
      },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    scheduledFor: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "published", "failed"),
      defaultValue: "pending",
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    linkedinPostId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    platform: {
      type: DataTypes.ENUM(
        "linkedin",
        "facebook",
        "twitter",
        "tiktok",
        "instagram"
      ),
      defaultValue: "linkedin",
    },
    externalPostId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    retryCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    imageBase64: {
      type: DataTypes.TEXT, // Supports large base64 strings (Postgres TEXT represents generic unlimited length string)
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: true,
    tableName: "scheduled_posts",
  }
);

// Feedback model
export const Feedback = sequelize.define(
  "Feedback",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
    },
    type: {
      type: DataTypes.ENUM("suggestion", "issue", "other"),
      defaultValue: "suggestion",
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: true,
    tableName: "feedback",
  }
);

// Define associations
User.hasMany(Feedback, { foreignKey: "userId", onDelete: "CASCADE" });
Feedback.belongsTo(User, { foreignKey: "userId" });

User.hasMany(SocialAccount, { foreignKey: "userId", onDelete: "CASCADE" });
SocialAccount.belongsTo(User, { foreignKey: "userId" });

User.hasMany(Topic, { foreignKey: "userId", onDelete: "CASCADE" });
Topic.belongsTo(User, { foreignKey: "userId" });

// Explicit cascade for User -> Schedule to ensure clean deletion
User.hasMany(Schedule, { foreignKey: "userId", onDelete: "CASCADE" });

Topic.hasMany(Schedule, { foreignKey: "topicId", onDelete: "CASCADE" });
Schedule.belongsTo(Topic, { foreignKey: "topicId" });

// Explicit cascade for User -> ScheduledPost
User.hasMany(ScheduledPost, { foreignKey: "userId", onDelete: "CASCADE" });

Schedule.hasMany(ScheduledPost, {
  foreignKey: "scheduleId",
  onDelete: "CASCADE",
});

ScheduledPost.belongsTo(Schedule, { foreignKey: "scheduleId" });

Topic.hasMany(ScheduledPost, { foreignKey: "topicId", onDelete: "CASCADE" });
ScheduledPost.belongsTo(Topic, { foreignKey: "topicId" });

// ActivityLog model
export const ActivityLog = sequelize.define(
  "ActivityLog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    details: {
      type: DataTypes.TEXT, // Store JSON string or simple text
      allowNull: true,
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: false, // Only need creation time
    tableName: "activity_logs",
  }
);

User.hasMany(ActivityLog, { foreignKey: "userId", onDelete: "CASCADE" });
ActivityLog.belongsTo(User, { foreignKey: "userId" });
