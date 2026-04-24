import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
(async () => {
  try {
    const models = await groq.models.list();
    console.log(models.data.map(m => m.id).join(", "));
  } catch (err) {
    console.error("Groq Error:", err.message);
  }
})();
