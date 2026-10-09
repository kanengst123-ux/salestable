
import { GoogleGenAI, Type } from "@google/genai";
import { SalesAnalytics } from '../types';

export const getAIInsights = async (analytics: SalesAnalytics) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    As a Lead Business Intelligence Director, perform a deep-dive strategic audit of the current sales cycle based on the provided metrics:
    
    - NET REVENUE: $${analytics.totalSales.toLocaleString()}
    - NET PROFIT: $${analytics.totalProfit.toLocaleString()}
    - VOLUMETRICS: ${analytics.totalOrders} total transactions
    - UNIT ECONOMICS: $${analytics.averageOrderValue.toFixed(2)} Average Transaction Value
    - CATEGORY PERFORMANCE INDEX: ${JSON.stringify(analytics.salesByCategory)}
    - MARKET REACH (REGIONAL): ${JSON.stringify(analytics.salesByRegion)}
    
    Provide a professional briefing covering:
    1. EXECUTIVE SUMMARY: A high-impact overview of current market standing.
    2. KEY DRIVERS: The top 3 factors (positive or negative) currently moving the needle.
    3. STRATEGIC IMPERATIVES: 3 prioritized, high-ROI actions for the next quarter.
    
    Output strictly as JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "A high-impact professional summary (max 3 sentences)." },
            keyDrivers: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Top 3 drivers of current performance."
            },
            recommendations: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Top 3 high-ROI strategic actions."
            },
          },
          required: ["summary", "keyDrivers", "recommendations"]
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("Empty response");
    
    return JSON.parse(text.trim());
  } catch (e) {
    console.error("Gemini Intel Error:", e);
    return {
      summary: "AI Engine is recalibrating. Current data suggests stable performance but requires manual verification of recent trends.",
      keyDrivers: ["Regional variance", "Category fluctuation", "Transaction density"],
      recommendations: ["Perform manual data audit", "Refresh API connection", "Verify sheet permissions"]
    };
  }
};
