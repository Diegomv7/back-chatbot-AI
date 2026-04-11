import TelegramBot from 'node-telegram-bot-api';
import { crearModeloParaClinica } from '../config/gemini.js';
import supabase from '../config/supabase.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
export const bot = new TelegramBot(token);

// 1. Envolvemos las herramientas en una función que recibe el sello de seguridad (clinic_id)
const getToolsForClinic = (clinic_id) => ({
    registrar_cliente: async (args) => {
        const { telegram_id, nombre, telefono } = args;

        const { data: existe } = await supabase.from('owners')
            .select('id').eq('telegram_id', telegram_id).eq('clinic_id', clinic_id).maybeSingle();

        if (existe) return "El cliente ya está registrado en el sistema.";

        // Mapeamos al inglés para guardar (full_name, phone)
        const { error } = await supabase.from('owners').insert({
            clinic_id: clinic_id,
            telegram_id: telegram_id,
            full_name: nombre,
            phone: telefono || null
        });
        if (error) console.error("❌ Error Supabase (Owner):", error);
        return error ? "Error al guardar el cliente." : `¡Perfecto! El cliente ${nombre} ha sido registrado.`;
    },

    registrar_mascota: async (args) => {
        const { telegram_id, nombre_mascota, especie } = args;

        const { data: dueno } = await supabase.from('owners')
            .select('id').eq('telegram_id', telegram_id).eq('clinic_id', clinic_id).maybeSingle();
        if (!dueno) return "Error: El dueño no está registrado. Pídele su nombre primero.";

        const { data: existente } = await supabase.from('pets')
            .select('id').eq('owner_id', dueno.id).eq('clinic_id', clinic_id).ilike('name', nombre_mascota).limit(1);
        if (existente && existente.length > 0) return `La mascota ${nombre_mascota} ya estaba registrada en la base de datos.`;

        const { error } = await supabase.from('pets').insert({
            clinic_id: clinic_id,
            owner_id: dueno.id,
            name: nombre_mascota,
            species: especie
        });
        if (error) console.error("❌ Error Supabase (Pet):", error);
        return error ? "Error al guardar la mascota." : `La mascota ${nombre_mascota} (${especie}) ha sido registrada en su expediente.`;
    },

    agendar_cita: async (args) => {
        const { telegram_id, nombre_mascota, motivo, fecha_hora_iso } = args;

        const fechaCitaObj = new Date(fecha_hora_iso);
        const horaLocalMX = fechaCitaObj.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Mexico_City' });
        const horaCita = parseInt(horaLocalMX, 10);
        const diaCita = fechaCitaObj.getDay();

        if (diaCita === 0) {
            if (horaCita < 10 || horaCita >= 14) return "ERROR CRÍTICO: El horario los domingos es de 10:00 AM a 2:00 PM.";
        } else {
            if (horaCita < 10 || horaCita >= 20) return "ERROR CRÍTICO: La clínica está cerrada a esa hora. Horario normal: 10:00 AM a 8:00 PM.";
        }

        const { data: dueno } = await supabase.from('owners').select('id').eq('telegram_id', telegram_id).eq('clinic_id', clinic_id).maybeSingle();
        if (!dueno) return "Error: Dueño no encontrado.";

        const { data: mascotas } = await supabase.from('pets').select('id').eq('owner_id', dueno.id).eq('clinic_id', clinic_id).ilike('name', nombre_mascota).limit(1);
        if (!mascotas || mascotas.length === 0) return `Error: No encontré a la mascota ${nombre_mascota}. Pide registrarla primero.`;
        const mascota = mascotas[0];

        const { data: citaExistente } = await supabase.from('appointments')
            .select('id').eq('pet_id', mascota.id).eq('clinic_id', clinic_id).eq('appointment_date', fecha_hora_iso).limit(1);
        if (citaExistente && citaExistente.length > 0) return `Aviso: La cita para ${nombre_mascota} ya estaba agendada previamente para este horario.`;

        // Guardamos en appointments
        const { error } = await supabase.from('appointments').insert({
            clinic_id: clinic_id,
            pet_id: mascota.id,
            appointment_date: fecha_hora_iso,
            reason: motivo
        });
        if (error) console.error("❌ Error Supabase (Appointment):", error);
        return error ? "Error al agendar la cita en la base de datos." : `Cita de ${motivo} agendada exitosamente para ${nombre_mascota}.`;
    },

    consultar_disponibilidad: async (args) => {
        const { fecha_iso } = args;
        const fechaObj = new Date(fecha_iso + 'T12:00:00-06:00');
        const esDomingo = fechaObj.getDay() === 0;
        const horarioAtencion = esDomingo ? "10:00 AM a 2:00 PM" : "10:00 AM a 8:00 PM";

        const inicioDia = `${fecha_iso}T00:00:00-06:00`;
        const finDia = `${fecha_iso}T23:59:59-06:00`;

        const { data: citasDelDia, error } = await supabase.from('appointments')
            .select('appointment_date, status, reason')
            .eq('clinic_id', clinic_id)
            .gte('appointment_date', inicioDia)
            .lte('appointment_date', finDia)
            .neq('status', 'cancelled');

        if (error) return "Error al consultar la base de datos. Pide al usuario que espere.";
        if (!citasDelDia || citasDelDia.length === 0) {
            return `El día ${fecha_iso} está COMPLETAMENTE LIBRE. El horario de atención es de ${horarioAtencion}. Ofrécele cualquier hora.`;
        }

        // Agendas Paralelas: Separamos Baños de Consultas/Vacunas
        const ocupadosPorServicio = { "baño": [], "consulta": [], "vacuna": [] };

        citasDelDia.forEach(cita => {
            const horaLocal = new Date(cita.appointment_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' });
            const motivo = cita.reason ? cita.reason.toLowerCase() : 'otro';

            if (motivo.includes('baño')) ocupadosPorServicio["baño"].push(horaLocal);
            else if (motivo.includes('consulta')) ocupadosPorServicio["consulta"].push(horaLocal);
            else if (motivo.includes('vacuna')) ocupadosPorServicio["vacuna"].push(horaLocal);
            else {
                if (!ocupadosPorServicio[motivo]) ocupadosPorServicio[motivo] = [];
                ocupadosPorServicio[motivo].push(horaLocal);
            }
        });

        let reporte = `Horario de atención: ${horarioAtencion}.\nATENCIÓN - HORARIOS OCUPADOS POR ÁREA para el ${fecha_iso}:\n`;
        for (const [servicio, horas] of Object.entries(ocupadosPorServicio)) {
            if (horas.length > 0) reporte += `- Ocupado en ${servicio.toUpperCase()}: ${horas.join(', ')}\n`;
            else reporte += `- ${servicio.toUpperCase()}: Todo el día libre.\n`;
        }
        reporte += `\nREGLA CRÍTICA: La agenda de Baños es independiente. Si piden Baño a las 1:00 PM y solo hay Consultas a la 1:00 PM, SÍ PUEDES agendar el baño.`;

        return reporte;
    }
});

// 2. Procesamiento Central de Mensajes
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userText = msg.text || "";

    try {
        // --- PASO CLAVE SAAS: Buscar a qué clínica pertenece este Bot ---
        const { data: clinic, error: clinicErr } = await supabase
            .from('clinics')
            .select('*')
            .eq('telegram_token', token)
            .single();

        if (clinicErr || !clinic) {
            console.error("Error: Clínica no encontrada para este token.");
            return bot.sendMessage(chatId, "El sistema está en mantenimiento. Clínica no vinculada.");
        }

        const clinic_id = clinic.id;

        // Obtenemos el historial de la tabla nueva en inglés (chat_history)
        const { data: historialDB, error: errHistorial } = await supabase
            .from('chat_history')
            .select('role, content')
            .eq('chat_id', chatId)
            .eq('clinic_id', clinic_id)
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
                if (historyRaw.length > 0) historyRaw[historyRaw.length - 1].parts[0].text += "\n" + h.content;
            }
        }

        if (historyRaw.length > 0 && historyRaw[historyRaw.length - 1].role === 'user') {
            historyRaw.push({ role: 'model', parts: [{ text: "Entendido." }] });
        }

        // --- CREAMOS EL CEREBRO PARA ESTA CLÍNICA Y SUS HERRAMIENTAS ---
        const modeloDinamico = crearModeloParaClinica(clinic);
        const toolsMultiTenant = getToolsForClinic(clinic_id);

        const chatActivo = modeloDinamico.startChat({
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
                        name: "consultar_disponibilidad",
                        description: "[PASO 3] ÚSALA SIEMPRE ANTES DE AGENDAR. Consulta primero qué horas están libres.",
                        parameters: { type: "OBJECT", properties: { fecha_iso: { type: "STRING", description: "Formato YYYY-MM-DD" } }, required: ["fecha_iso"] }
                    },
                    {
                        name: "agendar_cita",
                        description: "[PASO 4] Agenda la cita. Requiere hora exacta. Si dicen 'después de la otra', calcula la hora final (Baño +60min, Consulta +30min).",
                        parameters: {
                            type: "OBJECT",
                            properties: {
                                telegram_id: { type: "NUMBER" },
                                nombre_mascota: { type: "STRING" },
                                motivo: { type: "STRING", description: "DEBE ser explícito (Ej: Baño, Consulta, Vacuna)." },
                                fecha_hora_iso: { type: "STRING" }
                            },
                            required: ["telegram_id", "nombre_mascota", "motivo", "fecha_hora_iso"]
                        }
                    }
                ]
            }]
        });

        const fechaHoy = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
        const contextoOculto = ` (Contexto: ID Telegram: ${chatId}. Fecha: ${fechaHoy}. REGLAS: Zona horaria UTC-6. CRÍTICO: Asume que las funciones pasadas ya se ejecutaron con éxito. Solo responde al último mensaje.)`;

        let mensajeParaGemini = [];
        let textoAGuardar = userText;

        if (msg.voice) {
            const fileId = msg.voice.file_id;
            const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
            if (!fileRes.ok) throw new Error("Error obteniendo la nota de voz.");
            const fileData = await fileRes.json();
            const audioRes = await fetch(`https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`);

            const arrayBuffer = await audioRes.arrayBuffer();
            textoAGuardar = "[Nota de voz enviada]";
            mensajeParaGemini = [
                { inlineData: { mimeType: msg.voice.mime_type || "audio/ogg", data: Buffer.from(arrayBuffer).toString('base64') } },
                { text: `El usuario envió una nota de voz. Por favor escúchala y actúa.` + contextoOculto }
            ];
        } else if (userText) {
            mensajeParaGemini = [{ text: userText + contextoOculto }];
        }

        const result = await chatActivo.sendMessage(mensajeParaGemini);

        // Guardar historial del usuario
        await supabase.from('chat_history').insert({
            clinic_id: clinic_id,
            chat_id: chatId,
            role: 'user',
            content: textoAGuardar || "Nota de voz"
        });

        const calls = result.response.functionCalls();

        if (calls && calls.length > 0) {
            const functionResponses = [];
            for (const call of calls) {
                // AQUÍ USAMOS LAS HERRAMIENTAS SEGURAS MULTI-TENANT
                const apiResponse = await toolsMultiTenant[call.name](call.args);
                functionResponses.push({ functionResponse: { name: call.name, response: { content: apiResponse } } });
            }
            const finalResult = await chatActivo.sendMessage(functionResponses);

            let textoRespuesta = "";
            try { textoRespuesta = finalResult.response.text(); } catch (e) { textoRespuesta = "¡Listo! Registros actualizados. ✅"; }

            const txtGuardar = textoRespuesta && textoRespuesta.trim() !== "" ? textoRespuesta : "¡Listo! Registro completado con éxito. ✅";

            // Guardar historial del modelo
            await supabase.from('chat_history').insert({ clinic_id: clinic_id, chat_id: chatId, role: 'model', content: txtGuardar });

            if (textoRespuesta && textoRespuesta.trim() !== "") bot.sendMessage(chatId, textoRespuesta);
            else bot.sendMessage(chatId, "¡Listo! Registro completado con éxito. ✅ ¿Te puedo ayudar con algo más?");

        } else {
            const textoDirecto = result.response.text();
            const txtGuardar = textoDirecto && textoDirecto.trim() !== "" ? textoDirecto : "¡Entendido!";

            await supabase.from('chat_history').insert({ clinic_id: clinic_id, chat_id: chatId, role: 'model', content: txtGuardar });

            if (textoDirecto && textoDirecto.trim() !== "") bot.sendMessage(chatId, textoDirecto);
            else bot.sendMessage(chatId, "¡Entendido!");
        }
    } catch (error) {
        console.error("❌ Error General:", error.message);
        bot.sendMessage(chatId, "Tuve un pequeño error procesando tu mensaje. ¿Podrías intentar de nuevo?");
    }
});