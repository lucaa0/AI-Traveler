import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is missing. Please configure your API key.");
}

export interface TravelParams {
  origin: string;
  destination: string;
  date: string;
  budget: string;
  days: number;
  interests: string[];
}

export interface Itinerary {
  destination: string;
  country: string;
  summary: string;
  flightDetails: {
    outbound: string;
    return: string;
    estimatedCost: string;
  };
  days: {
    day: number;
    theme: string;
    imageKeyword: string;
    activities: {
      time: string;
      title: string;
      placeName: string;
      description: string;
      insight: string;
      costEstimate: string;
      mapsUrl: string;
      ticketUrl: string;
      imagePrompt: string;
      notes: string;
    }[];
  }[];
  tips: string[];
}

export async function generateItinerary(
  params: TravelParams,
  onProgress?: (status: string) => void
): Promise<Itinerary> {
  onProgress?.('AI is crafting your perfect itinerary...');

  const prompt = `You are a Master Travel Planner and Luxury Concierge. Create a highly precise, complete, and elegant day-by-day itinerary for a trip from ${params.origin} to ${params.destination} starting on ${params.date}.
Duration: ${params.days} days
Budget: ${params.budget}
Interests: ${params.interests.join(', ')}

Crucial Requirements:
1. Include realistic estimated flight times (outbound and return) and estimated flight costs based on the origin and destination.
2. Make the daily activities very detailed with specific times. Include top attractions, hidden gems, and local culinary highlights that fit the budget and interests.
3. Provide a short, elegant summary of the trip.
4. Provide 4-6 crucial travel tips (packing, etiquette, transport, safety).

Return the itinerary as a structured JSON object containing 'summary', 'flightDetails', 'days', and 'tips'.`;

  const res = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: 'A short, elegant summary of the trip' },
          flightDetails: {
            type: Type.OBJECT,
            properties: {
              outbound: { type: Type.STRING, description: 'Outbound flight details including airline, departure time, and arrival time' },
              return: { type: Type.STRING, description: 'Return flight details including airline, departure time, and arrival time' },
              estimatedCost: { type: Type.STRING, description: 'Estimated total flight cost' }
            },
            required: ['outbound', 'return', 'estimatedCost']
          },
          days: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.INTEGER, description: 'Day number' },
                theme: { type: Type.STRING, description: 'Theme of the day' },
                imageKeyword: { type: Type.STRING, description: 'A single visual keyword representing the day (e.g., temple, sushi, mountain, museum, skyline)' },
                activities: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      time: { type: Type.STRING, description: 'Time of the activity (e.g., Morning, 10:00 AM)' },
                      title: { type: Type.STRING, description: 'Title of the activity' },
                      placeName: { type: Type.STRING, description: 'The exact name of the specific place, venue, or landmark (e.g., "Louvre Museum", "Osteria Francescana"). If it is a general activity, provide a relevant visual keyword (e.g., "Pasta", "Sunset").' },
                      description: { type: Type.STRING, description: 'Description of the activity' },
                      insight: { type: Type.STRING, description: 'A fascinating historical fact, local secret, or unique insight about this specific place.' },
                      costEstimate: { type: Type.STRING, description: 'Estimated cost' },
                      mapsUrl: { type: Type.STRING, description: 'Google Maps search URL for this exact place' },
                      ticketUrl: { type: Type.STRING, description: 'URL to buy tickets or official website. Empty string if not applicable.' },
                      imagePrompt: { type: Type.STRING, description: 'A highly optimized, concise Google Image Search query for this exact location. Include the specific name of the place and the city. Do NOT include camera settings or AI prompt keywords. Example: "Louvre Museum Paris exterior" or "Osteria Francescana Modena food".' },
                      notes: { type: Type.STRING, description: 'Personal notes or customization preferences for this activity.' }
                    },
                    required: ['time', 'title', 'placeName', 'description', 'insight', 'costEstimate', 'mapsUrl', 'ticketUrl', 'imagePrompt', 'notes']
                  }
                }
              },
              required: ['day', 'theme', 'imageKeyword', 'activities']
            }
          },
          tips: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Helpful travel tips'
          }
        },
        required: ['summary', 'flightDetails', 'days', 'tips']
      }
    }
  });
  
  let plannerData: any = {};
  try {
    plannerData = JSON.parse(res.text?.trim() || '{}');
  } catch (e) {
    console.error("Failed to parse planner data:", e, res.text);
    throw new Error("The AI generated an invalid itinerary format. Please try again.");
  }

  onProgress?.('Finalizing itinerary...');

  return {
    destination: params.destination,
    country: params.destination.split(',').pop()?.trim() || params.destination, // Simple heuristic for now
    summary: plannerData.summary || 'A wonderful journey awaits.',
    flightDetails: plannerData.flightDetails || { outbound: '', return: '', estimatedCost: '' },
    days: plannerData.days || [],
    tips: plannerData.tips || []
  };
}

