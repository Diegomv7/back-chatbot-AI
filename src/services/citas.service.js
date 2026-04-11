import supabase from '../config/supabase.js';

export const obtenerCitas = async () => {
    const { data, error } = await supabase
        .from('appointments')
        .select(`
            id, appointment_date, reason, status,
            pets ( name, species, owners ( full_name, phone ) )
        `)
        .order('appointment_date', { ascending: true });

    if (error) {
        throw new Error(error.message);
    }
    return data;
};

export const cambiarEstadoCita = async (id, nuevoEstado) => {
    const { data, error } = await supabase
        .from('appointments')
        .update({ status: nuevoEstado })
        .eq('id', id)
        .select();

    if (error) {
        throw new Error(error.message);
    }
    return data;
};
