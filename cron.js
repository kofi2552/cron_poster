import fetch from "node-fetch";
import { User, ScheduledPost, Schedule, Topic } from "./db/models.js";
import sequelize from "./db/connection.js";
import { GoogleGenAI, Modality } from "@google/genai";
import fs from "fs";
import { Op } from "sequelize";

const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;

// export async function publishDuePosts() {
//   const now = new Date();
//   console.log("🕒 Cron job started:", now.toISOString());

//   const outerTx = await sequelize.transaction();

//   try {
//     // Fetch all active schedules with topic + user
//     const schedules = await Schedule.findAll({
//       where: { isActive: true },
//       include: [
//         {
//           model: Topic,
//           include: [User],
//         },
//       ],
//       transaction: outerTx,
//     });

//     if (!schedules.length) {
//       console.log("⚠️ No active schedules found.");
//       await outerTx.commit();
//       return;
//     }

//     console.log(`📌 Found ${schedules.length} active schedules.`);

//     for (const schedule of schedules) {
//       const topic = schedule.Topic;
//       const user = topic?.User;

//       if (!user || !user.linkedinAccessToken) {
//         console.log("⚠️ Skipping schedule: user missing or no LinkedIn token.");
//         continue;
//       }

//       const PostUserId = user.linkedinProfileId;
//       const PostUserEmail = user.email;

//       // Extract scheduled time
//       const [hours, minutes] = schedule.scheduledTime.split(":").map(Number);

//       // Compute scheduled time for today
//       const scheduledDate = new Date();
//       scheduledDate.setHours(hours, minutes, 0, 0);

//       // Last time this schedule successfully posted
//       const lastGenerated = schedule.lastGeneratedAt || new Date(0);

//       let shouldPost = false;

//       // --- DAILY ---
//       if (schedule.frequency === "daily") {
//         // Post once per day — anytime after the scheduled hour
//         shouldPost = now >= scheduledDate && lastGenerated < scheduledDate;
//       }

//       // --- WEEKLY ---
//       else if (schedule.frequency === "weekly") {
//         const isToday = now.getDay() === schedule.dayOfWeek;
//         shouldPost =
//           isToday && now >= scheduledDate && lastGenerated < scheduledDate;
//       }

//       // --- MONTHLY ---
//       else if (schedule.frequency === "monthly") {
//         const isToday = now.getDate() === scheduledDate.getDate();
//         shouldPost =
//           isToday && now >= scheduledDate && lastGenerated < scheduledDate;
//       }

//       // If conditions fail, skip posting
//       if (!shouldPost) {
//         continue;
//       }

//       console.log(`🧠 Generating post for topic "${topic.title}"...`);

//       // Transaction for this posting operation
//       const innerTx = await sequelize.transaction();

//       try {
//         // 1) Generate content
//         const rawContent = await generateLinkedInPost(
//           topic.title,
//           topic.description ||
//             "Write a professional, engaging LinkedIn post related to this topic."
//         );

//         console.log("post content: ", rawContent);

//         // 2) Publish to LinkedIn
//         const content =
//           typeof rawContent === "string"
//             ? rawContent
//             : rawContent.post || JSON.stringify(rawContent);

//         const result = await publishToLinkedIn(
//           accessToken,
//           content, // ✅ now a string
//           PostUserId,
//           PostUserEmail
//         );

//         // console.log(
//         //   "post text content itself: ",
//         //   content,
//         //   "this: ",
//         //   content.post
//         // );

//         // 3) If successful, save in DB
//         if (result.success) {
//           await ScheduledPost.create(
//             {
//               scheduleId: schedule.id,
//               topicId: topic.id,
//               content: content,
//               scheduledFor: scheduledDate,
//               status: "published",
//               isActive: false,
//               publishedAt: now,
//               linkedinPostId: result.postId,
//               userId: user.id,
//             },
//             { transaction: innerTx }
//           );

//           // Update last posted timestamp
//           await schedule.update(
//             { lastGeneratedAt: now },
//             { transaction: innerTx }
//           );

//           await innerTx.commit();
//           console.log(`✅ Successfully posted: "${topic.title}"`);
//         } else {
//           await innerTx.rollback();
//           console.warn(`❌ Failed LinkedIn publish: ${result.error}`);
//         }
//       } catch (err) {
//         await innerTx.rollback();
//         console.error(`🚨 Error posting for "${topic.title}":`, err);
//       }
//     }

//     await outerTx.commit();
//     console.log("🎯 Finished checking schedules.");
//   } catch (error) {
//     await outerTx.rollback();
//     console.error("🚨 Fatal error in publishDuePosts:", error);
//   }
// }

