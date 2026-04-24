import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
(async () => {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: "Test" }],
      model: "gemma2-9b-it",
    });
    console.log("Success:", chatCompletion.choices[0]?.message?.content);
  } catch (err) {
    console.error("Groq Error:", err.message);
  }
})();
