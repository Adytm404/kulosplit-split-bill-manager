
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GEMINI_TEXT_MODEL } from '../constants';
import { GeminiParsedResponse } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("API_KEY environment variable is not set. Gemini API calls will fail.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY! });

const PROMPT_TEXT = `
You are an expert receipt data extractor. Your task is to analyze the provided receipt image and output a single, strictly valid JSON object.

**CRITICAL: The entire response MUST be ONLY this JSON object, starting with '{' and ending with '}'. No other text, comments, markdown, or explanations should precede or follow the JSON object.**

The JSON object must conform to RFC 8259. It must have the following structure and keys. **ONLY use these specified keys. Do NOT include any other keys.**

JSON Structure:
{
  "items": [ 
    // Array of item objects. 
    // EACH item object MUST be followed by a comma if it is NOT the last item in the array.
    // Example of correctly formatted items: { "name": "Item A", ... }, { "name": "Item B", ... }
    { 
      "name": "string", // Item description.
      "quantity": number, // Item quantity. Default to 1 if not specified.
      "price": number    // Total price for this line item (e.g., quantity * unit price).
                         // Ensure all key-value pairs within this item object are comma-separated if multiple.
    }
  ],
  "subtotal": number | null, // Subtotal before tax and fees. Use null if not found.
  "tax": number | null,      // Total tax amount. Use null if not found.
  "serviceFee": number | null, // Total service charge/fee. Use null if not found.
  "total": number | null       // Grand total amount. Use null if not found.
}
Ensure all key-value pairs within the main JSON object are comma-separated.

Detailed field requirements:
- "items": An array of objects.
  - "name": (string) Concise description of the item.
  - "quantity": (number) Quantity. Assume 1 if not stated. Must be a number.
  - "price": (number) Total price for the line item (for the given quantity). Must be a number.
- "subtotal", "tax", "serviceFee", "total": (number or null) These must be numbers if a value is present, otherwise null.

Important formatting rules:
- All monetary values (price, subtotal, tax, serviceFee, total) MUST be numbers (e.g., 25000, not "Rp 25.000" or "25,000"). Do not include currency symbols or thousands separators within the number itself.
- "quantity" MUST be a number.
- All string values (like item names) MUST be enclosed in double quotes.
- Ensure all elements in arrays are comma-separated. Specifically, objects within the "items" array must be separated by commas.
- Ensure all properties in objects are comma-separated.
- **Absolutely no other text, markers, placeholders (e.g., 'regex-json-ignore-next-line', 'attr://...' or similar comments/annotations) should be present anywhere within the JSON text. Specifically, do not insert any non-JSON lines or text between elements of an array or properties of an object.**

Example item for a receipt in Indonesian Rupiah (IDR):
{ "name": "Nasi Goreng Ayam", "quantity": 1, "price": 25000 }

If the image is unclear or data cannot be reliably extracted:
Return a valid JSON object with empty or null values, adhering to the specified structure. For example:
{
  "items": [],
  "subtotal": null,
  "tax": null,
  "serviceFee": null,
  "total": null
}
**Do NOT output malformed JSON or any text outside the JSON object itself.**
`;

export const analyzeReceiptWithGemini = async (
  base64ImageData: string,
  mimeType: string
): Promise<GeminiParsedResponse> => {
  if (!API_KEY) {
    throw new Error("Gemini API Key is not configured.");
  }

  const imagePart = {
    inlineData: {
      mimeType: mimeType,
      data: base64ImageData,
    },
  };

  const textPart = {
    text: PROMPT_TEXT,
  };

  let jsonStr = ''; // Declare here to be accessible in catch block

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: "application/json", // Request JSON directly
      },
    });
    
    jsonStr = response.text.trim();
    // Attempt to remove markdown fences if they still appear despite responseMimeType
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }

    if (!jsonStr) {
        console.error("Gemini response text was empty or became empty after processing fences.");
        throw new Error("Received an empty response from the AI after processing. The receipt might be unreadable.");
    }

    const parsedData = JSON.parse(jsonStr) as GeminiParsedResponse;

    // Basic validation and type coercion
    const validatedItems = (parsedData.items || []).map(item => ({ // Ensure items array exists
      id: crypto.randomUUID(), // Add id here as it's used in the app
      name: String(item.name || "Unknown Item"),
      quantity: Number(item.quantity) || 1,
      price: Number(item.price) || 0,
    }));

    return {
      items: validatedItems,
      tax: parsedData.tax !== null && !isNaN(Number(parsedData.tax)) ? Number(parsedData.tax) : 0,
      serviceFee: parsedData.serviceFee !== null && !isNaN(Number(parsedData.serviceFee)) ? Number(parsedData.serviceFee) : 0,
      subtotal: parsedData.subtotal !== null && !isNaN(Number(parsedData.subtotal)) ? Number(parsedData.subtotal) : null,
      total: parsedData.total !== null && !isNaN(Number(parsedData.total)) ? Number(parsedData.total) : null,
    };

  } catch (error) {
    console.error("Error analyzing receipt with Gemini:", error);
    
    if (error instanceof SyntaxError) {
        console.error("Problematic JSON string that failed to parse:", jsonStr); // Log the problematic string
        throw new Error("The AI couldn't understand the receipt's structure as expected. Please try with a clearer image or a different receipt. (Details: Malformed JSON response from AI)");
    }
    
    if (error instanceof Error) {
        // Log the original JSON string for other Gemini related errors too if available
        if (jsonStr) {
            console.error("JSON string from AI (may or may not be the cause of non-SyntaxError):", jsonStr);
        }
        throw new Error(`Gemini API Error: ${error.message}`);
    }
    throw new Error("An unknown error occurred while analyzing the receipt.");
  }
};
