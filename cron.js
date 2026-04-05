import fetch from "node-fetch";
import { User, ScheduledPost, Schedule, Topic, SocialAccount, UserAudio, UserMemory } from "./db/models.js";
import { Op } from "sequelize";
import { Buffer } from "buffer";
import { createCompositeImageCloudinary, uploadToCloudinary } from "./cloudinary.js";
import { runCompliancePipeline } from "./compliance.js";



// GENERATE POST TEXT AND IMAGE
export async function generateSocialMediaPost(
  topic,
  postLength,
  description = "",
  includeImage = false,
  userPersona,
  userMemories = [],
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
          model: "llama-3.3-70b-versatile",
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
                  
                  PREVIOUSLY PUBLISHED CONTENT ON THIS TOPIC (DO NOT REPEAT THESE ANGLES/IDEAS):
                  ${previousPosts.map((p, i) => `[Post ${i + 1}]: ${p}`).join("\n")}
                  
                  YOUR GOAL:
                  Write a completely fresh, engaging post about this topic. 
                    - If the previous posts were "how-to" lists, write a real-life story or a controversial opinion.
                    - If the previous posts were about the same topic, write something value packed for the readers.
                    - ensure the new post is DISTINCT from the history provided above.

                  --- CONTEXT GUIDELINES ---
                  
                  1. AUTHOR PERSONA (Write strictly in their voice based on these verified facts):
                    - Profession: ${userPersona.profession || "Industry Pro"}
                    - Industry: ${userPersona.industry || "General"}
                    - Tone Directive: ${userPersona.tone || "professional"}
                    - Background/Bio: ${userPersona.bio || "No bio provided."}
                    * Even though you are using my persona, DO NOT WRITE ABOUT ME directly. DO NOT MAKE THE POST PERSONAL unless the prompt specifically asks for a personal story.
                    
                  2. AUTHOR MANUALLY SAVED MEMORIES (Strict preferences for their writing):
                    ${userMemories.map(m => `- [${m.memoryType.toUpperCase()}]: ${m.content}`).join("\n") || "No explicit memory guidelines."}
                    
                  3. SCHEDULE / TOPIC SPECIFIC DESCRIPTION (The user's direct instructions for this post):
                    - ${description || "Write a highly engaging, professional viral social media post on this topic."}
                  --------------------------
                  
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
      const imagePrompt = `Professional background image creative for the "${topic}". 
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
  // 3️⃣ CLOUDINARY COMPOSITOR 
  // --------------------------------------------------
  let cloudPublicId = null;

  if (imageBase64 && post) {
    console.log(`[Cloudinary] Base image generated. Extracting hook for compositing...`);
    try {
      const hookText = await generateImageHook(post, topic);
      console.log(`[Cloudinary] Hook extracted: "${hookText}"`);
      const compositeResult = await createCompositeImageCloudinary(imageBase64, hookText);
      imageBase64 = compositeResult.compositeBase64;
      cloudPublicId = compositeResult.publicId;
      console.log(`[Cloudinary] Composite image successfully branded. ID: ${cloudPublicId}`);
    } catch (compositorErr) {
      console.error(`[Cloudinary] Pipeline failed:`, compositorErr.message);
      console.warn(`[Cloudinary] Falling back to raw AI image without branding.`);
    }
  }

  // --------------------------------------------------
  // 4️⃣ RETURN
  // --------------------------------------------------
  return {
    post,
    imageBase64, // Edited formatted base64
    cloudPublicId // Retained for tracking and cleanup
  };
}

// GENERATE HOOK FOR IMAGE
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

// PUBLISH THE DUE POSTS
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
            include: [
              {
                model: User,
                include: [{ model: UserMemory, required: false, where: { isActive: true } }]
              }
            ],
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

    const platformName = schedule.platform;

    let accessToken = null;
    let platformUserId = null;

    // Platform-agnostic token retrieval
    if (platformName !== "linkedin") {
      const account = await SocialAccount.findOne({
        where: { userId: user.id, platform: platformName, isActive: true }
      });
      if (account) {
        accessToken = account.accessToken;
        platformUserId = account.platformUserId;
      }
    } else {
      // Legacy fallback for linkedin directly on the User model
      if (user?.linkedinAccessToken) {
        accessToken = user.linkedinAccessToken;
        platformUserId = user.linkedinProfileId;
      }
    }

    if (!accessToken) {
      console.log(`⚠️ Skipping ${topic.title} — user has no active token for ${platformName}.`);
      await job.update({
        status: "failed",
        errorMessage: `Account disconnected. Please re-link your ${platformName} account to publish.`,
      });
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

    rawContent = await generateSocialMediaPost(
      topic.title,
      topic.postLength,
      topic.description,
      topic.includeImage === true,
      user,
      user.UserMemories || [],
      previousContentList
    );

    if (!rawContent || !rawContent.post) {
      console.log("⚠️ Skipping post — no text generated (likely rate limit)");
      continue;
    }
    
    let content = rawContent.post;

    // --- COMPLIANCE VERIFICATION LAYER ---
    console.log(`🛡️ Running compliance verification for ${topic.title}...`);
    const complianceData = await runCompliancePipeline(content, user.id);
    if (!complianceData.result.success) {
      console.log(`❌ Compliance completely rejected post: ${topic.title}`);
      await job.update({
        status: "failed",
        errorMessage: `Compliance Violation: ${complianceData.result.error}`,
        retryCount: job.retryCount + 1,
      });
      continue;
    }
    content = complianceData.result.finalContent;
    console.log(`✅ Compliance Approved content for "${topic.title}"`);
    // -----------------------------------

    // -------------------------------------------
    // STEP 2 — Publish to Target Platform
    // -------------------------------------------
    let publishResult = { success: false, error: "Platform not supported" };

    if (platformName === "linkedin") {
      publishResult = await publishToLinkedIn(
        accessToken,
        content,
        platformUserId,
        user.email,
        rawContent.imageBase64
      );
    } else if (platformName === "facebook") {
      publishResult = await publishToFacebook(
        accessToken,
        content,
        platformUserId,
        rawContent.imageBase64
      );
    } else if (platformName === "instagram") {
      publishResult = await publishToInstagram(
        accessToken,
        content,
        platformUserId,
        rawContent.imageBase64
      );
    } else {
      console.log(`❌ Platform ${platformName} publishing not implemented yet in this iteration.`);
      publishResult = { success: false, error: `${platformName} integration pending` };
    }

    if (!publishResult.success) {
      console.log(`❌ Failed publishing: ${publishResult.error}`);

      // Auto-detect Token Expiration / OAuth Failures
      const errStr = String(publishResult.error).toLowerCase();
      const isTokenExpired = 
        errStr.includes("token") || 
        errStr.includes("oauth") || 
        errStr.includes("expired") || 
        errStr.includes("unauthorized");

      if (isTokenExpired) {
        if (platformName === "linkedin") {
          await User.update({ linkedinAccessToken: null }, { where: { id: user.id } });
        } else {
          await SocialAccount.update(
            { isActive: false },
            { where: { userId: user.id, platform: platformName } }
          );
        }
      }

      await job.update({
        status: "failed",
        errorMessage: isTokenExpired 
          ? `Authorization expired. Please re-link your ${platformName} account in Settings.` 
          : publishResult.error,
        retryCount: job.retryCount + 1,
      });

      continue;
    }

    console.log(`✅ Posted to ${platformName.toUpperCase()}: ${topic.title}`);

    // -------------------------------------------
    // STEP 3 — Mark this job as published
    // -------------------------------------------
    await job.update({
      status: "published",
      content,
      linkedinPostId: platformName === "linkedin" ? publishResult.postId : null,
      externalPostId: publishResult.postId,
      cloudPublicId: rawContent.cloudPublicId || null,
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

// SCHEDULE THE NEXT POST
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

// POST TO LINKEDIN
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

// POST TO FACEBOOK
export async function publishToFacebook(accessToken, content, platformUserId, imageBase64 = null) {
  console.log(`[publishToFacebook] STARTING. platformUserId: ${platformUserId}, Content Length: ${content ? content.length : 0}, Has Image: ${!!imageBase64}`);
  try {
    // Text-only post
    if (!imageBase64) {
      console.log(`[publishToFacebook] No image provided. Using text-only /feed endpoint.`);
      const endpoint = `https://graph.facebook.com/v18.0/${platformUserId}/feed`;
      console.log(`[publishToFacebook] Requesting: ${endpoint}`);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          access_token: accessToken,
        }),
      });

      const data = await res.json();
      console.log(`[publishToFacebook] API Response Status: ${res.ok}`);
      if (!res.ok) {
        console.error(`[publishToFacebook] API Error Data:`, data);
        throw new Error(data.error?.message || "Facebook text post failed");
      }
      console.log(`[publishToFacebook] Text post successful. ID: ${data.id}`);
      return { success: true, postId: data.id };
    }

    // Image post via Cloudinary
    console.log("[publishToFacebook] Image provided. Uploading Composite Image to Cloudinary...");
    const cloudRes = await uploadToCloudinary(imageBase64);
    const publicUrl = cloudRes.secure_url;
    console.log("[publishToFacebook] Cloudinary Upload Success. URL:", publicUrl);

    const endpoint = `https://graph.facebook.com/v18.0/${platformUserId}/photos`;
    console.log(`[publishToFacebook] Requesting: ${endpoint}`);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: content,
        url: publicUrl,
        access_token: accessToken,
      }),
    });

    const data = await res.json();
    console.log(`[publishToFacebook] API Response Status: ${res.ok}`);
    if (!res.ok) {
      console.error(`[publishToFacebook] API Error Data:`, data);
      throw new Error(data.error?.message || "Facebook composite post failed");
    }

    // Facebook Photos API returns 'id' (photo ID) and 'post_id'
    console.log(`[publishToFacebook] Image post successful. post_id: ${data.post_id || data.id}`);
    return {
      success: true,
      postId: data.post_id || data.id,
      cloudPublicId: cloudRes.public_id,
    };
  } catch (error) {
    console.error("[publishToFacebook] Fatal Catch Error:", error);
    return { success: false, error: error.message };
  }
}