export async function generateLinkedInPost(topic, description = "") {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const ImageApiKey = process.env.GOOGLE_IMAGE_GENERATION_API_KEY;

  const ai = new GoogleGenAI({ apiKey: ImageApiKey });

  try {
    // 1️⃣ Generate post text and image prompt
    const textResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Using the following template, generate an engaging LinkedIn-style post using the title "${topic}". 
                  Maintain the structure and this tone: ${description}. 
              
                  Follow these Requirements strictly:
                - Contrust a unique post title that captures attention not more than 150 characters.
                - The post should have a humanized body (with paragraphs if needed)  
                - Fit within these guidelines
                - The post must be relevant to LinkedIn audiences who are expected to be educational tech professionals or educational leaders.
                - Remove any greetings or sign-offs
                - Remove any extra headings or subtitles
                - Focus solely on the post content
                - Use a clear and concise writing style
                - Maximum 600 characters
                - Minimum 500 characters
                - Professional and engaging tone
                - Include relevant hashtags (2-3)
                - No emojis
                - Make it actionable or thought-provoking
                - Sound as human as possible

                Return only the post content, nothing else.`,
                },
              ],
            },
          ],
        }),
      }
    );

    const textData = await textResponse.json();

    if (!textResponse.ok) {
      throw new Error(
        `Gemini API Error: ${
          textData.error?.message || textResponse.statusText
        }`
      );
    }

    const post =
      textData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "No content generated.";

    //console.log("Generated post content:", post);

    // 2️⃣ Generate matching image
    // const imagePrompt = `Genrate a professional background image related to ${topic}. It should be suitable for a professional LinkedIn post. The style should be clean, modern, and visually appealing to educational tech professionals and leaders. Avoid using any text or logos in the image. Use a color palette that is engaging yet professional. Strict size: "1024x1024"`;

    // const imageResponse = await ai.models.generateContent({
    //   model: "gemini-2.0-flash-preview-image-generation",
    //   contents: imagePrompt,
    //   config: {
    //     responseModalities: [Modality.TEXT, Modality.IMAGE],
    //   },
    // });

    // let imageBase64 = null;

    // const candidates = imageResponse?.candidates || [];
    // for (const candidate of candidates) {
    //   const parts = candidate?.content?.parts || [];
    //   for (const part of parts) {
    //     if (part.inlineData?.data) {
    //       imageBase64 = part.inlineData.data;

    //       // Save a local copy (optional)
    //       const buffer = Buffer.from(imageBase64, "base64");
    //       fs.writeFileSync("linkedin-post-image.png", buffer);
    //       console.log("✅ Image saved as linkedin-post-image.png");

    //       break;
    //     }
    //   }
    //   if (imageBase64) break; // stop early if found
    // }

    // if (!imageBase64) {
    //   console.warn("⚠️ No base64 image found in Gemini response");
    // }

    // return { post, imageBase64 };
    return { post };
  } catch (error) {
    console.error("Gemini Image Generation Error:", error);
    throw new Error("Failed to generate AI content or image");
  }
}

// export async function publishToLinkedIn(
//   accessToken,
//   content,
//   PostuserId,
//   PostUserEmail
// ) {
//   //console.log("access token being used:", accessToken, PostuserId);

//   try {
//     let authorUrn = null;
//     let imageUrn = null;
//     const { post, imageBase64 } = content;

//     // ✅ If we already have the LinkedIn user ID stored
//     if (PostuserId) {
//       authorUrn = `urn:li:person:${PostuserId}`;
//     } else {
//       // ✅ Otherwise, fetch it from LinkedIn's /userinfo endpoint
//       const meResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//           "X-Restli-Protocol-Version": "2.0.0",
//         },
//       });

//       if (!meResponse.ok) {
//         const error = await meResponse.json();
//         throw new Error(
//           error.message || "Failed to fetch LinkedIn user profile"
//         );
//       }

//       const meData = await meResponse.json();
//       //console.log("LinkedIn user profile data:", meData);

//       if (!meData?.sub) {
//         throw new Error("Missing 'sub' field in LinkedIn profile data.");
//       }

//       authorUrn = `urn:li:person:${meData.sub}`;
//       console.log("LinkedIn author URN:", authorUrn);

//       // Optional: store the LinkedIn ID in your DB for next time
//       await User.update(
//         { linkedinProfileId: meData.sub },
//         { where: { email: PostUserEmail } }
//       );
//     }

//     function formatPostText(rawText) {
//       return rawText
//         .replace(/\r\n/g, "\n") // normalize line endings
//         .replace(/\n{3,}/g, "\n\n") // prevent too many blank lines
//         .trim();
//     }
//     const formattedPost = formatPostText(post);
//     // 🖼 Upload image if provided
//     if (imageBase64) {
//       //console.log("Uploading image to LinkedIn...");

//       // Step 1: Register upload
//       const registerRes = await fetch(
//         "https://api.linkedin.com/v2/assets?action=registerUpload",
//         {
//           method: "POST",
//           headers: {
//             Authorization: `Bearer ${accessToken}`,
//             "Content-Type": "application/json",
//           },
//           body: JSON.stringify({
//             registerUploadRequest: {
//               recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
//               owner: authorUrn,
//               serviceRelationships: [
//                 {
//                   relationshipType: "OWNER",
//                   identifier: "urn:li:userGeneratedContent",
//                 },
//               ],
//             },
//           }),
//         }
//       );

//       const registerData = await registerRes.json();

//       if (!registerRes.ok) {
//         throw new Error(
//           `Failed to register image upload: ${
//             registerData.message || registerRes.statusText
//           }`
//         );
//       }

//       const uploadUrl =
//         registerData.value.uploadMechanism[
//           "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
//         ].uploadUrl;
//       imageUrn = registerData.value.asset;

//       // Step 2: Upload image
//       const buffer = Buffer.from(imageBase64, "base64");
//       const uploadRes = await fetch(uploadUrl, {
//         method: "PUT",
//         headers: { Authorization: `Bearer ${accessToken}` },
//         body: buffer,
//       });

//       if (!uploadRes.ok) {
//         throw new Error(`Failed to upload image: ${uploadRes.statusText}`);
//       }

//       //console.log("✅ Image uploaded:", imageUrn);
//     }

//     // 📝 Step 3: Publish post
//     const postBody = {
//       author: authorUrn,
//       lifecycleState: "PUBLISHED",
//       specificContent: {
//         "com.linkedin.ugc.ShareContent": {
//           shareCommentary: { text: formattedPost },
//           shareMediaCategory: imageUrn ? "IMAGE" : "NONE",
//           media: imageUrn ? [{ status: "READY", media: imageUrn }] : [],
//         },
//       },
//       visibility: {
//         "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
//       },
//     };

//     // ✅ Now create the LinkedIn post
//     const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
//       method: "POST",
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//         "Content-Type": "application/json",
//         "X-Restli-Protocol-Version": "2.0.0",
//       },
//       body: JSON.stringify(postBody),
//     });

//     // response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
//     //   method: "POST",
//     //   headers: {
//     //     Authorization: `Bearer ${accessToken}`,
//     //     "Content-Type": "application/json",
//     //     "X-Restli-Protocol-Version": "2.0.0",
//     //   },
//     //   body: JSON.stringify({
//     //     author: authorUrn,
//     //     lifecycleState: "PUBLISHED",
//     //     specificContent: {
//     //       "com.linkedin.ugc.ShareContent": {
//     //         shareCommentary: { text: content },
//     //         shareMediaCategory: "NONE",
//     //       },
//     //     },
//     //     visibility: {
//     //       "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
//     //     },
//     //   }),
//     // });

//     if (!postRes.ok) {
//       const error = await postRes.json();
//       throw new Error(error.message || "Failed to publish to LinkedIn");
//     }

//     const data = await postRes.json();
//     console.log("✅ LinkedIn post created:", data);

//     return { success: true, postId: data.id };
//   } catch (error) {
//     console.error("🚨 LinkedIn publishing error:", error);
//     return { success: false, error: error.message };
//   }
// }

export async function publishToLinkedIn(
  accessToken,
  content,
  PostuserId,
  PostUserEmail
) {
  console.log("posting content: ", content);

  try {
    let authorUrn = null;

    // ✅ Use stored LinkedIn user ID if available
    if (PostuserId) {
      authorUrn = `urn:li:person:${PostuserId}`;
    } else {
      // ✅ Otherwise, fetch user info from LinkedIn
      const meResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      });

      if (!meResponse.ok) {
        const error = await meResponse.json();
        throw new Error(
          error.message || "Failed to fetch LinkedIn user profile"
        );
      }

      const meData = await meResponse.json();

      if (!meData?.sub) {
        throw new Error("Missing 'sub' field in LinkedIn profile data.");
      }

      authorUrn = `urn:li:person:${meData.sub}`;
      console.log("LinkedIn author URN:", authorUrn);

      // Optional: persist LinkedIn ID for next time
      await User.update(
        { linkedinProfileId: meData.sub },
        { where: { email: PostUserEmail } }
      );
    }

    function formatPostText(rawText) {
      return rawText
        .replace(/\*/g, "")
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    let postText;

    if (typeof content === "string") {
      postText = content;
    } else if (
      typeof content === "object" &&
      typeof content.post === "string"
    ) {
      postText = content.post;
    } else {
      console.warn(
        "⚠️ content was not a string; stringifying fallback:",
        content
      );
      postText = JSON.stringify(content);
    }

    const formattedPost = formatPostText(postText);

    // 📝 Build text-only LinkedIn post body
    const postBody = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: formattedPost },
          shareMediaCategory: "NONE", // 🚫 no image
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    // ✅ Publish the post
    const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(postBody),
    });

    if (!postRes.ok) {
      const error = await postRes.json();
      throw new Error(error.message || "Failed to publish to LinkedIn");
    }

    const data = await postRes.json();
    console.log("✅ LinkedIn post created:", data);

    return { success: true, postId: data.id };
  } catch (error) {
    console.error("🚨 LinkedIn publishing error:", error);
    return { success: false, error: error.message };
  }
}

