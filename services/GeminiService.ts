
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GEMINI_MODEL_NAME } from '../constants';

// Ensure API_KEY is set in the environment.
// The user of this component is responsible for setting this.
const API_KEY = process.env.API_KEY;

let ai: GoogleGenAI | null = null;
if (API_KEY) {
    ai = new GoogleGenAI({ apiKey: API_KEY });
} else {
    console.warn("API_KEY for Gemini is not set. Patch Helper will not work.");
}

export const getPatchSuggestion = async (soundDescription: string): Promise<string> => {
    if (!ai) {
        return "Gemini API key not configured. Please set the API_KEY environment variable.";
    }
    if (!soundDescription.trim()) {
        return "Please describe the sound you want.";
    }

    const prompt = `You are a Minimoog Model D patch assistant. The user wants a sound like: "${soundDescription}". 
Describe the Minimoog Model D settings to achieve this sound. Focus on key parameters for Oscillators (1, 2, 3 - waveform, octave, level, tuning if applicable), Mixer levels, Filter (cutoff, emphasis/resonance, contour amount, keyboard control), and Envelopes (Loudness Contour Attack/Decay/Sustain, Filter Contour Attack/Decay/Sustain). Be concise and provide settings as a list or clear sections. Example values: Osc1 Sawtooth, 16', Level 7. Filter Cutoff 5, Emphasis 3.`;

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: GEMINI_MODEL_NAME,
            contents: prompt,
        });
        
        return response.text;
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        if (error instanceof Error) {
             // Check for specific Gemini API error details if available
            const errDetails = (error as any)?.message || error.toString();
            if (errDetails.includes("API key not valid")) {
                 return "Gemini API key is not valid. Please check your API_KEY environment variable.";
            }
             return `Error from Gemini: ${errDetails}`;
        }
        return "An unknown error occurred while fetching patch suggestion.";
    }
};
