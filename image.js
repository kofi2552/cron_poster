import { createCanvas, loadImage } from '@napi-rs/canvas';
import fetch from 'node-fetch';

// A set of 8 ultra-premium, modern light-mode central wavy aura presets
const GRADIENT_PRESETS = [
    {
        name: "Teal Aura",
        color: "#5fc3b6",
        accent: "#26a69a"
    },
    {
        name: "Lavender Breeze",
        color: "#b39ddb",
        accent: "#9575cd"
    },
    {
        name: "Rose Quartz",
        color: "#f48fb1",
        accent: "#ec407a"
    },
    {
        name: "Ocean Wave",
        color: "#90caf9",
        accent: "#42a5f5"
    },
    {
        name: "Sage Forest",
        color: "#a5d6a7",
        accent: "#66bb6a"
    },
    {
        name: "Apricot Glow",
        color: "#ffcc80",
        accent: "#ffa726"
    },
    {
        name: "Coral Sunrise",
        color: "#ffab91",
        accent: "#ff7043"
    },
    {
        name: "Royal Indigo",
        color: "#c5cae9",
        accent: "#7986cb"
    }
];

// Helper to convert hex colors to RGBA format cleanly
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Helper to deterministic hash strings to select gradient preset index
function getPresetIndex(str, max) {
    let hash = 0;
    if (!str) return 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0; // Force to 32bit integer
    }
    return Math.abs(hash) % max;
}

/**
 * Programmatically generates a gorgeous, high-end mesh gradient using canvas.
 * Deterministic based on prompt input (e.g. topic title).
 */
