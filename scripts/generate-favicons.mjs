import fs from "fs";
import { createCanvas, Image } from "canvas";

// Create crisp SVG and PNG representations of the mascot emblem
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <clipPath id="circle-clip">
      <circle cx="256" cy="256" r="236" />
    </clipPath>
    <linearGradient id="beak-shine" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3a3d40" />
      <stop offset="40%" stop-color="#242628" />
      <stop offset="100%" stop-color="#111213" />
    </linearGradient>
  </defs>

  <!-- Outer Black Ring -->
  <circle cx="256" cy="256" r="250" fill="#0c0d0e" />
  
  <!-- Red Inner Circle Background -->
  <circle cx="256" cy="256" r="234" fill="#e61c24" />

  <!-- Bird Mascot Graphics clipped to inner circle -->
  <g clip-path="url(#circle-clip)">
    <!-- Red feather accent on nape / back of neck -->
    <path d="M 50 210 Q 75 250 85 295 L 115 285 L 110 320 L 140 305 L 130 345 L 165 315 L 180 340 L 195 290 Q 150 250 110 220 Z" fill="#e61c24" stroke="#0c0d0e" stroke-width="4" />

    <!-- Lower Body / Shoulder Plumage (Black) -->
    <path d="M 235 480 Q 250 410 280 370 L 295 385 L 340 345 L 330 380 L 390 350 L 440 415 Q 360 480 235 480 Z" fill="#0c0d0e" />

    <!-- White Chest and Throat -->
    <path d="M 75 390 Q 120 310 180 240 Q 240 235 310 235 Q 360 235 320 270 Q 275 290 280 370 L 255 385 L 285 435 L 245 445 L 265 480 L 120 480 Q 70 440 75 390 Z" fill="#ffffff" />
    
    <!-- White Head Crest / Crown plumage -->
    <!-- Top spiky crown silhouette -->
    <path d="M 35 200 
             L 75 165 L 70 145 L 105 125 L 105 100 L 150 85 L 155 65 L 205 55 L 215 42 L 270 45 L 280 36 L 335 55 L 345 75 L 385 105 L 375 125 L 400 150 L 370 170
             Q 340 130 285 120 
             Q 210 110 160 140 
             L 125 155 L 85 180 
             Z" fill="#ffffff" />

    <!-- Spiky White Crown Base connecting to Head -->
    <path d="M 45 220 
             C 40 180 70 130 130 80 
             C 200 40 290 40 360 85 
             C 380 100 400 130 395 160
             L 360 170
             C 340 135 290 120 220 120
             C 150 120 90 160 55 215 Z" fill="#ffffff" stroke="#0c0d0e" stroke-width="3" />

    <!-- Main White Head Body -->
    <path d="M 45 215 
             C 65 155 130 95 245 90 
             C 330 90 385 130 385 170 
             L 345 190 
             C 320 175 285 170 230 170 
             C 140 170 80 215 45 215 Z" fill="#ffffff" />

    <!-- White Feather Tufts on Crown Top (layer with black contour lines) -->
    <path d="M 120 105 L 140 75 L 165 95 L 195 65 L 220 88 L 255 58 L 278 82 L 315 65 L 335 95 L 365 90 L 375 125" fill="#ffffff" stroke="#0c0d0e" stroke-width="8" stroke-linejoin="round" stroke-linecap="round" />
    <path d="M 85 145 L 105 120 L 130 140" fill="none" stroke="#0c0d0e" stroke-width="7" stroke-linecap="round" />
    <path d="M 60 180 L 80 155 L 105 175" fill="none" stroke="#0c0d0e" stroke-width="7" stroke-linecap="round" />
    
    <!-- White Tuft Accents within Crown -->
    <path d="M 170 120 L 190 105 L 210 125" fill="none" stroke="#0c0d0e" stroke-width="6" stroke-linecap="round" />
    <path d="M 235 110 L 255 95 L 275 115" fill="none" stroke="#0c0d0e" stroke-width="6" stroke-linecap="round" />
    <path d="M 295 115 L 315 105 L 335 125" fill="none" stroke="#0c0d0e" stroke-width="6" stroke-linecap="round" />

    <!-- Black Mask Band across Eye and Cheeks -->
    <path d="M 35 225
             C 70 215 110 200 175 190
             L 190 175 L 215 195 L 265 175 L 290 190 L 330 175 L 365 200
             L 380 205 L 345 220 L 375 235 L 315 245
             C 255 245 210 260 170 290
             L 155 270 L 135 295 L 115 270 L 95 295 L 75 265 L 55 285
             Z" fill="#0c0d0e" stroke="#0c0d0e" stroke-width="4" stroke-linejoin="round" />

    <!-- Spiky black feather tips on top of eye mask -->
    <path d="M 115 195 L 130 175 L 155 195 L 180 168 L 205 190 L 245 165 L 275 188 L 310 165 L 335 185" fill="#0c0d0e" />

    <!-- Lower neck / throat white feather jagged border -->
    <path d="M 175 285 L 195 260 L 225 280 L 255 255 L 285 270 L 315 245" fill="#ffffff" stroke="#0c0d0e" stroke-width="8" stroke-linejoin="round" />
    <path d="M 220 315 L 245 290 L 270 315 L 295 285" fill="#ffffff" stroke="#0c0d0e" stroke-width="7" stroke-linejoin="round" />

    <!-- Eye Group -->
    <g id="kookaburra-eye">
      <!-- White outer eye contour / socket ring -->
      <ellipse cx="254" cy="182" rx="28" ry="28" fill="#ffffff" />
      <ellipse cx="254" cy="182" rx="26" ry="26" fill="#0c0d0e" />
      
      <!-- Red Iris -->
      <ellipse cx="254" cy="182" rx="22" ry="22" fill="#d8161d" />
      
      <!-- Iris inner shading -->
      <path d="M 235 175 A 22 22 0 0 0 274 195 A 22 22 0 0 1 235 175 Z" fill="#9c0e14" opacity="0.6" />
      
      <!-- Black Pupil -->
      <circle cx="254" cy="182" r="14" fill="#0c0d0e" />
      
      <!-- Crisp White Specular Catchlight / Reflection -->
      <circle cx="260" cy="176" r="5.5" fill="#ffffff" />
      <circle cx="247" cy="188" r="2.2" fill="#ffffff" opacity="0.8" />
    </g>

    <!-- Beak / Mandible Structure -->
    <!-- Lower Beak Red Edge Slash -->
    <path d="M 318 232 Q 365 242 415 238 Q 365 252 312 245 Z" fill="#e61c24" stroke="#0c0d0e" stroke-width="5" stroke-linejoin="round" />

    <!-- Main Upper Beak / Horn (Charcoal & Black) -->
    <path d="M 292 195 
             Q 360 200 440 215 
             L 495 235 
             Q 410 248 312 245 
             Q 300 220 292 195 Z" fill="url(#beak-shine)" stroke="#0c0d0e" stroke-width="7" stroke-linejoin="round" />

    <!-- Beak highlight / ridge line -->
    <path d="M 305 205 Q 380 212 470 230" fill="none" stroke="#5a5e63" stroke-width="4.5" stroke-linecap="round" />
    <!-- Beak mouth dividing line -->
    <path d="M 315 228 Q 395 232 485 234" fill="none" stroke="#0c0d0e" stroke-width="6" stroke-linecap="round" />

    <!-- Chest & Nape White Feather Spikes Details -->
    <path d="M 85 410 L 105 385 L 125 410 L 145 380 L 175 405 L 195 375 L 225 400 L 250 365" fill="#ffffff" stroke="#0c0d0e" stroke-width="7" stroke-linejoin="round" />
    <path d="M 265 405 L 285 375 L 305 405" fill="#ffffff" stroke="#0c0d0e" stroke-width="6" stroke-linejoin="round" />
  </g>

  <!-- Heavy Outer Circular Frame Border Ring -->
  <circle cx="256" cy="256" r="242" fill="none" stroke="#0c0d0e" stroke-width="20" />
</svg>`;

// Write the primary SVG favicon
fs.writeFileSync("./public/favicon.svg", svgContent.trim());
console.log("Wrote public/favicon.svg");

async function renderSizes() {
  const svg = fs.readFileSync("./public/favicon.svg");
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = svg;
  });

  const sizes = [
    { size: 512, name: "public/favicon.png" },
    { size: 180, name: "public/apple-touch-icon.png" },
    { size: 32, name: "public/favicon-32x32.png" },
    { size: 16, name: "public/favicon-16x16.png" },
  ];

  for (const { size, name } of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, size, size);
    fs.writeFileSync(name, canvas.toBuffer("image/png"));
    console.log(`Rendered ${name} (${size}x${size})`);
  }

  // Also copy to src/assets for any internal references
  fs.copyFileSync("public/favicon.png", "src/assets/favicon-source.png");
}

renderSizes().catch(console.error);
