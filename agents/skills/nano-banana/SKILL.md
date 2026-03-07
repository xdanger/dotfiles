---
name: nano-banana
description: Generate and edit images using Google's Nano Banana 2 (Gemini 3.1 Flash Image) API. Use when the user asks to generate, create, edit, modify, change, alter, or update images. Also use when user references an existing image file and asks to modify it in any way (e.g., "modify this image", "change the background", "replace X with Y"). Supports both text-to-image generation and image-to-image editing with configurable resolution (1K default, 2K, or 4K for high resolution). DO NOT read the image file first - use this skill directly with the --input-image parameter.
---

# Nano Banana 2 Image Generation & Editing

Generate new images or edit existing ones using Google's Nano Banana 2 API (Gemini 3.1 Flash Image).

## Usage

Run the script using absolute path (do NOT cd to skill directory first):

**Generate new image:**
```bash
uv run ~/.agents/skills/nano-banana/scripts/generate_image.py --prompt "your image description" --filename "output-name.png" [--resolution 1K|2K|4K] [--api-key KEY]
```

**Edit existing image:**
```bash
uv run ~/.agents/skills/nano-banana/scripts/generate_image.py --prompt "editing instructions" --filename "output-name.png" --input-image "path/to/input.png" [--resolution 1K|2K|4K] [--api-key KEY]
```

**Multi-image composition (up to 14):**
```bash
uv run ~/.agents/skills/nano-banana/scripts/generate_image.py --prompt "combine into one scene" --filename "out.png" -i img1.png -i img2.png [--resolution 4K]
```

**Important:** Always run from the user's current working directory so images are saved where the user is working, not in the skill directory.

## Resolution Options

- **1K** (default) - ~1024px resolution
- **2K** - ~2048px resolution
- **4K** - ~4096px resolution (native 4K)

Map user requests to API parameters:
- No mention of resolution → `1K`
- "low resolution", "1080", "1080p", "1K" → `1K`
- "2K", "2048", "normal", "medium resolution" → `2K`
- "high resolution", "high-res", "hi-res", "4K", "ultra" → `4K`

## Aspect Ratios

14 supported ratios: `1:1`, `1:4`, `1:8`, `2:3`, `3:2`, `3:4`, `4:1`, `4:3`, `4:5`, `5:4`, `8:1`, `9:16`, `16:9`, `21:9`

Default: model decides based on prompt context.

## API Key

The script checks for API key in this order:
1. `--api-key` argument (use if user provided key in chat)
2. `GEMINI_API_KEY` environment variable

## Filename Generation

Generate filenames with the pattern: `yyyy-mm-dd-hh-mm-ss-name.png`

Examples:
- Prompt "A serene Japanese garden" → `2026-03-03-20-56-00-japanese-garden.png`
- Prompt "sunset over mountains" → `2026-03-03-21-00-00-sunset-mountains.png`

## Image Editing

When the user wants to modify an existing image:
1. Check if they provide an image path or reference an image in the current directory
2. Use `--input-image` parameter with the path to the image
3. The prompt should contain editing instructions
4. For editing, resolution auto-detects from input image if not specified

## Model Info

- **Model:** Nano Banana 2 (`gemini-3.1-flash-image-preview`)
- **Speed:** 4-6 seconds (3-5x faster than Nano Banana Pro)
- **Quality:** ~95% of Pro level
- **Price:** Input $0.25/M tokens, Output $1.50/M tokens
- **Thinking mode:** Supported (Minimal / High / Dynamic)
- **Search grounding:** Supported

## Output

- Saves PNG to current directory (or specified path if filename includes directory)
- Script outputs the full path to the generated image
- **Do not read the image back** - just inform the user of the saved path
