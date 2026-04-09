import TelegramBot from 'node-telegram-bot-api';
import model from '../config/gemini.js';
import supabase from '../config/supabase.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
export const bot = new TelegramBot(token);

const tools = {
    registrar_cliente: async (args) => {
        const { telegram_id, nombre, telefono } = args;
        const { data: existe } = await supabase.from('duenos').select('id').eq('telegram_id', telegram_id).maybeSingle();
        if (existe) return "El cliente ya está registrado en el sistema.";

        const { error } = await supabase.from('duenos').insert({ telegram_id, nombre, telefono: telefono || null });
        if (error) console.error("❌ Error Supabase (Dueño):", error);
        return error ? "Error al guardar el cliente." : `¡Perfecto! El cliente ${nombre} ha sido registrado.`;
    },
    registrar_mascota: async (args) => {
        const { telegram_id, nombre_mascota, especie } = args;
        const { data: dueno } = await supabase.from('duenos').select('id').eq('telegram_id', telegram_id).maybeSingle();
        if (!dueno) return "Error: El dueño no está registrado. Pídele su nombre primero.";

        const { data: existente } = await supabase.from('mascotas').select('id').eq('dueno_id', dueno.id).ilike('nombre', nombre_mascota).limit(1);
        if (existente && existente.length > 0) return `La mascota ${nombre_mascota} ya estaba registrada en la base de datos.`;

        const { error } = await supabase.from('mascotas').insert({ dueno_id: dueno.id, nombre: nombre_mascota, especie: especie });
        if (error) console.error("❌ Error Supabase (Mascota):", error);
        return error ? "Error al guardar la mascota." : `La mascota ${nombre_mascota} (${especie}) ha sido registrada en su expediente.`;
    },
    agendar_cita: async (args) => {
        const { telegram_id, nombre_mascota, motivo, fecha_hora_iso } = args;
        const { data: dueno } = await supabase.from('duenos').select('id').eq('telegram_id', telegram_id).maybeSingle();
        if (!dueno) return "Error: Dueño no encontrado.";

        const { data: mascotas } = await supabase.from('mascotas').select('id').eq('dueno_id', dueno.id).ilike('nombre', nombre_mascota).limit(1);
        if (!mascotas || mascotas.length === 0) return `Error: No encontré a la mascota ${nombre_mascota}. Pide registrarla primero.`;
        const mascota = mascotas[0];

        const { data: citaExistente } = await supabase.from('citas')
            .select('id')
            .eq('mascota_id', mascota.id)
            .eq('fecha_hora', fecha_hora_iso)
            .limit(1);

        if (citaExistente && citaExistente.length > 0) {
            return `Aviso: La cita para ${nombre_mascota} ya estaba agendada previamente para este horario.`;
        }

        const { error } = await supabase.from('citas').insert({ mascota_id: mascota.id, fecha_hora: fecha_hora_iso, motivo: motivo });
        if (error) console.error("❌ Error Supabase (Cita):", error);
        return error ? "Error al agendar la cita en la base de datos." : `Cita de ${motivo} agendada exitosamente para ${nombre_mascota}.`;
    }
};

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userText = msg.text || "";

    try {
        const { data: historialDB, error: errHistorial } = await supabase
            .from('historial_chat')
            .select('role, content')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true })
            .limit(20);

        if (errHistorial) console.error("Error obteniendo historial", errHistorial);

        const historyRaw = [];
        let lastRole = null;
        for (const h of (historialDB || [])) {
            if (h.role !== lastRole) {
                historyRaw.push({ role: h.role, parts: [{ text: h.content }] });
                lastRole = h.role;
            } else {
                if (historyRaw.length > 0) {
                    historyRaw[historyRaw.length - 1].parts[0].text += "\n" + h.content;
                }
            }
        }

        if (historyRaw.length > 0 && historyRaw[historyRaw.length - 1].role === 'user') {
            historyRaw.push({ role: 'model', parts: [{ text: "Entendido." }] });
        }

        const chatActivo = model.startChat({
            history: historyRaw,
            tools: [{
                functionDeclarations: [
                    {
                        name: "registrar_cliente",
                        description: "[PASO 1] Ejecuta esto INMEDIATAMENTE DESPUÉS de que el usuario te escriba su nombre completo.",
                        parameters: { type: "OBJECT", properties: { telegram_id: { type: "NUMBER" }, nombre: { type: "STRING" }, telefono: { type: "STRING" } }, required: ["telegram_id", "nombre"] }
                    },
                    {
                        name: "registrar_mascota",
                        description: "[PASO 2] Ejecuta esto SOLO si ya registraste al cliente Y el usuario ya te dijo el nombre de la mascota y su especie.",
                        parameters: { type: "OBJECT", properties: { telegram_id: { type: "NUMBER" }, nombre_mascota: { type: "STRING" }, especie: { type: "STRING" } }, required: ["telegram_id", "nombre_mascota", "especie"] }
                    },
                    {
                        name: "agendar_cita",
                        description: "[PASO 3] Agenda la cita médica. NUNCA la uses si faltan datos. REQUIERE que el usuario te haya dado explícitamente el motivo, y la fecha y hora exacta.",
                        parameters: { type: "OBJECT", properties: { telegram_id: { type: "NUMBER" }, nombre_mascota: { type: "STRING" }, motivo: { type: "STRING", description: "Ej: Baño, Consulta" }, fecha_hora_iso: { type: "STRING", description: "Fecha y hora en formato ISO 8601" } }, required: ["telegram_id", "nombre_mascota", "motivo", "fecha_hora_iso"] }
                    }
                ]
            }]
        });

        const fechaHoy = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
        const contextoOculto = ` (Contexto: ID Telegram: ${chatId}. Fecha local: ${fechaHoy}. REGLAS ESTRICTAS: 1. Zona horaria de citas UTC-6 (ej: 2026-04-01T14:00:00-06:00). 2. CRÍTICO: Tu memoria histórica solo contiene texto, NO contiene el registro de las funciones que llamaste antes. Por ende, ASUME QUE CUALQUIER TAREA PASADA YA FUE EJECUTADA CON ÉXITO. NUNCA vuelvas a llamar "agendar_cita" o "registrar_mascota" para mascotas/citas que ya atendiste en mensajes anteriores. Responde y ejecuta tareas ÚNICAMENTE del último mensaje que te envió el usuario.)`;

        let mensajeParaGemini = [];
        let textoAGuardar = userText;

        if (msg.voice) {
            const fileId = msg.voice.file_id;
            const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
            if (!fileRes.ok) throw new Error("Error fetching voice note file from Telegram.");
            const fileData = await fileRes.json();
            const audioRes = await fetch(`https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`);
            if (!audioRes.ok) throw new Error("Error downloading voice note from Telegram.");

            const arrayBuffer = await audioRes.arrayBuffer();
            textoAGuardar = "[Nota de voz enviada]";
            mensajeParaGemini = [
                { inlineData: { mimeType: msg.voice.mime_type || "audio/ogg", data: Buffer.from(arrayBuffer).toString('base64') } },
                { text: `El usuario envió una nota de voz. Por favor escúchala atenta y cuidadosamente y actúa en consecuencia.` + contextoOculto }
            ];
        } else if (userText) {
            mensajeParaGemini = [{ text: userText + contextoOculto }];
        } else {
            return bot.sendMessage(chatId, "Por ahora solo entiendo mensajes de texto y notas de voz. 🐶");
        }

        const result = await chatActivo.sendMessage(mensajeParaGemini);

        await supabase.from('historial_chat').insert({
            chat_id: chatId,
            role: 'user',
            content: textoAGuardar || "Nota de voz"
        });

        const calls = result.response.functionCalls();

        if (calls && calls.length > 0) {
            const functionResponses = [];
            for (const call of calls) {
                const apiResponse = await tools[call.name](call.args);
                functionResponses.push({ functionResponse: { name: call.name, response: { content: apiResponse } } });
            }
            const finalResult = await chatActivo.sendMessage(functionResponses);
            const calls2 = finalResult.response.functionCalls();
            let textoRespuesta = "";
            if (calls2 && calls2.length > 0) {
                textoRespuesta = "¡Múltiples acciones ejecutadas internamente con éxito! ✅";
            } else {
                try { textoRespuesta = finalResult.response.text(); } catch (e) { textoRespuesta = "Hecho."; }
            }

            const txtGuardar = textoRespuesta && textoRespuesta.trim() !== "" ? textoRespuesta : "¡Listo! Registro completado con éxito. ✅";
            await supabase.from('historial_chat').insert({ chat_id: chatId, role: 'model', content: txtGuardar });

            if (textoRespuesta && textoRespuesta.trim() !== "") {
                bot.sendMessage(chatId, textoRespuesta);
            } else {
                bot.sendMessage(chatId, "¡Listo! Registro completado con éxito. ✅ ¿Te puedo ayudar con algo más?");
            }
        } else {
            const textoDirecto = result.response.text();
            const txtGuardar = textoDirecto && textoDirecto.trim() !== "" ? textoDirecto : "¡Entendido!";

            await supabase.from('historial_chat').insert({ chat_id: chatId, role: 'model', content: txtGuardar });

            if (textoDirecto && textoDirecto.trim() !== "") {
                bot.sendMessage(chatId, textoDirecto);
            } else {
                bot.sendMessage(chatId, "¡Entendido!");
            }
        }
    } catch (error) {
        console.error("❌ Error:", error.message);
        bot.sendMessage(chatId, "Tuve un pequeño error procesando tu mensaje. ¿Podrías intentar de nuevo?");
    }
});
