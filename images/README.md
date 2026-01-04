# Card Images Setup Guide

## Quick Setup

1. **Place your card images in the `images/cards/` folder**
2. **Name your images using the card ID** (e.g., `f_py1.jpg`, `b_m1.png`)
3. **Supported formats**: `.jpg`, `.jpeg`, `.png`, `.webp`

## Image Naming Convention

Images should be named using the card ID from your card database:

```
images/cards/
├── f_py1.jpg     # Fish - Great White Shark
├── f_py2.jpg     # Fish - Tuna
├── b_m1.jpg      # Bird - Eagle
├── m_r1.jpg      # Mammal - Bear
├── r_s1.jpg      # Reptile - Snake
└── a_f1.jpg      # Amphibian - Frog
```

## How to Find Card IDs

You can find card IDs in the `js/cards.js` file. Each card has an `id` field:

```javascript
{
  id: "f_py1",           // <-- This is the card ID
  name: "Great White Shark",
  type: "Predator",
  // ... other properties
}
```

## Custom Image Names (Optional)

If you want to use custom filenames, edit `js/cardImages.js`:

```javascript
const CARD_IMAGE_MAP = {
  "f_py1": "great_white_shark.jpg",  // Custom filename
  "b_m1": "eagle.jpg",               // Custom filename
};
```

## Image Specifications

- **Aspect Ratio**: 4:3 (landscape) to match card orientation
- **Recommended Size**: 400x300px or higher for better quality
- **Format**: JPG for photos, PNG for transparent backgrounds, WebP for modern browsers

## Testing

1. Add an image file (e.g., `f_py1.jpg`) to `images/cards/`
2. Start a game and play a card with that ID
3. The image should appear in both the card and the inspector

## Troubleshooting

- **Image not showing?** Check that the filename matches the card ID exactly
- **Broken image?** The system will fall back to the 🎨 placeholder
- **Wrong aspect ratio?** Images will be cropped to fit the 4:3 container

## Example

To add an image for "Great White Shark" (ID: f_py1):

1. Save your image as `images/cards/f_py1.jpg`
2. Start the game
3. The image will appear automatically in cards and inspector
