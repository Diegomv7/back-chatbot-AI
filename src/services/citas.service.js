import supabase from '../config/supabase.js';

export const obtenerCitas = async () => {
    const { data, error } = await supabase
        .from('citas')
        .select(`
            id, fecha_hora, motivo, estado,
            mascotas ( nombre, especie, duenos ( nombre, telefono ) )
        `)
        .order('fecha_hora', { ascending: true });

    if (error) {
        throw new Error(error.message);
    }
    return data;
};

export const cambiarEstadoCita = async (id, nuevoEstado) => {
    const { data, error } = await supabase
        .from('citas')
        .update({ estado: nuevoEstado })
        .eq('id', id)
        .select();

    if (error) {
        throw new Error(error.message);
    }
    return data;
};
