
const cache = new Map<string, { data: string, timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export default async function handler(request: any, response: any) {
  // Allow CORS
  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // Support both GET (query) and POST (body)
  // We use 'etymology' parameter as context, or definition if passed
  const { word, etymology, definition } = request.body && Object.keys(request.body).length > 0 ? request.body : request.query;
  
  if (!word) {
    return response.status(400).json({ error: "Word parameter is required" });
  }

  const cleanWord = (word as string).trim().toLowerCase();

  // 1. Check Cache
  const cached = cache.get(cleanWord);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return response.status(200).json({ image: cached.data });
  }

  try {
    // Construct Prompt for Pollinations
    const contextText = definition || etymology || 'Abstract representation';
    const context = contextText.split('.')[0].substring(0, 100).replace(/[^a-zA-Z0-9 ]/g, ' ');
    
    // Style: "cute flat vector illustration... cartoon style, bright colors, educational illustration, clean background, modern infographic style"
    const prompt = `cute flat vector illustration representing the meaning of the word "${word}", context: ${context}, cartoon style, bright colors, educational illustration, clean background, modern infographic style`;
    
    const encodedPrompt = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=768&height=768&nologo=true&seed=${Math.floor(Math.random() * 1000)}`;

    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error("Pollinations API Error");

    const arrayBuffer = await imgRes.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    if (base64Image) {
        // 2. Set Cache
        if (cache.size > 50) {
            const oldestKey = cache.keys().next().value;
            if(oldestKey) cache.delete(oldestKey);
        }
        cache.set(cleanWord, { data: base64Image, timestamp: Date.now() });

        return response.status(200).json({ image: base64Image });
    } else {
        throw new Error("No image data received.");
    }
  } catch (error: any) {
    console.error("Image API Error for word:", word, error);
    return response.status(500).json({ error: error.message || "Failed to generate image" });
  }
}
