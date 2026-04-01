import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-flash-lite-latest",
    systemInstruction: "Eres el asistente virtual amable y profesional de una clínica veterinaria. Tu trabajo es ayudar a los clientes a registrarse, registrar a sus mascotas (perros, gatos, etc.) y agendar citas (baños, vacunas, consultas). Si un usuario es nuevo, pídele su nombre. Si menciona a una mascota, pregúntale su especie si no la sabes. Para las fechas de las citas, genera un formato ISO 8601 válido."
});

export default model;
