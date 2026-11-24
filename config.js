/* Acuasmart Rural · configuración
   Umbrales por especie. Son valores de ejemplo: deben ajustarse con los
   resultados del diagnóstico (Anexo A) y la literatura técnica.
   Formato: [mínimo, máximo]; null = sin límite en ese extremo.
   ok   = rango normal (verde)
   warn = rango de precaución (amarillo); fuera de este rango = crítico (rojo) */
(function () {
  'use strict';

  window.ACUA_CONFIG = {
    vars: {
      od:   { label: 'Oxígeno disuelto', short: 'Oxígeno', unit: 'mg/L',  decimals: 1 },
      temp: { label: 'Temperatura',      short: 'Temperatura', unit: '°C', decimals: 1 },
      ph:   { label: 'pH',               short: 'pH',     unit: '',      decimals: 1 },
      flow: { label: 'Caudal de ingreso', short: 'Caudal', unit: 'L/min', decimals: 0 }
    },

    species: {
      trucha: {
        name: 'Trucha arcoíris',
        ranges: {
          od:   { ok: [6.0, null], warn: [5.0, null] },
          temp: { ok: [9, 16],     warn: [7, 18] },
          ph:   { ok: [6.5, 8.5],  warn: [6.0, 9.0] },
          flow: { ok: [20, 120],   warn: [10, 150] }
        },
        base: { od: 7.4, temp: 13, ph: 7.4, flow: 48 }
      },
      mojarra: {
        name: 'Mojarra',
        ranges: {
          od:   { ok: [5.0, null], warn: [3.5, null] },
          temp: { ok: [24, 30],    warn: [20, 32] },
          ph:   { ok: [6.5, 8.5],  warn: [6.0, 9.0] },
          flow: { ok: [10, 100],   warn: [5, 130] }
        },
        base: { od: 6.2, temp: 27, ph: 7.6, flow: 32 }
      }
    },

    // Escenario de demostración: oxígeno cae por debajo del umbral crítico
    hypoxiaTarget: { trucha: 4.6, mojarra: 3.0 },

    tickMs: 3000,          // intervalo de lectura simulada del nodo
    historyHours: 720,     // 30 días de historial sintético
    maxHistoryPoints: 4000,
    maxAlerts: 50
  };
})();