// -------------------------------------------
// CRON JOB: Publish all due scheduled posts
// -------------------------------------------
export async function publishDuePosts() {
  const now = new Date();
  console.log("🕒 Cron job started:", now.toISOString());

  // 1. Fetch ALL pending posts that are due
  const duePosts = await ScheduledPost.findAll({
    where: {
      status: "pending",
      scheduledFor: { [Op.lte]: now },
    },
    include: [
      {
        model: Schedule,
        include: [
          {
            model: Topic,
            include: [User],
          },
        ],
      },
    ],
  });

  if (!duePosts.length) {
    console.log("⚠️ No due scheduled posts.");
    return;
  }

  console.log(`📌 Found ${duePosts.length} due scheduled posts.`);

  for (const job of duePosts) {
    const schedule = job.Schedule;
    const topic = schedule.Topic;
    const user = topic.User;

    if (!user?.linkedinAccessToken) {
      console.log(`⚠️ Skipping ${topic.title} — user has no LinkedIn token.`);
      continue;
    }

    // -------------------------------------------
    // STEP 1 — Generate Content
    // -------------------------------------------
    let rawContent;
    try {
      rawContent = await generateLinkedInPost(
        topic.title,
        topic.description || "Write a professional LinkedIn post on this topic."
      );
    } catch (err) {
      console.error("🔥 Error generating content:", err);
      continue;
    }

    // Ensure string content
    const content =
      typeof rawContent === "string"
        ? rawContent
        : rawContent.post || JSON.stringify(rawContent);

    // -------------------------------------------
    // STEP 2 — Publish to LinkedIn
    // -------------------------------------------
    const publishResult = await publishToLinkedIn(
      accessToken,
      content,
      user.linkedinProfileId,
      user.email
    );

    if (!publishResult.success) {
      console.log(`❌ Failed publishing: ${publishResult.error}`);

      await job.update({
        status: "failed",
        errorMessage: publishResult.error,
        retryCount: job.retryCount + 1,
      });

      continue;
    }

    console.log(`✅ Posted to LinkedIn: ${topic.title}`);

    // -------------------------------------------
    // STEP 3 — Mark this job as published
    // -------------------------------------------
    await job.update({
      status: "published",
      content,
      linkedinPostId: publishResult.postId,
      publishedAt: now,
    });

    // -------------------------------------------
    // STEP 4 — Create the next scheduled post
    // -------------------------------------------
    const nextScheduledDate = calculateNextDate(schedule);

    await ScheduledPost.create({
      scheduleId: schedule.id,
      topicId: topic.id,
      userId: user.id,
      content: "", // content will be generated when due
      status: "pending",
      scheduledFor: nextScheduledDate,
    });

    console.log(
      `📅 Next post scheduled for ${topic.title}:`,
      nextScheduledDate.toISOString()
    );
  }

  console.log("🎉 Finished processing due posts.");
}

