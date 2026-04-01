import dotenv from 'dotenv';
dotenv.config();

async function checkModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  // Endpoint directo de la API REST de Google
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    console.log("Modelos disponibles que soportan generación de texto:\n");
    
    // Filtramos solo los que sirven para chatear/generar contenido
    const validModels = data.models.filter(m => 
      m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
    );
    
    validModels.forEach(m => {
      // Limpiamos el texto para que solo te dé el nombre exacto que necesitas
      console.log(`-> ${m.name.replace('models/', '')}`);
    });
    
  } catch (error) {
    console.error("Error consultando a Google:", error);
  }
}

checkModels();