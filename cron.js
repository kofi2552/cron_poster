import fetch from "node-fetch";
import { User, ScheduledPost, Schedule, Topic } from "./db/models.js";
import { Op } from "sequelize";
import { Buffer } from "buffer";

// const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;

// https://image-api.dev-kyde.workers.dev/

export async function generateLinkedInPost(
  topic,
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
                  
                  PREVIOUSLY PUBLISHED CONTENT ON THIS TOPIC (DO NOT REPEAT THESE ANGLES/IDEAS):
                  ${previousPosts.map((p, i) => `[Post ${i + 1}]: ${p}`).join("\n")}
                  
                  YOUR GOAL:
                  Write a completely fresh, engaging post about this topic. 
                  - If the previous posts were "how-to" lists, write a personal story or a controversial opinion.
                  - If the previous posts were long, write something punchy and short.
                  - ensure the new post is DISTINCT from the history provided above.

                  STRUCTURE & TONE:
                  - Tone: ${description || userPersona.tone || "professional"}
                  - Author Context: ${userPersona.profession || "Industry Pro"} (${userPersona.industry || "General"})
                  
                  CRITICAL INSTRUCTIONS:
                  1. **NO TITLES**: Do NOT start with "Title:..." or any heading. 
                  2. **THE HOOK**: The FIRST line must be a "scroll-stopper" (viral hook). 
                     - Examples of hooks: "I screwed up.", "Stop doing X.", "Unpopular opinion:", "The secret nobody tells you about [Topic]..."
                     - Max 150 chars for the hook.
                  3. **BODY**: Short paragraphs, human-sounding, no corporate fluff.
                  4. **LENGTH**: 500-700 characters.
                  5. **FORMAT**: No emojis. 2-3 hashtags at the end.
                  
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
      const imagePrompt = `Professional LinkedIn background image related to "${topic}". 
            Clean, modern, no text, no logos.`;

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

    if (!user?.linkedinAccessToken) {
      console.log(`⚠️ Skipping ${topic.title} — user has no LinkedIn token.`);
      continue;
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
      topic.description || "Write a professional LinkedIn post on this topic.",
      topic.includeImage === true,
      user,
      previousContentList
    );

    if (!rawContent || !rawContent.post) {
      console.log("⚠️ Skipping post — no text generated (likely rate limit)");
      continue;
    }

    // Ensure string content
    // const content =
    //   typeof rawContent === "string"
    //     ? rawContent
    //     : rawContent.post || JSON.stringify(rawContent);

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
    // STEP 2 — Publish to LinkedIn
    // -------------------------------------------
    const publishResult = await publishToLinkedIn(
      user?.linkedinAccessToken,
      content,
      user.linkedinProfileId,
      user.email,
      rawContent.imageBase64 // ✅ REQUIRED
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