export async function generateGradientImage(prompt) {
    // Select color preset randomly so they don't always look the same
    const presetIdx = Math.floor(Math.random() * GRADIENT_PRESETS.length);
    const preset = GRADIENT_PRESETS[presetIdx];
    console.log(`Gradient Engine (test-cron): Rendering premium wavy aura "${preset.name}"...`);

    const canvas = createCanvas(1080, 1080);
    const ctx = canvas.getContext('2d');

    // 1. Fill base canvas with clean, soft off-white
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, 1080, 1080);

    const themeColor = preset.color;
    const accentColor = preset.accent;

    // 2. Select a random aura composition layout style
    // Styles: 0 = Wavy Vertical Column, 1 = Diagonal Left-to-Right, 2 = Diagonal Right-to-Left, 3 = Wavy Horizontal Wave
    const layoutStyle = Math.floor(Math.random() * 4);
    
    // Add organic random offsets for coordination shifts
    const rand = (min, max) => min + Math.random() * (max - min);

    if (layoutStyle === 0) {
        // STYLE 0: Wavy Central Vertical Column
        console.log(`  └─ Layout Style: Wavy Vertical Column`);
        const x1 = rand(350, 550);
        const y1 = rand(120, 240);
        const r1 = rand(550, 750);

        const x2 = rand(530, 730);
        const y2 = rand(460, 620);
        const r2 = rand(600, 800);

        const x3 = rand(350, 550);
        const y3 = rand(840, 960);
        const r3 = rand(550, 750);

        // Glows
        const topGlow = ctx.createRadialGradient(x1, y1, 0, x1, y1, r1);
        topGlow.addColorStop(0, hexToRgba(themeColor, 0.48));
        topGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = topGlow;
        ctx.fillRect(0, 0, 1080, 1080);

        const midGlow = ctx.createRadialGradient(x2, y2, 0, x2, y2, r2);
        midGlow.addColorStop(0, hexToRgba(accentColor, 0.52));
        midGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = midGlow;
        ctx.fillRect(0, 0, 1080, 1080);

        const btmGlow = ctx.createRadialGradient(x3, y3, 0, x3, y3, r3);
        btmGlow.addColorStop(0, hexToRgba(themeColor, 0.48));
        btmGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = btmGlow;
        ctx.fillRect(0, 0, 1080, 1080);

        // Shape with side highlights
        const leftHighlight = ctx.createRadialGradient(rand(-250, -100), y2, 0, rand(-250, -100), y2, rand(700, 850));
        leftHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
        leftHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = leftHighlight;
        ctx.fillRect(0, 0, 1080, 1080);

        const rightHighlight = ctx.createRadialGradient(rand(1180, 1330), y2, 0, rand(1180, 1330), y2, rand(700, 850));
        rightHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
        rightHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = rightHighlight;
        ctx.fillRect(0, 0, 1080, 1080);

    } else if (layoutStyle === 1) {
        // STYLE 1: Diagonal Flow (Top-Left to Bottom-Right)
        console.log(`  └─ Layout Style: Diagonal Top-Left to Bottom-Right`);
        const x1 = rand(150, 350);
        const y1 = rand(150, 350);
        const r1 = rand(600, 800);

        const x2 = rand(460, 620);
        const y2 = rand(460, 620);
        const r2 = rand(650, 850);

        const x3 = rand(730, 930);
        const y3 = rand(730, 930);
        const r3 = rand(600, 800);

        // Glows along diagonal path
        const g1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, r1);
        g1.addColorStop(0, hexToRgba(themeColor, 0.48));
        g1.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g1;
        ctx.fillRect(0, 0, 1080, 1080);

        const g2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, r2);
        g2.addColorStop(0, hexToRgba(accentColor, 0.52));
        g2.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, 1080, 1080);

        const g3 = ctx.createRadialGradient(x3, y3, 0, x3, y3, r3);
        g3.addColorStop(0, hexToRgba(themeColor, 0.48));
        g3.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g3;
        ctx.fillRect(0, 0, 1080, 1080);

        // Shape from opposing diagonal corners (Top-Right and Bottom-Left)
        const trHighlight = ctx.createRadialGradient(rand(1100, 1250), rand(-150, 0), 0, rand(1100, 1250), rand(-150, 0), rand(750, 900));
        trHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
        trHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = trHighlight;
        ctx.fillRect(0, 0, 1080, 1080);

        const blHighlight = ctx.createRadialGradient(rand(-150, 0), rand(1100, 1250), 0, rand(-150, 0), rand(1100, 1250), rand(750, 900));
        blHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
        blHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = blHighlight;
        ctx.fillRect(0, 0, 1080, 1080);

    } else if (layoutStyle === 2) {
        // STYLE 2: Diagonal Flow (Top-Right to Bottom-Left)
        console.log(`  └─ Layout Style: Diagonal Top-Right to Bottom-Left`);
        const x1 = rand(730, 930);
        const y1 = rand(150, 350);
        const r1 = rand(600, 800);

        const x2 = rand(460, 620);
        const y2 = rand(460, 620);
        const r2 = rand(650, 850);

        const x3 = rand(150, 350);
        const y3 = rand(730, 930);
        const r3 = rand(600, 800);

        // Glows
        const g1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, r1);
        g1.addColorStop(0, hexToRgba(themeColor, 0.48));
        g1.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g1;
        ctx.fillRect(0, 0, 1080, 1080);

        const g2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, r2);
        g2.addColorStop(0, hexToRgba(accentColor, 0.52));
        g2.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, 1080, 1080);

        const g3 = ctx.createRadialGradient(x3, y3, 0, x3, y3, r3);
        g3.addColorStop(0, hexToRgba(themeColor, 0.48));
        g3.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g3;
        ctx.fillRect(0, 0, 1080, 1080);

        // Shape from opposing diagonal corners (Top-Left and Bottom-Right)
        const tlHighlight = ctx.createRadialGradient(rand(-150, 0), rand(-150, 0), 0, rand(-150, 0), rand(-150, 0), rand(750, 900));
        tlHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
        tlHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = tlHighlight;
        ctx.fillRect(0, 0, 1080, 1080);

        const brHighlight = ctx.createRadialGradient(rand(1100, 1250), rand(1100, 1250), 0, rand(1100, 1250), rand(1100, 1250), rand(750, 900));
        brHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
        brHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = brHighlight;
        ctx.fillRect(0, 0, 1080, 1080);

    } else {
        // STYLE 3: Wavy Horizontal Wave
        console.log(`  └─ Layout Style: Horizontal Wavy Wave`);
        const x1 = rand(120, 240);
        const y1 = rand(480, 680);
        const r1 = rand(550, 750);

        const x2 = rand(460, 620);
        const y2 = rand(360, 520);
        const r2 = rand(600, 800);

        const x3 = rand(840, 960);
        const y3 = rand(480, 680);
        const r3 = rand(550, 750);

        // Glows running horizontally
        const g1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, r1);
        g1.addColorStop(0, hexToRgba(themeColor, 0.48));
        g1.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g1;
        ctx.fillRect(0, 0, 1080, 1080);

        const g2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, r2);
        g2.addColorStop(0, hexToRgba(accentColor, 0.52));
        g2.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, 1080, 1080);

        const g3 = ctx.createRadialGradient(x3, y3, 0, x3, y3, r3);
        g3.addColorStop(0, hexToRgba(themeColor, 0.48));
        g3.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g3;
        ctx.fillRect(0, 0, 1080, 1080);

        // Shape with top and bottom white highlights
        const topHighlight = ctx.createRadialGradient(x2, rand(-250, -100), 0, x2, rand(-250, -100), rand(700, 850));
        topHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
        topHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = topHighlight;
        ctx.fillRect(0, 0, 1080, 1080);

        const btmHighlight = ctx.createRadialGradient(x2, rand(1180, 1330), 0, x2, rand(1180, 1330), rand(700, 850));
        btmHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
        btmHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = btmHighlight;
        ctx.fillRect(0, 0, 1080, 1080);
    }

    // 4. Apply a consistent sand-like monochromatic digital noise grain texture (increased intensity to 32!)
    const imgData = ctx.getImageData(0, 0, 1080, 1080);
    const data = imgData.data;
    const noiseIntensity = 32; // Higher sand grain texture visibility as requested!
    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * noiseIntensity;
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    // 5. Convert to Base64 PNG
    const buffer = await canvas.encode('png');
    return buffer.toString('base64');
}

