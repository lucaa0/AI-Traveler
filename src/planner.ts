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
      description: string;
      costEstimate: string;
      mapsUrl: string;
      ticketUrl: string;
      imagePrompt: string;
    }[];
  }[];
  tips: string[];
}

export async function generateItinerary(
  params: TravelParams,
  onProgress?: (status: string) => void
): Promise<Itinerary> {
  // Shared state between agents
  const tripContext: any = { params };

  // ==========================================
  // AGENT 1: The Researcher (Destination Expert)
  // ==========================================
  onProgress?.('Destination Expert is researching...');
  const researchPrompt = `You are a Destination Expert. Research ${params.destination} for a ${params.days}-day trip.
Budget: ${params.budget}. Interests: ${params.interests.join(', ')}.
Provide a concise list of top attractions, hidden gems, and local culinary highlights that fit these criteria.`;

  const researchRes = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: researchPrompt,
  });
  tripContext.research = researchRes.text;

  // ==========================================
  // AGENT 2: The Logistician (Planner)
  // ==========================================
  onProgress?.('Logistician is drafting the timeline...');
  const plannerPrompt = `You are a Master Travel Planner. Using the following research, create a highly precise and complete day-by-day itinerary for a trip from ${params.origin} to ${params.destination} starting on ${params.date}.
Research: ${tripContext.research}
Duration: ${params.days} days
Budget: ${params.budget}

Crucial: You MUST include realistic estimated flight times (outbound and return) and estimated flight costs based on the origin and destination. Make the daily activities very detailed with specific times.

Return the itinerary as a structured JSON object containing 'flightDetails' and 'days'.`;

  const plannerRes = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: plannerPrompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
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
                      description: { type: Type.STRING, description: 'Description of the activity' },
                      costEstimate: { type: Type.STRING, description: 'Estimated cost' },
                      mapsUrl: { type: Type.STRING, description: 'Google Maps search URL for this exact place' },
                      ticketUrl: { type: Type.STRING, description: 'URL to buy tickets or official website. Empty string if not applicable.' },
                      imagePrompt: { type: Type.STRING, description: 'A highly detailed, specific prompt for an AI image generator to create a realistic, high-quality travel photography shot of this EXACT location. Must include the specific name of the place, the city, time of day lighting (e.g., golden hour, night illumination), and photographic style (e.g., 8k resolution, DSLR, wide-angle).' }
                    },
                    required: ['time', 'title', 'description', 'costEstimate', 'mapsUrl', 'ticketUrl', 'imagePrompt']
                  }
                }
              },
              required: ['day', 'theme', 'imageKeyword', 'activities']
            }
          }
        },
        required: ['flightDetails', 'days']
      }
    }
  });
  
  let plannerData: any = {};
  try {
    plannerData = JSON.parse(plannerRes.text?.trim() || '{}');
  } catch (e) {
    console.error("Failed to parse planner data:", e, plannerRes.text);
    throw new Error("The AI generated an invalid itinerary format. Please try again.");
  }

  tripContext.flightDetails = plannerData.flightDetails || { outbound: '', return: '', estimatedCost: '' };
  tripContext.days = plannerData.days || [];

  // ==========================================
  // AGENT 3: The Concierge (Local Guide)
  // ==========================================
  onProgress?.('Concierge is adding final tips...');
  const conciergePrompt = `You are a Luxury Travel Concierge. Based on this itinerary for ${params.destination}, provide a short summary of the trip and 4-6 crucial travel tips (packing, etiquette, transport, safety).
Itinerary: ${JSON.stringify(tripContext.days)}
Flight Details: ${JSON.stringify(tripContext.flightDetails)}

Return JSON with 'summary' and 'tips'.`;

  const conciergeRes = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: conciergePrompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: 'A short, elegant summary of the trip' },
          tips: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Helpful travel tips'
          }
        },
        required: ['summary', 'tips']
      }
    }
  });
  
  let conciergeData: any = {};
  try {
    conciergeData = JSON.parse(conciergeRes.text?.trim() || '{}');
  } catch (e) {
    console.error("Failed to parse concierge data:", e, conciergeRes.text);
    throw new Error("The AI generated invalid tips data. Please try again.");
  }

  onProgress?.('Finalizing itinerary...');

  // Combine the results from all agents
  return {
    destination: params.destination,
    country: params.destination.split(',').pop()?.trim() || params.destination, // Simple heuristic for now
    summary: conciergeData.summary || 'A wonderful journey awaits.',
    flightDetails: tripContext.flightDetails,
    days: tripContext.days,
    tips: conciergeData.tips || []
  };
}

const imageCache = new Map<string, string>();

export async function fetchPlaceImage(query: string): Promise<string> {
  if (imageCache.has(query)) {
    return imageCache.get(query)!;
  }

  try {
    // Using Wikipedia/Wikimedia API to get real, free images without requiring an API key
    const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&origin=*`);
    const data = await res.json();
    const pages = data?.query?.pages;
    if (pages) {
      const pageId = Object.keys(pages)[0];
      const imageUrl = pages[pageId]?.original?.source;
      if (imageUrl) {
        imageCache.set(query, imageUrl);
        return imageUrl;
      }
    }
  } catch (e) {
    console.error("Image fetch error", e);
  }
  
  // Elegant fallback image if the specific place is not found on Wikipedia
  const fallback = `https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1920&q=80`;
  imageCache.set(query, fallback);
  return fallback;
}