// --------------------------------------------------
// Calculate next scheduledFor date based on frequency
// --------------------------------------------------
function calculateNextDate(schedule) {
  const now = new Date();
  const [hours, minutes] = schedule.scheduledTime.split(":").map(Number);

  // DAILY
  if (schedule.frequency === "daily") {
    const next = new Date();
    next.setDate(now.getDate() + 1);
    next.setHours(hours, minutes, 0, 0);
    return next;
  }

  // WEEKLY
  if (schedule.frequency === "weekly") {
    if (schedule.dayOfWeek == null) {
      throw new Error("Weekly schedule missing dayOfWeek");
    }

    const next = new Date();
    const diff = (schedule.dayOfWeek + 7 - now.getDay()) % 7 || 7;
    next.setDate(now.getDate() + diff);
    next.setHours(hours, minutes, 0, 0);
    return next;
  }

  // MONTHLY
  if (schedule.frequency === "monthly") {
    if (!schedule.dayOfMonth) {
      throw new Error("Monthly schedule requires dayOfMonth field");
    }

    const next = new Date();
    next.setMonth(now.getMonth() + 1);
    next.setDate(schedule.dayOfMonth);
    next.setHours(hours, minutes, 0, 0);
    return next;
  }

  throw new Error(`Unknown schedule frequency: ${schedule.frequency}`);
}