/**
 * Polishes a raw AI image from Cloudflare to look premium, modern, and branded.
 * Uses soft-light blending filters and technical overlays to replace cheesy AI looks.
 */
export async function polishAiImage(rawBase64, prompt) {
    try {
        console.log("Image Pipeline (test-cron): Applying high-end native filters and editorial overlays to raw AI background...");
        let imgData = rawBase64;
        if (!imgData.startsWith('data:')) {
            imgData = `data:image/png;base64,${imgData}`;
        }
        
        const img = await loadImage(imgData);
        
        const canvas = createCanvas(1080, 1080);
        const ctx = canvas.getContext('2d');
        
        // 1. Render base AI image (cover scaling)
        const scale = Math.max(1080 / img.width, 1080 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (1080 - w) / 2;
        const y = (1080 - h) / 2;
        ctx.drawImage(img, x, y, w, h);
        
        // 2. Get theme gradient based on topic prompt
        const presetIdx = getPresetIndex(prompt, GRADIENT_PRESETS.length);
        const preset = GRADIENT_PRESETS[presetIdx];
        
        // 3. Blend overlay color tint (harmonizes and unifies the colors with topic's gradient theme)
        ctx.save();
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.52;
        const tintGrad = ctx.createLinearGradient(0, 0, 1080, 1080);
        tintGrad.addColorStop(0, preset.baseStart);
        tintGrad.addColorStop(1, preset.baseEnd);
        ctx.fillStyle = tintGrad;
        ctx.fillRect(0, 0, 1080, 1080);
        ctx.restore();
        
        // 4. Draw a beautiful soft white ambient radial vignette (maintains light composition and high-end feel)
        ctx.save();
        const vignette = ctx.createRadialGradient(540, 540, 360, 540, 540, 800);
        vignette.addColorStop(0, 'rgba(255, 255, 255, 0)');
        vignette.addColorStop(1, 'rgba(255, 255, 255, 0.35)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, 1080, 1080);
        ctx.restore();

        // 5. Sophisticated tech-editorial grid overlay (adds premium structured design feeling - dark slate lines for light bg)
        ctx.save();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.04)';
        ctx.lineWidth = 1;
        for (let i = 120; i < 1080; i += 120) {
            // Vertical gridline
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, 1080);
            ctx.stroke();
            
            // Horizontal gridline
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(1080, i);
            ctx.stroke();
        }
        ctx.restore();
        
        const buffer = await canvas.encode('png');
        return buffer.toString('base64');
    } catch (e) {
        console.error("Image Pipeline Warning: Failed to apply styling overlay to AI image. Using raw AI image as fallback.", e);
        return rawBase64;
    }
}

/**
 * Core image generator entrypoint.
 * Automatically chooses between generating a beautiful ambient gradient or a polished, styled AI concept image.
 *
 * @param {string} prompt - Prompt/Topic string used to generate/style the image
 * @param {boolean} useAiImage - True to use Cloudflare AI, false to use local premium gradient
 */
export async function generateImage(prompt, useAiImage = false) {
    if (!useAiImage) {
        // Return premium gradient
        return generateGradientImage(prompt);
    }

    const imageApiKey = process.env.CF_IMAGE_GENERATION_API_KEY;
    if (!imageApiKey) {
        console.warn("CF_IMAGE_GENERATION_API_KEY is missing. Falling back to local gradient.");
        return generateGradientImage(prompt);
    }

    try {
        console.log("Image Pipeline (test-cron): Triggering Cloudflare workers image generator...");
        // Instruct the Cloudflare API to generate a beautiful custom wavy color aura background with colors matching the topic theme
        const styledPrompt = `A high-end, minimalist, high-resolution background with a central vertical column of diffused, grainy color aura merging into soft white light, with strong digital noise and sand-like grain texture, atmospheric airy calm aesthetic, color theme inspired specifically by: "${prompt}"`;
        
        const res = await fetch("https://image-api.dev-kyde.workers.dev/", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${imageApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ prompt: styledPrompt }),
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error("Cloudflare Image API Error:", errorText);
            throw new Error(`Cloudflare API Error: ${res.statusText}`);
        }

        const arrayBuffer = await res.arrayBuffer();
        const rawBase64 = Buffer.from(arrayBuffer).toString("base64");

        // Beautify the raw output using our premium polishing engine
        return polishAiImage(rawBase64, prompt);
    } catch (error) {
        console.error("AI Image Generation failed. Falling back to local gradient:", error);
        return generateGradientImage(prompt);
    }
}