// POST TO INSTAGRAM
export async function publishToInstagram(accessToken, content, platformUserId, imageBase64 = null) {
  console.log(`[publishToInstagram] STARTING. platformUserId: ${platformUserId}, Content Length: ${content ? content.length : 0}, Has Image: ${!!imageBase64}`);

  if (!imageBase64) {
    console.error("[publishToInstagram] Validation Failed: No imageBase64 generated or provided.");
    return { success: false, error: "Instagram requires an image. No image generated." };
  }

  if (!platformUserId || platformUserId === "pending") {
    console.error("[publishToInstagram] Validation Failed: Invalid platformUserId.");
    return { success: false, error: "No connected Instagram Business Account ID." };
  }

  try {
    // 1. Upload to Cloudinary
    console.log("[publishToInstagram] Uploading Base64 image to Cloudinary...");
    const cloudRes = await uploadToCloudinary(imageBase64);
    const publicUrl = cloudRes.secure_url;
    console.log("[publishToInstagram] Cloudinary Upload Success. URL:", publicUrl);

    // 2. API Call to Create Container (Upload to Instagram servers)
    const createContainerUrl = `https://graph.facebook.com/v19.0/${platformUserId}/media`;
    console.log(`[publishToInstagram] Requesting Container Creation: ${createContainerUrl}`);
    const containerRes = await fetch(createContainerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: publicUrl,
        caption: content,
        access_token: accessToken,
      }),
    });
    const containerData = await containerRes.json();
    console.log(`[publishToInstagram] Container API Response Status: ${containerRes.ok}`);

    if (!containerRes.ok || containerData.error) {
      console.error("[publishToInstagram] Container Creation Error Data:", containerData);
      return { success: false, error: containerData.error?.message || "Failed to create media container" };
    }

    const creationId = containerData.id;
    console.log("[publishToInstagram] Media Container Created. ID:", creationId);

    // 3. API Call to Publish the Container
    const publishUrl = `https://graph.facebook.com/v19.0/${platformUserId}/media_publish`;
    console.log(`[publishToInstagram] Publishing Container: ${publishUrl}`);
    const pubRes = await fetch(publishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: accessToken,
      }),
    });
    const pubData = await pubRes.json();
    console.log(`[publishToInstagram] Publish API Response Status: ${pubRes.ok}`);

    if (!pubRes.ok || pubData.error) {
      console.error("[publishToInstagram] Publish Error Data:", pubData);
      return { success: false, error: pubData.error?.message || "Failed to publish media payload" };
    }

    console.log("✅ [publishToInstagram] Successfully posted to Instagram. ID:", pubData.id);
    return {
      success: true,
      postId: pubData.id,
      cloudPublicId: cloudRes.public_id,
    };
  } catch (error) {
    console.error("[publishToInstagram] Fatal Publishing Pipeline Error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// REFRESH FACEBOOK TOKENS
export async function refreshFacebookTokens() {
  try {
    console.log("🔄 Starting automatic Facebook token refresh...");

    // Find tokens expiring within the next 10 days
    const tenDaysFromNow = new Date();
    tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);

    const expiringAccounts = await SocialAccount.findAll({
      where: {
        platform: "facebook",
        isActive: true,
        tokenExpiresAt: {
          [Op.not]: null,
          [Op.lte]: tenDaysFromNow
        }
      }
    });

    console.log(`Found ${expiringAccounts.length} Facebook tokens requiring refresh.`);

    for (const account of expiringAccounts) {
      try {
        const exchangeUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
        exchangeUrl.searchParams.append("grant_type", "fb_exchange_token");
        exchangeUrl.searchParams.append("client_id", process.env.META_APP_ID);
        exchangeUrl.searchParams.append("client_secret", process.env.META_APP_SECRET);
        exchangeUrl.searchParams.append("fb_exchange_token", account.accessToken);

        const res = await fetch(exchangeUrl.toString());

        if (!res.ok) {
          console.warn(`⚠️ Token refresh failed for User ${account.userId}. Revoking access.`);
          await SocialAccount.update({ isActive: false }, { where: { userId: account.userId, platform: ["facebook", "facebook-page", "instagram"] } });
          continue;
        }

        const data = await res.json();
        const newUserToken = data.access_token;
        const newExpiry = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;

        // Update User token
        await account.update({
          accessToken: newUserToken,
          tokenExpiresAt: newExpiry
        });

        // 2. Fetch Pages to get new Page Tokens
        const accountsRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${newUserToken}`);
        if (accountsRes.ok) {
          const accountsData = await accountsRes.json();
          if (accountsData.data) {
            for (const page of accountsData.data) {
              // Update Facebook Page token
              await SocialAccount.update({
                accessToken: page.access_token,
                tokenExpiresAt: newExpiry
              }, {
                where: { platformUserId: page.id, platform: "facebook-page", userId: account.userId }
              });

              // Update linked Instagram token
              const igRes = await fetch(`https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`);
              if (igRes.ok) {
                const igData = await igRes.json();
                if (igData.instagram_business_account) {
                  await SocialAccount.update({
                    accessToken: page.access_token,
                    tokenExpiresAt: newExpiry
                  }, {
                    where: { platformUserId: igData.instagram_business_account.id, platform: "instagram", userId: account.userId }
                  });
                }
              }
            }
          }
        }
        console.log(`✅ Token successfully refreshed for User ${account.userId}`);
      } catch (err) {
        console.error(`Error refreshing token for UI ${account.userId}:`, err);
      }
    }
  } catch (error) {
    console.error("🚨 Critical Error in Facebook Token Refresh loop:", error);
  }
}