# Hoenn Lab

Sitio web educativo para explorar los Pokémon introducidos en la tercera generación (Pokédex Nacional #252–#386) y crear un equipo de hasta seis integrantes.

## Ejecutar

Abre `index.html` en un navegador o sírvelo con una extensión de servidor local de VS Code. La página necesita conexión a internet para cargar Bootstrap, las fuentes y los datos de PokéAPI.

## Funciones

- Consulta y visualización de Pokémon, imágenes, tipos, habilidades y estadísticas.
- Búsqueda por nombre o número, y filtros por tipo y rol sugerido.
- Ficha ampliada de estadísticas y medidas.
- Hasta cinco equipos con nombre; puedes crear, seleccionar, renombrar y borrar equipos. Cada equipo guarda hasta seis integrantes por separado en el navegador.
- Calificación de balance basada en el promedio de cada stat del equipo y su percentil frente a los Pokémon de tercera generación.
- Penalización de hasta 24 puntos por tipos repetidos, incluida en la nota y en las recomendaciones de sustitución.
- Botón del planificador para abrir un informe sin puntaje: ordena las stats de mayor a menor y muestra únicamente los tipos repetidos con su recuento.
- Prioridades Baja/Normal/Alta configurables (metas P50/P75/P90) y recomendaciones de sustitución que redistribuyen stats sin aumentar el total base del integrante que sale; se pueden aplicar con un botón.
- Caché local de datos para reducir consultas repetidas a la API.

La calificación compara estadísticas base y diversidad de tipos; resta 4 puntos por cada tipo duplicado adicional, hasta un máximo de 24. No simula combates ni considera movimientos, habilidades, naturalezas o efectividad de tipos. Las prioridades del análisis también se guardan localmente. Las recomendaciones buscan una redistribución de estadísticas y tipos: el Pokémon que entra no puede superar el total de stats base del integrante que sale.

## API

Los datos vienen de [PokéAPI](https://pokeapi.co/), en particular del endpoint `https://pokeapi.co/api/v2/pokemon/{id}`. La app solicita los números del 252 al 386.
