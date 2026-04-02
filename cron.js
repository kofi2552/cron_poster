import fetch from "node-fetch";
import { User, ScheduledPost, Schedule, Topic, SocialAccount, UserAudio } from "./db/models.js";
import { Op } from "sequelize";
import { Buffer } from "buffer";
import { createCompositeImageCloudinary, createTikTokVideo, deleteCloudinaryResources } from "./cloudinary.js";

// const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;

// https://image-api.dev-kyde.workers.dev/

export async function generateLinkedInPost(
  topic,
  postLength,
  description = "",
  includeImage = false,
  userPersona,
  previousPosts = []
) {
  const textApiKey = process.env.GROQ_API_KEY;
  const imageApiKey = process.env.CF_IMAGE_GENERATION_API_KEY;

  let post = null;
  let imageBase64 = null;

  // --------------------------------------------------
  // 1️⃣ TEXT GENERATION (CRITICAL — MUST SUCCEED)
  // --------------------------------------------------
  try {
    const textResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${textApiKey}`, // ✅ FIXED
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content: "You are a professional LinkedIn content writer.",
            },
            {
              role: "user",
              content: `
                  You are a top-tier LinkedIn ghostwriter known for viral engagement.
                  
                  TOPIC: "${topic}"

                  ${(() => {
                    const angles = [
                      "Challenge a widely-held assumption about this topic with a contrarian insight.",
                      "Open with a surprising statistic or counterintuitive fact related to this topic.",
                      "Tell a brief, vivid micro-story or scenario that illustrates the core idea.",
                      "Ask a single, deeply thought-provoking question that reframes how the audience sees this.",
                      "Start with a bold, uncommon prediction about where this topic is heading.",
                      "Use an unexpected analogy from nature, sports, or history to explain the idea.",
                      "Expose a hidden cost or risk that most people ignore about this topic.",
                      "Frame the post as a lesson learned the hard way — impersonal but grounded.",
                      "Highlight the gap between what most people believe and what the data actually shows.",
                      "Open with a one-sentence statement so striking it demands the reader pause.",
                    ];
                    const structures = [
                      "Use short punchy sentences. Build tension. Deliver a sharp conclusion.",
                      "Use a flowing, narrative style with varying sentence lengths.",
                      "Lead with the punchline. Explain after. End with a reflection.",
                      "Use a 3-part structure: provoke → inform → challenge the reader to act.",
                      "Write like you're mid-conversation with a brilliant peer at a conference.",
                    ];
                    return `
                    MUST FOLLOW THIS ANGLE FOR VARIETY: 
                    ${angles[Math.floor(Math.random() * angles.length)]}
                    
                    MUST FOLLOW THIS STRUCTURE STYLE: 
                    ${structures[Math.floor(Math.random() * structures.length)]}
                    `;
                  })()}
                  
                  PREVIOUSLY PUBLISHED CONTENT ON THIS TOPIC (DO NOT REPEAT THESE ANGLES/IDEAS):
                  ${previousPosts.map((p, i) => `[Post ${i + 1}]: ${p}`).join("\n")}
                  
                  YOUR GOAL:
                  Write a completely fresh, engaging post about this topic. 
                    - If the previous posts were "how-to" lists, write a real-life story or a controversial opinion.
                    - If the previous posts were about the same topic, write something value packed for the readers.
                    - ensure the new post is DISTINCT from the history provided above.

                  STRUCTURE & TONE:
                    - Tone: ${description || userPersona.tone || "professional"}
                    - Author Context: ${userPersona.profession || "Industry Pro"} (${userPersona.industry || "General"})
                    - Even though you are using my persona, DO NOT WRITE ABOUT ME. DO NOT MAKE THE POST PERSONAL. Unless explicitly asked!
                  
                  CRITICAL INSTRUCTIONS ASIDE THE TONE:
                  1. **postLength**: ${postLength || "medium"}.
                    - If postLength = "short" then the post should be 500-600 characters.
                    - If postLength = "medium" then the post should be 600-700 characters.
                    - If postLength = "long" then the post should be 800-1200 characters.
                    - Write in a highly unpredictable, human‑like style with vivid metaphors, varied sentence lengths, surprising word choices, and narrative quirks that maximize perplexity.
                  2. **NO TITLES**: Do NOT start with "Title:..." or any heading. 
                  3. **THE HOOK**: The FIRST line must be a "scroll-stopper" (viral hook). 
                     - Max 150 chars for the hook.
                  4. **BODY**: Short paragraphs, human-sounding, no corporate fluff.
                  4. Use Popular viral linkedin post STRATEGIES. YOU CAN USE A COMBINATION OF THEM.
                  5. **FORMAT**: No emojis, No special characters. 2-3 hashtags at the end.

                  WARNING!  WARNING!  WARNING!  WARNING!  WARNING!
                  6. DO NOT USE MY PERSONAL PRONOUN!, DO NOT REFER TO ME!
                   6. DO NOT USE MY PERSONAL PRONOUN!, DO NOT REFER TO ME!
                    6. DO NOT USE MY PERSONAL PRONOUN!, DO NOT REFER TO ME!
                     6. DO NOT USE MY PERSONAL PRONOUN!, DO NOT REFER TO ME!
                      6. DO NOT USE MY PERSONAL PRONOUN!, DO NOT REFER TO ME!
                       6. DO NOT USE MY PERSONAL PRONOUN!, DO NOT REFER TO ME!
                        

                  
                  OUTPUT:
                  Return ONLY the raw post content.`,
            },
          ],
          temperature: 0.7,
        }),
      }
    );

    const textData = await textResponse.json();

    if (!textResponse.ok) {
      console.error("❌ Groq text API error:", textData);
      return { post: null, imageBase64: null };
    }

    post = textData?.choices?.[0]?.message?.content?.trim() || null;

    // console.log("post:", post);

    if (!post) {
      console.error("❌ Groq returned empty post content");
      return { post: null, imageBase64: null };
    }
  } catch (err) {
    console.error("❌ Text generation crashed:", err.message);
    return { post: null, imageBase64: null };
  }

  // --------------------------------------------------
  // 2️⃣ IMAGE GENERATION (OPTIONAL — FLAG CONTROLLED)
  // --------------------------------------------------
  if (includeImage) {
    try {
      const imagePrompt = `Professional LinkedIn Tech background image creative for the "${topic}". 
            KEEP IT minimal, Clean, modern. WARNING: NO TEXT IN THE IMAGE!, NO BRANDS LOGOS IN THE IMAGE!, NO FACES IN THE IMAGE.`;

      const res = await fetch("https://image-api.dev-kyde.workers.dev/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${imageApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: imagePrompt }),
      });

      if (!res.ok) {
        console.warn("⚠️ Image API responded with:", res.status);
        imageBase64 = null;
      } else {
        const arrayBuffer = await res.arrayBuffer();
        imageBase64 = Buffer.from(arrayBuffer).toString("base64");
      }
    } catch (err) {
      console.warn("⚠️ Image generation failed (ignored):", err.message);
      imageBase64 = null;
    }
  } else {
    // Explicitly skip image generation
    console.log(
      `🖼️ Image generation skipped (includeImage=false) for topic: "${topic}"`
    );
    imageBase64 = null;
  }

  // --------------------------------------------------
  // 3️⃣ RETURN (TEXT ALWAYS, IMAGE MAYBE)
  // --------------------------------------------------
  return {
    post,
    imageBase64, // null if image failed
  };
}

export async function publishToLinkedIn(
  accessToken,
  content,
  PostuserId,
  PostUserEmail,
  providedImageBase64 = null
) {
  console.log(
    "posting content length: ",
    content ? content.length : "undefined"
  );

  try {
    let authorUrn = null;
    let imageUrn = null;

    // Handle content/image arguments robustly
    let postText = content;
    let imageBase64 = providedImageBase64;

    // Support if content was passed as object (legacy/user attempt)
    if (typeof content === "object" && content !== null) {
      postText = content.post || content.content; // Try to extract text
      if (content.imageBase64) imageBase64 = content.imageBase64;
    }

    if (!postText) {
      throw new Error("Post content is missing");
    }

    // ✅ If we already have the LinkedIn user ID stored
    if (PostuserId) {
      authorUrn = `urn:li:person:${PostuserId}`;
    } else {
      // ✅ Otherwise, fetch it from LinkedIn's /userinfo endpoint
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
      if (!rawText) return "";
      return rawText
        .replace(/\*/g, "") // remove all asterisks
        .replace(/\r\n/g, "\n") // normalize line endings
        .replace(/\n{3,}/g, "\n\n") // prevent too many blank lines
        .trim();
    }
    const formattedPost = formatPostText(postText);

    // 🖼 Upload image if provided
    if (imageBase64) {
      console.log("Found imageBase64, starting upload process...");

      // Step 1: Register upload
      const registerRes = await fetch(
        "https://api.linkedin.com/v2/assets?action=registerUpload",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
          },
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
              owner: authorUrn,
              serviceRelationships: [
                {
                  relationshipType: "OWNER",
                  identifier: "urn:li:userGeneratedContent",
                },
              ],
            },
          }),
        }
      );

      const registerData = await registerRes.json();
      console.log(
        "Register Upload Response:",
        JSON.stringify(registerData, null, 2)
      );

      if (!registerRes.ok) {
        throw new Error(
          `Failed to register image upload: ${registerData.message || registerRes.statusText
          }`
        );
      }

      const uploadUrl =
        registerData.value.uploadMechanism[
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
        ].uploadUrl;
      imageUrn = registerData.value.asset;

      console.log("Image URN:", imageUrn);
      console.log("Upload URL:", uploadUrl);

      // Step 2: Upload image
      const buffer = Buffer.from(imageBase64, "base64");
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          // Authorization: `Bearer ${accessToken}` // Usually NOT needed for signed URLs and can cause 400
          "Content-Type": "application/octet-stream",
        },
        body: buffer,
      });

      console.log("Image Upload Status:", uploadRes.status);

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        console.error("Image upload failed details:", errText);
        throw new Error(`Failed to upload image: ${uploadRes.statusText}`);
      }

      console.log("✅ Image uploaded successfully:", imageUrn);
    }

    // 📝 Step 3: Publish post
    const postBody = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: formattedPost },
          shareMediaCategory: imageUrn ? "IMAGE" : "NONE",
          media: imageUrn
            ? [
              {
                status: "READY",
                description: { text: "Generated by AI" },
                media: imageUrn,
                title: { text: "Post Image" },
              },
            ]
            : [],
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    console.log("Publishing body:", JSON.stringify(postBody, null, 2));

    // ✅ Now create the LinkedIn post
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

    const platformName = schedule.platform || "linkedin";

    // Lookup generic SocialAccount first
    const account = await SocialAccount.findOne({
      where: { userId: user.id, platform: platformName, isActive: true }
    });

    let accessToken, platformUserId;
    if (account) {
      accessToken = account.accessToken;
      platformUserId = account.platformUserId;
    } else if (platformName === "linkedin" && user.linkedinAccessToken) {
      accessToken = user.linkedinAccessToken;
      platformUserId = user.linkedinProfileId;
    }

    if (!accessToken) {
      console.log(`⚠️ Skipping ${topic.title} — user has no ${platformName} token.`);
      continue;
    }

    // -------------------------------------------
    // STEP -1 — Tier Limit Check
    // -------------------------------------------
    if (!user.isPremium) {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const publishedCount7Days = await ScheduledPost.count({
        where: {
          userId: user.id,
          status: "published",
          publishedAt: { [Op.gte]: oneWeekAgo }
        }
      });

      const trialPeriod = 7 * 24 * 60 * 60 * 1000;
      const isTrial = (now - new Date(user.createdAt)) < trialPeriod;
      const weeklyLimit = isTrial ? 3 : 2;
      const tierName = isTrial ? "Trial" : "Free";

      if (publishedCount7Days >= weeklyLimit) {
        console.log(`⚠️ Skipping ${topic.title} for user ${user.id} — ${tierName} limit reached (${publishedCount7Days}/${weeklyLimit}).`);
        
        // Reschedule to tomorrow to check again
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        await job.update({ scheduledFor: tomorrow });
        continue;
      }
    }

    // -------------------------------------------
    // STEP 0 — SAFETY VALDIATION (Prevent wrong-day posting)
    // -------------------------------------------
    const currentDay = now.getDay(); // 0-6
    const currentMonthDay = now.getDate(); // 1-31

    // WEEKLY SAFEGUARD
    if (schedule.frequency === "weekly") {
      const scheduleDay = parseInt(schedule.dayOfWeek, 10);
      if (!isNaN(scheduleDay) && scheduleDay !== currentDay) {
        console.warn(
          `⚠️ Skipping ${topic.title}: Scheduled for day ${scheduleDay} but today is ${currentDay}. Moving on...`
        );

        // Fix the schedule by calculating the NEXT correct occurrence
        const nextDate = calculateNextDate(schedule);
        await job.update({ scheduledFor: nextDate, status: "pending" });
        continue;
      }
    }

    // MONTHLY SAFEGUARD
    if (schedule.frequency === "monthly") {
      const scheduleDate = parseInt(schedule.dayOfMonth, 10);
      if (!isNaN(scheduleDate) && scheduleDate !== currentMonthDay) {
        console.warn(
          `⚠️ Skipping ${topic.title}: Scheduled for date ${scheduleDate} but today is ${currentMonthDay}. Moving on...`
        );

        const nextDate = calculateNextDate(schedule);
        await job.update({ scheduledFor: nextDate, status: "pending" });
        continue;
      }
    }

    // -------------------------------------------
    // STEP 1 — Fetch History & Generate Content
    // -------------------------------------------

    // Fetch last 3 posts for context to avoid repetition
    const previousPosts = await ScheduledPost.findAll({
      where: {
        topicId: topic.id,
        status: "published",
        content: { [Op.ne]: "" }, // Ensure content exists
      },
      order: [["publishedAt", "DESC"]],
      limit: 6,
      attributes: ["content"],
    });

    const previousContentList = previousPosts.map((p) => p.content);

    let rawContent;

    rawContent = await generateLinkedInPost(
      topic.title,
      topic.postLength,
      topic.description || "Write a professional LinkedIn post on this topic.",
      topic.includeImage === true,
      user,
      previousContentList
    );

    if (!rawContent || !rawContent.post) {
      console.log("⚠️ Skipping post — no text generated (likely rate limit)");
      continue;
    }

    let content;

    if (typeof rawContent === "string") {
      content = rawContent;
    } else if (rawContent && typeof rawContent.post === "string") {
      content = rawContent.post;
    } else {
      console.warn("⚠️ Unexpected rawContent shape:", rawContent);
      content = JSON.stringify(rawContent);
    }

    // -------------------------------------------
    // STEP 2 — CLOUDINARY COMPOSITOR (If Image was generated)
    // -------------------------------------------
    let cloudPublicId = null;

    if (finalImageBase64) {
      console.log(`[Cloudinary] Base image generated. Extracting hook for compositing...`);
      try {
        const hookText = await generateImageHook(content, topic.title);
        console.log(`[Cloudinary] Hook extracted: "${hookText}"`);
        const compositeResult = await createCompositeImageCloudinary(finalImageBase64, hookText);
        finalImageBase64 = compositeResult.compositeBase64;
        cloudPublicId = compositeResult.publicId;
        console.log(`[Cloudinary] Composite image successfully branded. ID: ${cloudPublicId}`);
      } catch (compositorErr) {
        console.error(`[Cloudinary] Pipeline failed:`, compositorErr.message);
        console.warn(`[Cloudinary] Falling back to raw AI image without branding.`);
      }
    }

    // -------------------------------------------
    // STEP 3 — Publish to Target Platform
    // -------------------------------------------
    let publishResult = { success: false, error: "Platform not supported" };

    if (platformName === "linkedin") {
      publishResult = await publishToLinkedIn(
        accessToken,
        content,
        platformUserId,
        user.email,
        finalImageBase64
      );
    } else if (platformName === "tiktok") {
      publishResult = await publishToTikTok(
        accessToken,
        content,
        platformUserId,
        finalImageBase64,
        user.id // Pass the user.id to lookup the Audio Track!
      );
    } else {
      console.log(`❌ Platform ${platformName} publishing not implemented in this cron.`);
    }

    if (!publishResult.success) {
      console.log(`❌ Failed publishing to ${platformName}: ${publishResult.error || publishResult.errorMessage || 'Unknown Error'}`);

      await job.update({
        status: "failed",
        errorMessage: publishResult.error || publishResult.errorMessage,
        retryCount: job.retryCount + 1,
      });

      continue;
    }

    // Merge Cloudinary ID if platform returned one (IG/FB do)
    if (publishResult.cloudPublicId) {
        cloudPublicId = publishResult.cloudPublicId;
    }

    console.log(`✅ Posted to ${platformName}: ${topic.title}`);

    // -------------------------------------------
    // STEP 4 — Mark this job as published
    // -------------------------------------------
    await job.update({
      status: "published",
      content,
      linkedinPostId: platformName === "linkedin" ? publishResult.postId : null,
      externalPostId: publishResult.postId,
      cloudPublicId: cloudPublicId,
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

/**
 * Automates data retention policy:
 * - Deletes ScheduledPost & UserAudio older than 30 days for FREE users.
 * - Exempts PREMIUM users.
 */
export async function cleanupExpiredFreeUserData() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  console.log("🕒 Running daily cleanup for free users (expiry before:", thirtyDaysAgo.toISOString(), ")");

  try {
    // 1. Identify all free users
    const freeUsers = await User.findAll({
        where: { isPremium: false },
        attributes: ['id']
    });
    
    if (freeUsers.length === 0) {
        console.log("Cleanup: No free users found.");
        return;
    }

    const freeUserIds = freeUsers.map(u => u.id);

    // 2. Find Expired Scheduled Posts for these users
    const expiredPosts = await ScheduledPost.findAll({
        where: {
            userId: { [Op.in]: freeUserIds },
            createdAt: { [Op.lt]: thirtyDaysAgo }
        },
        attributes: ['id', 'cloudPublicId']
    });

    // 3. Find Expired Audio for these users
    const expiredAudio = await UserAudio.findOne({
        where: {
            userId: { [Op.in]: freeUserIds },
            createdAt: { [Op.lt]: thirtyDaysAgo }
        },
        attributes: ['id', 'publicId']
    });

    console.log(`Cleanup: Found ${expiredPosts.length} posts and ${expiredAudio ? 1 : 0} audio tracks for deletion.`);

    // 4. Delete Cloudinary Assets for Posts (Images/Videos)
    const postPublicIds = expiredPosts.map(p => p.cloudPublicId).filter(Boolean);
    if (postPublicIds.length > 0) {
        console.log(`Cleanup: Destroying ${postPublicIds.length} post assets in Cloudinary...`);
        // Cloudinary delete API has 100 limit, but our daily cleanup should be small. 
        // We do images first, then videos if needed.
        await deleteCloudinaryResources(postPublicIds, "image");
        await deleteCloudinaryResources(postPublicIds, "video");
    }

    // 5. Delete Cloudinary Assets for Audio
    if (expiredAudio && expiredAudio.publicId) {
        console.log(`Cleanup: Destroying audio asset ${expiredAudio.publicId} in Cloudinary...`);
        await deleteCloudinaryResources([expiredAudio.publicId], "video"); // Cloudinary treats audio as video
    }

    // 6. DB Cleanup
    const deletedPostsCount = await ScheduledPost.destroy({
        where: { id: { [Op.in]: expiredPosts.map(p => p.id) } }
    });

    let deletedAudioCount = 0;
    if (expiredAudio) {
        deletedAudioCount = await UserAudio.destroy({
            where: { id: expiredAudio.id }
        });
    }

    console.log(`✅ Cleanup Complete. Records removed: ${deletedPostsCount} posts, ${deletedAudioCount} audio.`);
  } catch (error) {
    console.error("🚨 Cleanup Job Failed:", error);
  }
}

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

    // FIX: Ensure dayOfWeek is an integer to avoid string concatenation bugs
    const dayOfWeek = parseInt(schedule.dayOfWeek, 10);
    if (isNaN(dayOfWeek)) {
      throw new Error(`Invalid dayOfWeek: ${schedule.dayOfWeek}`);
    }

    const next = new Date();
    const diff = (dayOfWeek + 7 - now.getDay()) % 7 || 7;
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

// OLD CODE ---------------------------------------------------------------------------------------------------

// export async function generateLinkedInPost(topic, description = "") {
//   const textApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
//   const imageApiKey = process.env.CF_IMAGE_GENERATION_API_KEY;

//   let post = null;
//   let imageBase64 = null;

//   /**
//    * 1️⃣ TEXT GENERATION (CRITICAL)
//    */
//   try {
//     const textResponse = await fetch(
//       "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
//       {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           "X-goog-api-key": textApiKey,
//         },
//         body: JSON.stringify({
//           contents: [
//             {
//               parts: [
//                 {
//                   text: `Using the following template, generate an engaging LinkedIn-style post using the title "${topic}".
// Maintain the structure and this tone: ${description}.

// Requirements:
// - Unique title (≤150 chars)
// - Humanized body
// - LinkedIn-focused (EdTech leaders)
// - No greetings or sign-offs
// - No headings
// - 500–600 characters
// - Professional tone
// - 2–3 hashtags
// - No emojis
// - Actionable

// Return only the post content.`,
//                 },
//               ],
//             },
//           ],
//         }),
//       }
//     );

//     const textData = await textResponse.json();

//     if (!textResponse.ok) {
//       throw new Error(textData.error?.message || "Text generation failed");
//     }

//     post = textData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;

//     if (!post) {
//       throw new Error("No post content returned");
//     }
//   } catch (error) {
//     console.error("❌ Text generation failed:", error.message);

//     // IMPORTANT: do NOT throw
//     return {
//       post: null,
//       imageBase64: null,
//     };
//   }

//   /**
//    * 2️⃣ IMAGE GENERATION (OPTIONAL / BEST-EFFORT)
//    */
//   try {
//     const ai = new GoogleGenAI({ apiKey: imageApiKey });

//     const imagePrompt = `Generate a professional LinkedIn background image related to "${topic}".
// Clean, modern, no text, no logos. 1024x1024.`;

//     const imageResponse = await ai.models.generateContent({
//       model: "gemini-2.0-flash-preview-image-generation",
//       contents: imagePrompt,
//       config: {
//         responseModalities: [Modality.TEXT, Modality.IMAGE],
//       },
//     });

//     const candidates = imageResponse?.candidates || [];

//     for (const candidate of candidates) {
//       const parts = candidate?.content?.parts || [];
//       for (const part of parts) {
//         if (part.inlineData?.data) {
//           imageBase64 = part.inlineData.data;
//           break;
//         }
//       }
//       if (imageBase64) break;
//     }

//     if (!imageBase64) {
//       console.warn("⚠️ Image generation returned no image");
//     }
//   } catch (imageError) {
//     // 🚨 IMPORTANT: swallow image errors
//     console.warn("⚠️ Image generation failed, continuing without image");
//     console.log("image gen failed: ", imageError.message);
//   }

//   /**
//    * 3️⃣ ALWAYS RETURN TEXT
//    */
//   return {
//     post,
//     imageBase64, // null if failed
//   };
// }

// export async function publishToLinkedIn(
//   accessToken,
//   content,
//   PostuserId,
//   PostUserEmail
// ) {

/**
 * Extracts and refines the scroll-stopping hook from a social media post.
 * Uses AI to validate and polish the hook, ensuring it is always complete,
 * meaningful, and suitable for a professional social media image overlay.
 */
export async function generateImageHook(postContent, topicTitle) {
  const apiKey = process.env.GROQ_API_KEY;

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.6,
          messages: [
            {
              role: "system",
              content: `You are an expert copywriter for elite professionals and executives.
              Your job is to extract or craft the single most powerful, scroll-stopping hook sentence from a social media post.
              This hook will be printed on a branded image card that top professionals share publicly.
              The stakes are high — the hook must be flawless, professional, and impactful.`,
            },
            {
              role: "user",
              content: `POST TOPIC: "${topicTitle}"

FULL POST CONTENT:
---
${postContent}
---

INSTRUCTIONS:
- Find or craft the single best HOOK sentence from this post — the opening line that would stop a professional scrolling their feed.
- It must be a COMPLETE, grammatically correct sentence or compelling fragment.
- Strip ALL hashtags.
- It should feel punchy but professional — suitable for an executive's personal brand image.
- STRICT word count: between 10 and 12 words. Count carefully.
- Do NOT add quotes around it.
- Return ONLY the hook text. Nothing else.`,
            },
          ],
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Groq API Error");

    const hook = data.choices?.[0]?.message?.content?.trim();

    // Sanitize: strip quotes, hashtags, newlines. Enforce word count 10-12.
    const raw = hook
      ?.replace(/^"|"$/g, '')
      ?.replace(/#\S+/g, '')
      ?.replace(/\n.*/s, '')
      ?.trim();

    // Enforce 12 word cap — trim if AI returns too many
    const words = (raw || '').split(/\s+/).filter(Boolean);
    const capped = words.slice(0, 12).join(' ');

    return capped || topicTitle;

  } catch (error) {
    console.error("generateImageHook Error:", error.message);
    return topicTitle;
  }
}
//   console.log("posting content: ", content);

//   try {
//     let authorUrn = null;

//     // ✅ Use stored LinkedIn user ID if available
//     if (PostuserId) {
//       authorUrn = `urn:li:person:${PostuserId}`;
//     } else {
//       // ✅ Otherwise, fetch user info from LinkedIn
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

//       if (!meData?.sub) {
//         throw new Error("Missing 'sub' field in LinkedIn profile data.");
//       }

//       authorUrn = `urn:li:person:${meData.sub}`;
//       console.log("LinkedIn author URN:", authorUrn);

//       // Optional: persist LinkedIn ID for next time
//       await User.update(
//         { linkedinProfileId: meData.sub },
//         { where: { email: PostUserEmail } }
//       );
//     }

//     function formatPostText(rawText) {
//       return rawText
//         .replace(/\*/g, "")
//         .replace(/\r\n/g, "\n")
//         .replace(/\n{3,}/g, "\n\n")
//         .trim();
//     }

//     let postText;

//     if (typeof content === "string") {
//       postText = content;
//     } else if (
//       typeof content === "object" &&
//       typeof content.post === "string"
//     ) {
//       postText = content.post;
//     } else {
//       console.warn(
//         "⚠️ content was not a string; stringifying fallback:",
//         content
//       );
//       postText = JSON.stringify(content);
//     }

//     const formattedPost = formatPostText(postText);

//     // 📝 Build text-only LinkedIn post body
//     const postBody = {
//       author: authorUrn,
//       lifecycleState: "PUBLISHED",
//       specificContent: {
//         "com.linkedin.ugc.ShareContent": {
//           shareCommentary: { text: formattedPost },
//           shareMediaCategory: "NONE", // 🚫 no image
//         },
//       },
//       visibility: {
//         "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
//       },
//     };

//     // ✅ Publish the post
//     const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
//       method: "POST",
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//         "Content-Type": "application/json",
//         "X-Restli-Protocol-Version": "2.0.0",
//       },
//       body: JSON.stringify(postBody),
//     });

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

export async function publishToTikTok(accessToken, content, platformUserId, imageBase64, dbUserId) {
  try {
    if (!imageBase64) {
      return { success: false, error: "TikTok requires an image/video to publish." };
    }
    
    // 1. Fetch Active Audio
    const activeAudio = await UserAudio.findOne({
      where: { userId: dbUserId, isActive: true }
    });

    if (!activeAudio) {
      return { success: false, error: "No active audio track found for TikTok. Please configure in Settings." };
    }

    console.log(`[TikTok Publisher] Using Audio ${activeAudio.publicId}`);

    // 2. Generate MP4 via Cloudinary Compositor Integration
    const { buffer: videoBuffer, publicId: cloudPublicId } = await createTikTokVideo(imageBase64, activeAudio.publicId);
    const videoSize = videoBuffer.byteLength;
    console.log(`[TikTok Publisher] Generated MP4 Size: ${videoSize} bytes`);

    // 3. Init FILE_UPLOAD Session
    const initPayload = {
      post_info: {
        title: content.substring(0, 150),
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1
      }
    };

    const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify(initPayload)
    });

    if (!initRes.ok) {
        throw new Error(`Init Failed: ${await initRes.text()}`);
    }

    const initData = await initRes.json();
    if (initData.error && initData.error.code !== "ok") {
        throw new Error(`API Error: ${initData.error.message}`);
    }

    const publishId = initData.data.publish_id;
    const uploadUrl = initData.data.upload_url;

    // 4. Upload raw video Buffer to provided uploadUrl
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
        "Content-Length": videoSize.toString()
      },
      body: videoBuffer
    });

    if (!uploadRes.ok) {
        throw new Error(`Upload Failed: ${await uploadRes.text()}`);
    }

    return { success: true, postId: publishId, cloudPublicId };
  } catch (err) {
    console.error(`🚨 TikTok Error:`, err);
    return { success: false, error: err.message };
  }
}

// -------------------------------------------
// CRON JOB: Publish all due scheduled posts
// -------------------------------------------

// const res = await fetch("https://image-api.dev-kyde.workers.dev/", {
//   method: "POST",
//   headers: {
//     Authorization: `Bearer ${imageApiKey}`,
//     "Content-Type": "application/json",
//   },
//   body: JSON.stringify({ prompt: "" }),
// });
// const blob = await res.blob();
// // const img = document.createElement("img");
// img.src = URL.createObjectURL(blob);
// img.style.height = "500px";
