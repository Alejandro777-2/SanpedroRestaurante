import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { type Platillo } from '../types';

export default function Menu() {
  const [platillos, setPlatillos] = useState<Platillo[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function obtenerMenu() {
      try {
        // Hacemos la consulta a la tabla 'platillos'
        const { data, error } = await supabase
          .from('platillos')
          .select('*')
          .eq('platilloDisponible', true); // Solo traemos los que estén disponibles

        if (error) throw error;

        setPlatillos(data || []);
      } catch (err: any) {
        console.error('Error cargando el menú:', err);
        setError(err.message);
      } finally {
        setCargando(false);
      }
    }

    obtenerMenu();
  }, []);

  if (cargando) return <p style={{ textAlign: 'center', padding: '2rem' }}>Cargando el delicioso menú...</p>;
  if (error) return <p style={{ color: 'red', textAlign: 'center' }}>Hubo un error: {error}</p>;

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>Nuestro Menú</h1>
      
      {platillos.length === 0 ? (
        <p style={{ textAlign: 'center' }}>No hay platillos disponibles en este momento.</p>
      ) : (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
          gap: '1.5rem' 
        }}>
          {platillos.map((platillo) => (
            <div 
              key={platillo.platilloId} 
              style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '1rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <h3 style={{ margin: '0 0 0.5rem 0' }}>{platillo.platilloNombre}</h3>
                <p style={{ fontSize: '0.9rem', color: '#666', minHeight: '50px' }}>
                  {platillo.platilloDescripcion || 'Sin descripción disponible.'}
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#2e7d32' }}>
                  ${Number(platillo.platilloPrecio).toFixed(2)}
                </span>
                <span style={{ fontSize: '0.8rem', backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                  {platillo.platilloCategoria}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}