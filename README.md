# Acuasmart Rural

Prototipo web de una aplicación móvil integrada con tecnología IoT para el monitoreo de la calidad del agua y el control de caudal en la piscicultura rural de pequeña escala en Manizales, Caldas.

Proyecto de grado · Ingeniería de Sistemas · Universidad Nacional Abierta y a Distancia (UNAD) · ECBTI.

- Prototipo en Figma: <https://www.figma.com/proto/BkeF7zzD1vX60RYbAy1z2V/Sin-t%C3%ADtulo?node-id=10-2&t=S2SlCjCDw1tggZeP-1>
- Demo en vivo (GitHub Pages): `https://TU-USUARIO.github.io/acuasmart-rural/`

## Qué resuelve

Los piscicultores de la zona rural de Manizales revisan el agua de forma visual y esporádica. Cuando cae el oxígeno disuelto, cambia el pH o se obstruye la bocatoma, se enteran tarde y se pierden peces. Acuasmart propone un nodo IoT (ESP32) en el estanque y una app móvil que muestra las lecturas, guarda el historial, emite alertas tempranas y sugiere qué hacer.

Este repositorio contiene la **versión web interactiva del prototipo**: reproduce las pantallas diseñadas en Figma y simula el comportamiento del nodo para poder demostrarlo sin hardware.

## Pantallas

| Pantalla | Qué hace |
| --- | --- |
| Predio | Registro del productor, vereda, especie (trucha o mojarra), ID del nodo y consentimiento de datos (Ley 1581 de 2012). |
| Monitoreo | Estado general del estanque y cuatro tarjetas con oxígeno disuelto, temperatura, pH y caudal, con código de color verde, amarillo y rojo. |
| Historial | Gráfica por variable en 24 horas, 7 días o 30 días, con las líneas de los límites permitidos y un resumen analítico. |
| Alertas | Alerta activa con acciones recomendadas por prioridad e historial de alertas. |

## Modo demostración

En la pantalla Monitoreo hay un bloque desplegable con tres botones:

- **Simular caída de oxígeno**: el oxígeno baja hasta un nivel crítico, se dispara la alerta y aparecen las recomendaciones.
- **Simular pérdida de señal**: el nodo guarda las lecturas localmente y la app muestra el último dato sincronizado. Al restablecer la conexión se envían las lecturas pendientes (Store-and-Forward).
- **Restablecer valores normales**: el oxígeno vuelve al rango normal y la alerta se marca como resuelta.

## Estructura del proyecto

```
acuasmart-rural/
├── index.html          # Estructura de las 4 pantallas
├── styles/
│   └── styles.css      # Estilos (alto contraste, móvil primero)
├── scripts/
│   ├── config.js       # Variables, especies y umbrales
│   ├── simulator.js    # Simulador del nodo IoT (datos sintéticos)
│   └── app.js          # Lógica: navegación, alertas, historial, modo offline
└── README.md
```

No usa librerías ni dependencias externas: es HTML, CSS y JavaScript puro.

## Cómo ejecutarlo

Localmente, abre `index.html` en el navegador. También puedes servirlo con cualquier servidor estático:

```bash
python -m http.server 8000
# abrir http://localhost:8000
```

## Publicarlo en GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `acuasmart-rural`).
2. Sube los archivos:
   ```bash
   git init
   git add .
   git commit -m "Prototipo web de Acuasmart Rural"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/acuasmart-rural.git
   git push -u origin main
   ```
3. En GitHub ve a **Settings → Pages**, elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`.
4. En unos minutos la página queda disponible en `https://TU-USUARIO.github.io/acuasmart-rural/`.

## Umbrales por especie

Los rangos están en `scripts/config.js`. Cada variable tiene un rango normal (`ok`) y un rango de precaución (`warn`); fuera de este último el estado es crítico.

| Variable | Trucha arcoíris (normal / precaución) | Mojarra (normal / precaución) |
| --- | --- | --- |
| Oxígeno disuelto (mg/L) | ≥ 6,0 / ≥ 5,0 | ≥ 5,0 / ≥ 3,5 |
| Temperatura (°C) | 9–16 / 7–18 | 24–30 / 20–32 |
| pH | 6,5–8,5 / 6,0–9,0 | 6,5–8,5 / 6,0–9,0 |
| Caudal (L/min) | 20–120 / 10–150 | 10–100 / 5–130 |

Son valores de ejemplo para la demostración. Deben ajustarse con los resultados del cuestionario diagnóstico (Anexo A) y con la literatura técnica antes de usarlos en campo.

## Trazabilidad con los requerimientos

| Requerimiento | Estado en este prototipo |
| --- | --- |
| RF03 Registro y configuración de estanques | Implementado en la pantalla Predio; los umbrales se asignan según la especie. |
| RF04 Dashboard en tiempo real | Implementado con código de color; las lecturas simuladas se actualizan cada 3 s. |
| RF05 Registros históricos | Implementado con rangos de 24 h, 7 d y 30 d y líneas de límite. |
| RF06 Alertas de riesgo | Implementado en pantalla (alerta visual, aviso emergente y contador). Las notificaciones push reales requieren backend. |
| RF07 Recomendaciones preventivas | Implementado como reglas por variable y dirección de la desviación. |
| RF02 Respaldo offline del nodo | Simulado con la cola de lecturas pendientes. |
| RNF01 Usabilidad rural | Tipografía grande, botones amplios, lenguaje cotidiano y alto contraste. |
| RNF04 Disponibilidad offline de la app | Parcial: el perfil y las alertas se guardan en el navegador. |
| RF01, RNF02, RNF03, RNF05 | Dependen del hardware, la nube y el cifrado; no aplican a este prototipo web. |

## Limitaciones

- Todas las lecturas son simuladas; no hay conexión con un nodo ESP32 real.
- No hay backend, autenticación ni notificaciones push.
- Los datos se guardan solo en el navegador (`localStorage`).

## Siguientes pasos

1. Firmware del ESP32 con lectura de DS18B20, pH, oxígeno disuelto y caudal (YF-S201), RTC y respaldo en microSD.
2. Backend en Firebase o API REST (Node.js/Python) para ingesta MQTT/HTTPS y reglas de alerta.
3. App multiplataforma (Flutter o React Native) con caché local y notificaciones push.
4. Calibración frente a un medidor multiparámetro patrón y pruebas de usabilidad con los 15 piscicultores de la muestra.

## Privacidad

El prototipo no envía datos a ningún servidor. En la versión con participantes reales, el tratamiento de datos debe cumplir la Ley 1581 de 2012 y el Decreto 1377 de 2013, con consentimiento informado y anonimización de los predios en los informes.

## Autora

Yenny Carolina López López · Asesor: Orlando Gómez Barboza · UNAD, 2026.
