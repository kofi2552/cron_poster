import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryConfig } from './db/models.js';

// Dynamically fetch config from DB
export async function getCloudinary() {
    // 1. Fetch the single configuration record (ID: 1) from the NEW model
    const config = await CloudinaryConfig.findByPk(1);

    // 2. Use DB values or fallback to process.env
    const cloud_name = config?.cloud_name || process.env.CLOUDINARY_CLOUD_NAME;
    const api_key = config?.api_key || process.env.CLOUDINARY_API_KEY;
    const api_secret = config?.api_secret || process.env.CLOUDINARY_API_SECRET;

    if (!cloud_name || !api_key || !api_secret) {
        throw new Error("Cloudinary credentials are missing from AppConfig and Environment variables");
    }

    cloudinary.config({
        cloud_name,
        api_key,
        api_secret,
        analytics: false, // Prevents 'Must supply sdk_semver' error
    });

    return { cloudinary, cloud_name };
}

export async function createCompositeImageCloudinary(bgBase64, textHook) {
    if (!bgBase64 || !textHook) {
        throw new Error("Missing required parameters for Cloudinary compositing");
    }

    const { cloudinary, cloud_name } = await getCloudinary();

    // 1. Upload raw base64 background to Cloudinary
    let b64Str = bgBase64;
    if (!b64Str.startsWith('data:image')) {
        b64Str = `data:image/png;base64,${b64Str}`;
    }

    const baseUploadResult = await cloudinary.uploader.upload(
        b64Str,
        { folder: 'linkedin-poster' }
    );
    const { public_id: publicId } = baseUploadResult;

    const layerId = publicId.replace(/\//g, ':');

    // Sanitize the hook text for Cloudinary overlay and apply 70-character word-boundary truncation
    const rawText = (textHook || "").replace(/^"|"$/g, '').trim();
    let truncatedText = rawText;
    if (rawText.length > 70) {
        let sliced = rawText.slice(0, 70);
        const lastSpace = sliced.lastIndexOf(' ');
        if (lastSpace > 0) {
            sliced = sliced.slice(0, lastSpace);
        }
        truncatedText = sliced.trim().replace(/[,.;:!?]+$/, '') + "....";
    }
    // Use double escape for Cloudinary text rendering
    const encodedText = encodeURIComponent(encodeURIComponent(truncatedText));

    // Identical pipeline to Next.js
    const transformations = [
        `c_fit,co_rgb:ffffff,l_text:Bricolage Grotesque@google_95_700_left:${encodedText},w_750`,
        `fl_layer_apply,fl_no_overflow,g_center`,
    ].join('/');

    const compositeUrl = `https://res.cloudinary.com/${cloud_name}/image/upload/${transformations}/${publicId}`;

    // 2. Fetch the newly composited image
    const response = await fetch(compositeUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch composite from Cloudinary. Status: ${response.status}`);
    }

    // 3. Convert downloaded buffer into base64
    const buffer = await response.arrayBuffer();
    const compositeBase64 = Buffer.from(buffer).toString('base64');

    return {
        compositeBase64,
        publicId // Return the background image ID for eventual cleanup
    };
}

/**
 * Creates a TikTok-compliant MP4 (max 50s) by layering a static image over an audio file.
 * Returns the downloaded buffer of the generated MP4.
 */
export async function createTikTokVideo(imagePublicIdOrBase64, audioPublicId) {
    const { cloudinary, cloud_name } = await getCloudinary();

    let imagePublicId = imagePublicIdOrBase64;

    // If it's pure base64 without data type, format it
    if (!imagePublicIdOrBase64.includes('/') && imagePublicIdOrBase64.length > 500) {
        let b64Str = imagePublicIdOrBase64;
        if (!b64Str.startsWith('data:image')) {
            b64Str = `data:image/png;base64,${b64Str}`;
        }
        console.log("TikTok Video Engine: Uploading provided base64 image layer...");
        const uploadRes = await cloudinary.uploader.upload(b64Str, { folder: 'linkedin-poster' });
        imagePublicId = uploadRes.public_id;
    }

    const cleanImageLayerId = imagePublicId.replace(/\//g, ':');

    // fl_layer_apply overlays the image over the audio.
    // eo_50.0 limits the entire video duration to 50 seconds.
    // We scale to fit into 1080x1920 or standard 1080x1080 depending on the composite format.
    const transformations = [
        `l_${cleanImageLayerId}/c_fit,w_1080,h_1080/fl_layer_apply`,
        `eo_50.0`
    ].join('/');

    // Ensure audioPublicId uses proper format
    const cleanAudioId = audioPublicId.replace(/\//g, ':');

    // Combine them: audio runs as the base video, image lies on top statically for the exact length.
    const videoUrl = `https://res.cloudinary.com/${cloud_name}/video/upload/${transformations}/${cleanAudioId}.mp4`;

    console.log("TikTok Video Engine: Generating MP4 URL:", videoUrl);

    const res = await fetch(videoUrl);

    if (!res.ok) {
        const errDump = await res.text();
        throw new Error(`Failed to generate MP4 Video via Cloudinary. Status: ${res.status}. Data: ${errDump}`);
    }

    console.log("TikTok Video Engine: Successfully downloaded encoded MP4 buffer.");
    const arrayBuffer = await res.arrayBuffer();
    return {
        buffer: Buffer.from(arrayBuffer),
        publicId: imagePublicId // Return the image layer ID for eventual cleanup
    };
}

/**
 * Uploads a raw image to Cloudinary (used by Facebook and Instagram to host images)
 */
export async function uploadToCloudinary(imageBase64) {
    return new Promise(async (resolve, reject) => {
        try {
            const { cloudinary } = await getCloudinary();

            let b64Str = imageBase64;
            if (!b64Str.startsWith('data:image')) {
                b64Str = `data:image/png;base64,${b64Str}`;
            }

            cloudinary.uploader.upload(b64Str, {
                folder: 'linkedin-poster',
                width: 1080,
                height: 1080,
                crop: 'fill'
            }, (error, result) => {
                if (error) return reject(error);
                resolve(result); // returns secure_url and public_id
            });
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Deletes multiple resources from Cloudinary
 */
export async function deleteCloudinaryResources(publicIds, resourceType = "image") {
    if (!publicIds || publicIds.length === 0) return;

    const { cloudinary } = await getCloudinary();

    return new Promise((resolve, reject) => {
        cloudinary.api.delete_resources(publicIds, { resource_type: resourceType }, (error, result) => {
            if (error) return reject(error);
            resolve(result);
        });
    });
}
