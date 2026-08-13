import { composeStylePrompt } from './src/lib/prompt-compositor';

const selections = {
  genre: ['Lo-fi Hip-Hop'],
  mood: ['Calm, Serene'],
  instruments: ['Piano']
};

console.log("Selections:", selections);
try {
  const result = composeStylePrompt(selections, false);
  console.log("Result:", result);
} catch (err) {
  console.error("Error running composeStylePrompt:", err);
}
