import fetch from "node-fetch";
import { User, ScheduledPost, Schedule, Topic } from "./db/models.js";
import sequelize from "./db/connection.js";
import { GoogleGenAI, Modality } from "@google/genai";
import fs from "fs";

const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;

export async function publishDuePosts() {
  const now = new Date();
  console.log("🕒 Cron job started:", now.toISOString());

  const transaction = await sequelize.transaction();

  try {
    // Fetch all active schedules with topic and user
    const schedules = await Schedule.findAll({
      where: { isActive: true },
      include: [
        {
          model: Topic,
          include: [User],
        },
      ],
      transaction,
    });

    if (!schedules.length) {
      console.log("⚠️ No active schedules found.");
      await transaction.commit();
      return;
    }

    console.log(`Found ${schedules.length} active schedules.`);

    for (const schedule of schedules) {
      const topic = schedule.Topic;
      const user = topic?.User;
      if (!user || !user.linkedinAccessToken) continue;

      //console.log("post creator :", user);

      const PostUserId = user.linkedinProfileId; // ✅ LinkedIn author ID
      const PostUserEmail = user.email; // ✅ LinkedIn author ID
      const [hours, minutes] = schedule.scheduledTime.split(":").map(Number);

      const scheduledDate = new Date();
      scheduledDate.setHours(hours, minutes, 0, 0);

      const windowMs = 5 * 60 * 1000;
      const timeDiff = now - scheduledDate;
      const lastGenerated = schedule.lastGeneratedAt || new Date(0);

      let shouldPost = false;
      if (schedule.frequency === "daily") {
        shouldPost =
          timeDiff >= 0 &&
          timeDiff <= windowMs &&
          lastGenerated < scheduledDate;
      } else if (schedule.frequency === "weekly") {
        shouldPost =
          now.getDay() === schedule.dayOfWeek &&
          timeDiff >= 0 &&
          timeDiff <= windowMs &&
          lastGenerated < scheduledDate;
      } else if (schedule.frequency === "monthly") {
        shouldPost =
          now.getDate() === scheduledDate.getDate() &&
          timeDiff >= 0 &&
          timeDiff <= windowMs &&
          lastGenerated < scheduledDate;
      }

      if (!shouldPost) continue;

      console.log(`🧠 Generating post for topic "${topic.title}"...`);

      // Create a nested transaction per schedule
      const innerTx = await sequelize.transaction();

      try {
        // 1️⃣ Generate the LinkedIn post content
        const content = await generateLinkedInPost(
          topic.title,
          topic.description ||
            "Write a professional, engaging LinkedIn post related to this topic."
        );

        //console.log("Publishing to LinkedIn for user ID:", PostUserId);

        // 2️⃣ Publish to LinkedIn
        const result = await publishToLinkedIn(
          accessToken, // ✅ already from env
          content,
          PostUserId,
          PostUserEmail
        );

        // 3️⃣ If successful, record in ScheduledPost
        if (result.success) {
          await ScheduledPost.create(
            {
              scheduleId: schedule.id,
              topicId: topic.id,
              content: content.post,
              scheduledFor: scheduledDate,
              isActive: false,
              status: "published",
              publishedAt: now,
              linkedinPostId: result.postId,
              userId: user.id,
            },
            { transaction: innerTx }
          );

          await schedule.update(
            { lastGeneratedAt: now },
            { transaction: innerTx }
          );

          await innerTx.commit();

          console.log(
            `✅ Posted successfully for "${topic.title}" on LinkedIn`
          );
        } else {
          await innerTx.rollback();
          console.warn(
            `❌ Failed to publish for "${topic.title}": ${result.error}`
          );
        }
      } catch (err) {
        await innerTx.rollback();
        console.error(`🚨 Error publishing "${topic.title}":`, err);
      }
    }

    await transaction.commit();
    console.log("🎯 Finished checking schedules.");
  } catch (error) {
    await transaction.rollback();
    console.error("Error in publishDuePosts:", error);
  }
}

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
    const imagePrompt = `Genrate a professional background image related to ${topic}. It should be suitable for a professional LinkedIn post. The style should be clean, modern, and visually appealing to educational tech professionals and leaders. Avoid using any text or logos in the image. Use a color palette that is engaging yet professional. Strict size: "1024x1024"`;

    const imageResponse = await ai.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: imagePrompt,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });

    let imageBase64 = null;

    const candidates = imageResponse?.candidates || [];
    for (const candidate of candidates) {
      const parts = candidate?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;

          // Save a local copy (optional)
          const buffer = Buffer.from(imageBase64, "base64");
          fs.writeFileSync("linkedin-post-image.png", buffer);
          console.log("✅ Image saved as linkedin-post-image.png");

          break;
        }
      }
      if (imageBase64) break; // stop early if found
    }

    if (!imageBase64) {
      console.warn("⚠️ No base64 image found in Gemini response");
    }

    return { post, imageBase64 };
  } catch (error) {
    console.error("Gemini Image Generation Error:", error);
    throw new Error("Failed to generate AI content or image");
  }
}

