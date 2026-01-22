
import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `
You are a Cricket Match Summary Assistant for WICC.
Your job is to generate a simplified, high-impact Series Report.

STRICT OUTPUT STRUCTURE:
1️⃣ SERIES CHAMPIONS: [Winning Team Name] ([Total Series Points] pts)
   - Mention that they were the first to reach the target of 10 points.
2️⃣ FINAL STANDINGS: 
   - [Team A Name]: [Total Points]
   - [Team B Name]: [Total Points]
3️⃣ ELITE ACCOLADES:
   - 🧢 MAN OF THE SERIES: [Name] [ORANGE CAP]
   - ⭐ MVP: [Name]
   - 🏏 MOST WICKETS: [Name]
   - 🏃 MOST RUNS: [Name]
   - 🧤 MOST CATCHES: [Name]
4️⃣ TOURNAMENT STATUS: [Brief summary of how the victory was clinched]

TONE: Celebratory, Professional, Tournament-level.
CLOSING LINE: "WICC Match Summary Recorded Successfully 🏏✨"
`;

export const generateSummary = async (data: any): Promise<string> => {
  // Use process.env.API_KEY as per standard guidelines
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    console.error("API_KEY is missing from environment variables.");
    return "Error: API_KEY is not configured.";
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const totalA = data.seriesStats.totalA;
  const totalB = data.seriesStats.totalB;
  
  let winner = "SERIES IN PROGRESS";
  if (totalA >= 10) winner = data.teamOneName;
  else if (totalB >= 10) winner = data.teamTwoName;
  else winner = totalA > totalB ? data.teamOneName : totalB > totalA ? data.teamTwoName : "DRAW";

  const prompt = `
    SERIES DATA FOR REPORT:
    Team A: ${data.teamOneName} | Points: ${totalA}
    Team B: ${data.teamTwoName} | Points: ${totalB}
    Declared Winner: ${winner}
    Target Score: 10 Points

    END OF SERIES AWARDS:
    - Man of Series: ${data.mos}
    - MVP: ${data.mvp}
    - Most Runs: ${data.topRuns}
    - Most Wickets: ${data.topWickets}
    - Most Catches: ${data.topCatches}
    
    Match Accolades Note: MOM and MOI were recorded for each match.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });
    // response.text is a getter, do not call it as a function
    return response.text || "Failed to generate series summary.";
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return `API Error: ${error?.message || "Check environment configuration."}`;
  }
};