const imageCache = new Map<string, string>();
const failedCache = new Set<string>();

export async function fetchPlaceImage(placeName: string, destination: string, imagePrompt?: string): Promise<string> {
  const googleQuery = imagePrompt || `${placeName} ${destination} travel photography`;
  const fallbackQuery = `${placeName} ${destination}`;
  
  if (imageCache.has(googleQuery)) {
    return imageCache.get(googleQuery)!;
  }
  
  if (failedCache.has(googleQuery)) {
    // If we already failed, skip to fallback
  } else {
    const googleApiKey = import.meta.env.VITE_GOOGLE_SEARCH_API_KEY;
    const googleCx = import.meta.env.VITE_GOOGLE_SEARCH_CX;

    if (googleApiKey && googleCx) {
      try {
        // 1. Try Google Custom Search API if keys are provided
        const res = await fetch(`https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(googleQuery)}&cx=${googleCx}&key=${googleApiKey}&searchType=image&imgSize=large&imgType=photo&num=5`);
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          // Pick the first result that seems like a photo (filter out logos/icons)
          const photoResult = data.items.find((item: any) => {
              const text = (item.title + ' ' + item.snippet).toLowerCase();
              return !text.includes('logo') && 
                     !text.includes('icon') &&
                     !text.includes('vector') &&
                     !text.includes('clipart') &&
                     !text.includes('map');
          }) || data.items[0];
          
          const imageUrl = photoResult.link;
          imageCache.set(googleQuery, imageUrl);
          return imageUrl;
        }
      } catch (e) {
        console.error("Google Custom Search API error, falling back to Wikimedia:", e);
      }
    }
    failedCache.add(googleQuery);
  }

  try {
    // 2. Try Wikipedia article lead image (usually highest relevance for famous places)
    // Search just for the place name to avoid matching the city's main article
    const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&generator=search&gsrsearch=${encodeURIComponent(placeName)}&gsrlimit=3&origin=*`);
    const wikiData = await wikiRes.json();
    const wikiPages = wikiData?.query?.pages;
    
    if (wikiPages) {
      // Find the first valid image (not an icon or SVG)
      for (const pageId of Object.keys(wikiPages)) {
        const page = wikiPages[pageId];
        const imageUrl = page?.original?.source;
        
        // Ensure the Wikipedia page title is somewhat related to the place name, 
        // to avoid generic city matches if the place name is too broad.
        const titleWords = page.title.toLowerCase().split(' ');
        const placeWords = placeName.toLowerCase().split(' ');
        const hasMatch = placeWords.some(w => w.length > 3 && titleWords.includes(w)) || placeWords.join(' ').includes(page.title.toLowerCase());

        if (hasMatch && imageUrl && !imageUrl.toLowerCase().endsWith('.svg') && !imageUrl.toLowerCase().includes('icon')) {
          imageCache.set(googleQuery, imageUrl);
          return imageUrl;
        }
      }
    }

    // 3. Try Wikimedia Commons search (broader search for images)
    const commonsRes = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(fallbackQuery + " filetype:bitmap")}&gsrlimit=5&prop=imageinfo&iiprop=url&format=json&origin=*`);
    const commonsData = await commonsRes.json();
    const commonsPages = commonsData?.query?.pages;
    
    if (commonsPages) {
      // Find the first valid image
      for (const pageId of Object.keys(commonsPages)) {
        const imageInfo = commonsPages[pageId]?.imageinfo?.[0];
        const imageUrl = imageInfo?.url;
        if (imageUrl && !imageUrl.toLowerCase().endsWith('.svg') && !imageUrl.toLowerCase().endsWith('.gif')) {
          imageCache.set(googleQuery, imageUrl);
          return imageUrl;
        }
      }
    }
  } catch (e) {
    console.error("Image fetch error", e);
  }
  
  // 4. Elegant fallback image using Picsum with a deterministic seed based on the place name
  const seedWords = placeName.split(' ').filter(w => w.length > 3);
  const seed = seedWords.length > 0 ? seedWords[0] : placeName.replace(/[^a-zA-Z0-9]/g, '') || 'travel';
  
  const fallback = `https://picsum.photos/seed/${encodeURIComponent(seed)}/1920/1080?blur=2`;
  imageCache.set(googleQuery, fallback);
  return fallback;
}