export async function publishToLinkedIn(
  accessToken,
  content,
  PostuserId,
  PostUserEmail
) {
  //console.log("access token being used:", accessToken, PostuserId);

  try {
    let authorUrn = null;
    let imageUrn = null;
    const { post, imageBase64 } = content;

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
      //console.log("LinkedIn user profile data:", meData);

      if (!meData?.sub) {
        throw new Error("Missing 'sub' field in LinkedIn profile data.");
      }

      authorUrn = `urn:li:person:${meData.sub}`;
      console.log("LinkedIn author URN:", authorUrn);

      // Optional: store the LinkedIn ID in your DB for next time
      await User.update(
        { linkedinProfileId: meData.sub },
        { where: { email: PostUserEmail } }
      );
    }

    function formatPostText(rawText) {
      return rawText
        .replace(/\r\n/g, "\n") // normalize line endings
        .replace(/\n{3,}/g, "\n\n") // prevent too many blank lines
        .trim();
    }
    const formattedPost = formatPostText(post);
    // 🖼 Upload image if provided
    if (imageBase64) {
      //console.log("Uploading image to LinkedIn...");

      // Step 1: Register upload
      const registerRes = await fetch(
        "https://api.linkedin.com/v2/assets?action=registerUpload",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
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

      if (!registerRes.ok) {
        throw new Error(
          `Failed to register image upload: ${
            registerData.message || registerRes.statusText
          }`
        );
      }

      const uploadUrl =
        registerData.value.uploadMechanism[
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
        ].uploadUrl;
      imageUrn = registerData.value.asset;

      // Step 2: Upload image
      const buffer = Buffer.from(imageBase64, "base64");
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: buffer,
      });

      if (!uploadRes.ok) {
        throw new Error(`Failed to upload image: ${uploadRes.statusText}`);
      }

      //console.log("✅ Image uploaded:", imageUrn);
    }

    // 📝 Step 3: Publish post
    const postBody = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: formattedPost },
          shareMediaCategory: imageUrn ? "IMAGE" : "NONE",
          media: imageUrn ? [{ status: "READY", media: imageUrn }] : [],
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

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

    // response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    //   method: "POST",
    //   headers: {
    //     Authorization: `Bearer ${accessToken}`,
    //     "Content-Type": "application/json",
    //     "X-Restli-Protocol-Version": "2.0.0",
    //   },
    //   body: JSON.stringify({
    //     author: authorUrn,
    //     lifecycleState: "PUBLISHED",
    //     specificContent: {
    //       "com.linkedin.ugc.ShareContent": {
    //         shareCommentary: { text: content },
    //         shareMediaCategory: "NONE",
    //       },
    //     },
    //     visibility: {
    //       "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    //     },
    //   }),
    // });

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
