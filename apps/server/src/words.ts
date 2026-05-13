export const WORDS = [
  "airplane",
  "apple",
  "backpack",
  "birthday",
  "camera",
  "castle",
  "coffee",
  "dinosaur",
  "fireworks",
  "guitar",
  "hamburger",
  "island",
  "jacket",
  "kangaroo",
  "lighthouse",
  "moon",
  "octopus",
  "pizza",
  "rainbow",
  "snowman",
  "telescope",
  "umbrella",
  "volcano",
  "waterfall"
];

export function pickWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)] ?? "apple";
}
